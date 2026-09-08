// Every real, read-only academic view a Parent sees for one child: current
// section/offerings, Attendance calendar, Report Card (Results), Exams
// schedule, Subjects + syllabus progress, Current Term (subject list +
// per-subject Materials/Lesson-Plans/Homework), Timetable, Calendar. All
// against tables already real and already populated -- nothing here is a
// new table. Every query takes a studentId directly; the caller (service
// layer) is what checks a real ACTIVE guardian_link first.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';
import { personPhotoPublicUrlSql } from '../../../infrastructure/storage/public-photo-url.util';

export interface CurrentSection {
  sectionId: string;
  gradeId: string;
  gradeName: string;
  sectionName: string;
  stage: string;
}

export interface StudentOffering {
  subjectOfferingId: string;
  subjectId: string;
  subjectName: string;
  teacherName: string | null;
  weeklyPeriods: number | null;
}

@Injectable()
export class ParentAcademicRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getCurrentSection(studentId: string, executor: Queryable = this.postgres): Promise<CurrentSection | null> {
    const { rows } = await executor.query(
      `SELECT sec.id AS section_id, g.id AS grade_id, g.name AS grade_name, sec.name AS section_name, g.stage
       FROM student_enrolment se
       JOIN section sec ON sec.id = se.section_id
       JOIN grade g ON g.id = sec.grade_id
       WHERE se.student_id = $1 AND se.status = 'ACTIVE'
         AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)`,
      [studentId],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return { sectionId: r.section_id, gradeId: r.grade_id, gradeName: r.grade_name, sectionName: r.section_name, stage: r.stage };
  }

  async getCurrentOfferings(studentId: string, executor: Queryable = this.postgres): Promise<StudentOffering[]> {
    const { rows } = await executor.query(
      `SELECT so.id AS subject_offering_id, subj.id AS subject_id, subj.name AS subject_name, so.weekly_periods,
              (p.first_name || COALESCE(' ' || p.last_name, '')) AS teacher_name
       FROM student_enrolment se
       JOIN subject_offering so ON so.section_id = se.section_id AND so.status = 'ACTIVE'
       JOIN subject subj ON subj.id = so.subject_id
       LEFT JOIN staff st ON st.id = so.teacher_staff_id AND st.status = 'ACTIVE'
       LEFT JOIN person p ON p.id = st.person_id
       WHERE se.student_id = $1 AND se.status = 'ACTIVE'
         AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       ORDER BY subj.name`,
      [studentId],
    );
    return rows.map((r: any) => ({
      subjectOfferingId: r.subject_offering_id,
      subjectId: r.subject_id,
      subjectName: r.subject_name,
      teacherName: r.teacher_name,
      weeklyPeriods: r.weekly_periods,
    }));
  }

  /** Every student has their own real person row (login or not) -- Library/
   * Health/Feedback all resolve real per-person tables (library_member,
   * health_profile) via the CHILD's own person_id, never the parent's. */
  async getPersonId(studentId: string, executor: Queryable = this.postgres): Promise<string | null> {
    const { rows } = await executor.query(`SELECT person_id FROM student WHERE id = $1`, [studentId]);
    return rows.length ? rows[0].person_id : null;
  }

  /** Full Profile screen: real name/DOB/photo (person), admission_no/blood_group
   * (student), current grade/section/medium/roll_no (student_enrolment) --
   * everything the design's own Profile screen shows except bus route (that's
   * ParentBusRepository's own job, a separate real table chain). */
  async getProfile(studentId: string, executor: Queryable = this.postgres) {
    const { rows } = await executor.query(
      `SELECT per.first_name, per.last_name, per.date_of_birth, per.gender,
              ${personPhotoPublicUrlSql('per.photo_object_key')} AS photo_url,
              s.admission_no, s.blood_group,
              g.name AS grade_name, sec.name AS section_name, m.name AS medium_name, se.roll_no
       FROM student s
       JOIN person per ON per.id = s.person_id
       LEFT JOIN medium m ON m.id = s.medium_id
       LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
         AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       LEFT JOIN section sec ON sec.id = se.section_id
       LEFT JOIN grade g ON g.id = sec.grade_id
       WHERE s.id = $1`,
      [studentId],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      firstName: r.first_name,
      lastName: r.last_name,
      dateOfBirth: r.date_of_birth,
      gender: r.gender,
      photoUrl: r.photo_url,
      admissionNo: r.admission_no,
      bloodGroup: r.blood_group,
      gradeName: r.grade_name,
      sectionName: r.section_name,
      mediumName: r.medium_name,
      rollNo: r.roll_no,
    };
  }

  // ============================================================
  // Attendance -- session/record, already real, scoped by this one student's
  // own record rows directly rather than by section+advisor like Faculty's
  // own marking screen (a Parent never marks, only ever reads).
  // ============================================================

  async findMonthAttendance(
    studentId: string,
    monthStart: string,
    monthEnd: string,
    executor: Queryable = this.postgres,
  ): Promise<{ date: string; status: string }[]> {
    const { rows } = await executor.query(
      `SELECT ases.session_date AS date, arec.status
       FROM attendance_record arec
       JOIN attendance_session ases ON ases.id = arec.session_id
       WHERE arec.student_id = $1 AND ases.session_date BETWEEN $2 AND $3
       ORDER BY ases.session_date`,
      [studentId, monthStart, monthEnd],
    );
    return rows.map((r: any) => ({ date: r.date, status: r.status }));
  }

  // ============================================================
  // Results (Report Card) -- gated exactly like Faculty's own Subject
  // Records/Class Results: exam.state='PUBLISHED' AND mark.state IN
  // ('VERIFIED','PUBLISHED') -- a draft/entered-only mark never reaches here.
  // ============================================================

  async findPublishedExamsForSection(sectionId: string, executor: Queryable = this.postgres) {
    const { rows } = await executor.query(
      `SELECT DISTINCT e.id AS exam_id, e.name AS exam_name, e.exam_type, e.term, e.created_at
       FROM exam e
       JOIN exam_subject es ON es.exam_id = e.id
       JOIN subject_offering so ON so.id = es.subject_offering_id
       WHERE so.section_id = $1 AND e.state = 'PUBLISHED'
       ORDER BY e.created_at DESC`,
      [sectionId],
    );
    return rows.map((r: any) => ({ examId: r.exam_id, examName: r.exam_name, examType: r.exam_type, term: r.term }));
  }

  async findResultsForStudent(studentId: string, examId: string, executor: Queryable = this.postgres) {
    const { rows } = await executor.query(
      `SELECT subj.name AS subject_name, es.max_marks, m.marks_obtained, m.is_absent
       FROM student_enrolment se
       JOIN subject_offering so ON so.section_id = se.section_id AND so.status = 'ACTIVE'
       JOIN subject subj ON subj.id = so.subject_id
       JOIN exam_subject es ON es.subject_offering_id = so.id AND es.exam_id = $2
       LEFT JOIN mark m ON m.exam_subject_id = es.id AND m.student_id = se.student_id AND m.state IN ('VERIFIED', 'PUBLISHED')
       WHERE se.student_id = $1 AND se.status = 'ACTIVE'
         AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       ORDER BY subj.name`,
      [studentId, examId],
    );
    return rows.map((r: any) => ({
      subjectName: r.subject_name,
      maxMarks: Number(r.max_marks),
      marksObtained: r.marks_obtained === null ? null : Number(r.marks_obtained),
      isAbsent: r.is_absent ?? false,
    }));
  }

  // ============================================================
  // Exams -- schedule/hall-ticket, visible once the exam is at least
  // SCHEDULED (a still-DRAFT exam has no real date/room to show yet).
  // ============================================================

  async findExamScheduleForStudent(studentId: string, executor: Queryable = this.postgres) {
    const { rows } = await executor.query(
      `SELECT es.id AS exam_subject_id, e.name AS exam_name, subj.name AS subject_name,
              es.exam_date, es.start_time, es.duration_minutes, es.room, es.max_marks
       FROM student_enrolment se
       JOIN subject_offering so ON so.section_id = se.section_id AND so.status = 'ACTIVE'
       JOIN subject subj ON subj.id = so.subject_id
       JOIN exam_subject es ON es.subject_offering_id = so.id
       JOIN exam e ON e.id = es.exam_id AND e.state NOT IN ('DRAFT')
       WHERE se.student_id = $1 AND se.status = 'ACTIVE'
         AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       ORDER BY es.exam_date NULLS LAST, es.start_time`,
      [studentId],
    );
    return rows.map((r: any) => ({
      examSubjectId: r.exam_subject_id,
      examName: r.exam_name,
      subjectName: r.subject_name,
      examDate: r.exam_date,
      startTime: r.start_time,
      durationMinutes: r.duration_minutes,
      room: r.room,
      maxMarks: Number(r.max_marks),
    }));
  }

  // ============================================================
  // Subjects + syllabus progress
  // ============================================================

  async findSyllabusProgress(subjectId: string, gradeId: string, subjectOfferingId: string, executor: Queryable = this.postgres): Promise<number> {
    const { rows } = await executor.query(
      `SELECT count(*) FILTER (WHERE sp.status = 'COMPLETED') AS done, count(su.id) AS total
       FROM syllabus_unit su
       LEFT JOIN syllabus_progress sp ON sp.syllabus_unit_id = su.id AND sp.subject_offering_id = $3
       WHERE su.subject_id = $1 AND su.grade_id = $2`,
      [subjectId, gradeId, subjectOfferingId],
    );
    const done = Number(rows[0]?.done ?? 0);
    const total = Number(rows[0]?.total ?? 0);
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }

  // ============================================================
  // Subject Detail -- real LMS folders shared to this exact offering, real
  // lesson plans, and a homework preview -- all already-real tables the
  // Faculty LMS/Homework modules themselves write to.
  // ============================================================

  async findSharedFolders(subjectOfferingId: string, executor: Queryable = this.postgres) {
    const { rows } = await executor.query(
      `SELECT f.id, f.title, f.description,
              (SELECT count(*) FROM lms_file lf WHERE lf.folder_id = f.id) AS file_count
       FROM lms_folder_share s
       JOIN lms_folder f ON f.id = s.folder_id
       WHERE s.subject_offering_id = $1
       ORDER BY f.title`,
      [subjectOfferingId],
    );
    return rows.map((r: any) => ({ id: r.id, title: r.title, description: r.description, fileCount: Number(r.file_count) }));
  }

  async findFolderFiles(folderId: string, subjectOfferingId: string, executor: Queryable = this.postgres) {
    const { rows } = await executor.query(
      `SELECT lf.id, lf.file_name, lf.object_key, lf.mime_type, lf.size_bytes, lf.uploaded_at
       FROM lms_file lf
       JOIN lms_folder_share s ON s.folder_id = lf.folder_id AND s.subject_offering_id = $2
       WHERE lf.folder_id = $1
       ORDER BY lf.uploaded_at DESC`,
      [folderId, subjectOfferingId],
    );
    return rows.map((r: any) => ({
      id: r.id,
      fileName: r.file_name,
      objectKey: r.object_key,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      uploadedAt: r.uploaded_at,
    }));
  }

  /** Confirms this exact file's own folder is genuinely still shared to this
   * offering before ever handing back an object key -- a folder's share list
   * can change at any time (see the Faculty LMS module's own edit flow), so
   * this is re-checked fresh on every request, never cached. */
  async findSharedFile(fileId: string, subjectOfferingId: string, executor: Queryable = this.postgres): Promise<{ objectKey: string; fileName: string } | null> {
    const { rows } = await executor.query(
      `SELECT lf.object_key, lf.file_name
       FROM lms_file lf
       JOIN lms_folder_share s ON s.folder_id = lf.folder_id AND s.subject_offering_id = $2
       WHERE lf.id = $1`,
      [fileId, subjectOfferingId],
    );
    return rows.length ? { objectKey: rows[0].object_key, fileName: rows[0].file_name } : null;
  }

  async findLessonPlans(subjectOfferingId: string, executor: Queryable = this.postgres) {
    const { rows } = await executor.query(
      `SELECT id, title, content, week_start FROM lms_lesson_plan WHERE subject_offering_id = $1 ORDER BY week_start NULLS LAST, created_at DESC`,
      [subjectOfferingId],
    );
    return rows.map((r: any) => ({ id: r.id, title: r.title, content: r.content, weekStart: r.week_start }));
  }

  // ============================================================
  // Timetable -- real, published (is_draft = false) slots for the
  // student's own section.
  // ============================================================

  async findTimetableForSection(sectionId: string, stage: string, executor: Queryable = this.postgres) {
    const [{ rows: periods }, { rows: slots }] = await Promise.all([
      executor.query(
        `SELECT id, period_no, label, start_time, end_time, is_break
         FROM timetable_period WHERE applies_to_stage = $1 OR applies_to_stage IS NULL ORDER BY period_no`,
        [stage],
      ),
      executor.query(
        `SELECT ts.id AS slot_id, ts.period_id, tp.period_no, tp.start_time, tp.end_time, ts.day_of_week, ts.room,
                subj.name AS subject_name, (p.first_name || COALESCE(' ' || p.last_name, '')) AS teacher_name
         FROM timetable_slot ts
         JOIN timetable_period tp ON tp.id = ts.period_id
         JOIN subject_offering so ON so.id = ts.subject_offering_id
         JOIN subject subj ON subj.id = so.subject_id
         LEFT JOIN staff st ON st.id = so.teacher_staff_id AND st.status = 'ACTIVE'
         LEFT JOIN person p ON p.id = st.person_id
         WHERE so.section_id = $1 AND ts.status = 'ACTIVE' AND ts.is_draft = false
         ORDER BY ts.day_of_week, tp.period_no`,
        [sectionId],
      ),
    ]);
    return {
      periods: periods.map((r: any) => ({
        periodId: r.id,
        periodNo: r.period_no,
        label: r.label,
        startTime: r.start_time,
        endTime: r.end_time,
        isBreak: r.is_break,
      })),
      slots: slots.map((r: any) => ({
        slotId: r.slot_id,
        periodId: r.period_id,
        periodNo: r.period_no,
        startTime: r.start_time,
        endTime: r.end_time,
        dayOfWeek: r.day_of_week,
        room: r.room,
        subjectName: r.subject_name,
        teacherName: r.teacher_name,
      })),
    };
  }
}

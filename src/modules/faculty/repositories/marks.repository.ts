// Real exam/exam_subject/mark tables -- both already populated with real
// exams and 13k+ real mark rows in this database. Grade bands (A+/A/B/C/D)
// are computed here from simple universal percentage thresholds matching the
// design reference (A+ >=90%, A >=80%, B >=70%, C >=60%, else D) rather than
// resolving the schema's own grade_scale/grade_band/exam_grade tables --
// a deliberate scope simplification (flagged in the build report), not an
// oversight: wiring real per-scale grade bands is a larger, separate piece of
// work the user didn't ask for here.
//
// "Final" mark state, for every read here, means VERIFIED or PUBLISHED, not
// PUBLISHED alone -- confirmed against this database's own real seeded data,
// where marks that have gone through the school's actual verification step
// sit at mark.state='VERIFIED' under an already-PUBLISHED exam, and never
// reach mark.state='PUBLISHED' itself. The real gate on "is this result
// settled" is the parent exam's own state, not each individual mark row's.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ExamSubjectRow {
  examSubjectId: string;
  examId: string;
  examName: string;
  examType: string;
  term: string;
  examState: string;
  maxMarks: number;
  passMarks: number | null;
}

export interface ExamSummaryRow {
  examId: string;
  examName: string;
  examType: string;
  term: string;
  examState: string;
}

export interface MarkRow {
  markId: string | null;
  studentId: string;
  studentName: string;
  rollNo: number | null;
  marksObtained: number | null;
  isAbsent: boolean;
  isExempted: boolean;
  state: string | null;
}

function mapExamSubject(row: any): ExamSubjectRow {
  return {
    examSubjectId: row.exam_subject_id,
    examId: row.exam_id,
    examName: row.exam_name,
    examType: row.exam_type,
    term: row.term,
    examState: row.exam_state,
    // numeric(5,2) columns -- node-pg returns these as strings; convert here so
    // every caller genuinely gets the `number` the interface promises, not a
    // string that happens to behave numerically in some operators but not others.
    maxMarks: Number(row.max_marks),
    passMarks: row.pass_marks === null ? null : Number(row.pass_marks),
  };
}

@Injectable()
export class MarksRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every real exam_subject for this subject_offering -- the actual, dynamic
   * "switch exam" tab list (however many real tests exist, not a fixed 3). */
  async findExamSubjectsForOffering(
    subjectOfferingId: string,
    executor: Queryable = this.postgres,
  ): Promise<ExamSubjectRow[]> {
    const { rows } = await executor.query(
      `SELECT es.id AS exam_subject_id, es.exam_id, es.max_marks, es.pass_marks,
              e.name AS exam_name, e.exam_type, e.term, e.state AS exam_state
       FROM exam_subject es
       JOIN exam e ON e.id = es.exam_id
       WHERE es.subject_offering_id = $1
       ORDER BY es.exam_date DESC NULLS LAST, e.created_at DESC`,
      [subjectOfferingId],
    );
    return rows.map(mapExamSubject);
  }

  /** sectionId comes from the exam_subject's own subject_offering here --
   * never trust a section id passed alongside an exam_subject id separately;
   * that would let a mismatched pair silently mix one class's roster against
   * another class's exam. */
  async findExamSubjectById(
    examSubjectId: string,
    executor: Queryable = this.postgres,
  ): Promise<
    (ExamSubjectRow & { subjectOfferingId: string; sectionId: string }) | null
  > {
    const { rows } = await executor.query(
      `SELECT es.id AS exam_subject_id, es.exam_id, es.subject_offering_id, so.section_id, es.max_marks, es.pass_marks,
              e.name AS exam_name, e.exam_type, e.term, e.state AS exam_state
       FROM exam_subject es
       JOIN exam e ON e.id = es.exam_id
       JOIN subject_offering so ON so.id = es.subject_offering_id
       WHERE es.id = $1`,
      [examSubjectId],
    );
    if (!rows.length) return null;
    return {
      ...mapExamSubject(rows[0]),
      subjectOfferingId: rows[0].subject_offering_id,
      sectionId: rows[0].section_id,
    };
  }

  /** Every student currently enrolled in this section, left-joined to their
   * mark row for this exam_subject (null mark = not yet entered). */
  async findRosterWithMarks(
    sectionId: string,
    examSubjectId: string,
    executor: Queryable = this.postgres,
  ): Promise<MarkRow[]> {
    const { rows } = await executor.query(
      `SELECT s.id AS student_id, p.first_name, p.last_name, se.roll_no,
              m.id AS mark_id, m.marks_obtained, m.is_absent, m.is_exempted, m.state
       FROM student_enrolment se
       JOIN student s ON s.id = se.student_id
       JOIN person p ON p.id = s.person_id
       LEFT JOIN mark m ON m.exam_subject_id = $2 AND m.student_id = s.id
       WHERE se.section_id = $1 AND se.status = 'ACTIVE'
       ORDER BY se.roll_no NULLS LAST, p.first_name`,
      [sectionId, examSubjectId],
    );
    return rows.map((row: any) => ({
      markId: row.mark_id,
      studentId: row.student_id,
      studentName: [row.first_name, row.last_name].filter(Boolean).join(' '),
      rollNo: row.roll_no,
      marksObtained:
        row.marks_obtained === null ? null : Number(row.marks_obtained),
      isAbsent: row.is_absent ?? false,
      isExempted: row.is_exempted ?? false,
      state: row.state,
    }));
  }

  /** Every real, PUBLISHED mark for this one student across every subject --
   * Subject Records' own single-subject view and Class Results' whole-class
   * aggregation both build on this same base query, scoped differently. */
  async findPublishedMarksForStudent(
    studentId: string,
    executor: Queryable = this.postgres,
  ) {
    const { rows } = await executor.query(
      `SELECT m.marks_obtained, m.is_absent, es.max_marks, es.id AS exam_subject_id,
              e.id AS exam_id, e.name AS exam_name, e.exam_type,
              subj.id AS subject_id, subj.name AS subject_name
       FROM mark m
       JOIN exam_subject es ON es.id = m.exam_subject_id
       JOIN exam e ON e.id = es.exam_id
       JOIN subject_offering so ON so.id = es.subject_offering_id
       JOIN subject subj ON subj.id = so.subject_id
       WHERE m.student_id = $1 AND m.state IN ('VERIFIED', 'PUBLISHED')
       ORDER BY subj.name, es.exam_date`,
      [studentId],
    );
    return rows;
  }

  /** Every real PUBLISHED mark this subject_offering's own exam_subjects have,
   * for every student currently in the section -- Subject Records' real,
   * per-subject breakdown (each exam a separate mini-stat, exactly like the
   * design's expandable student rows). */
  async findPublishedMarksForOffering(
    sectionId: string,
    subjectOfferingId: string,
    executor: Queryable = this.postgres,
  ) {
    const { rows } = await executor.query(
      `SELECT s.id AS student_id, p.first_name, p.last_name, se.roll_no,
              e.id AS exam_id, e.name AS exam_name, es.max_marks,
              m.marks_obtained, m.is_absent
       FROM student_enrolment se
       JOIN student s ON s.id = se.student_id
       JOIN person p ON p.id = s.person_id
       CROSS JOIN exam_subject es
       JOIN exam e ON e.id = es.exam_id AND e.state = 'PUBLISHED'
       LEFT JOIN mark m ON m.exam_subject_id = es.id AND m.student_id = s.id AND m.state IN ('VERIFIED', 'PUBLISHED')
       WHERE se.section_id = $1 AND se.status = 'ACTIVE' AND es.subject_offering_id = $2
       ORDER BY se.roll_no NULLS LAST, p.first_name, es.exam_date`,
      [sectionId, subjectOfferingId],
    );
    return rows;
  }

  /** Every real, PUBLISHED exam that has at least one exam_subject belonging
   * to this section -- Class Results' own dynamic "switch exam" list (a class
   * advisor's whole-class results view, across every subject at once, not
   * one subject_offering at a time like Marks Entry/Subject Records). */
  async findExamsForSection(
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<ExamSummaryRow[]> {
    const { rows } = await executor.query(
      `SELECT DISTINCT e.id AS exam_id, e.name AS exam_name, e.exam_type, e.term, e.state AS exam_state, e.created_at
       FROM exam_subject es
       JOIN subject_offering so ON so.id = es.subject_offering_id
       JOIN exam e ON e.id = es.exam_id
       WHERE so.section_id = $1 AND e.state = 'PUBLISHED'
       ORDER BY e.created_at DESC`,
      [sectionId],
    );
    return rows.map((row: any) => ({
      examId: row.exam_id,
      examName: row.exam_name,
      examType: row.exam_type,
      term: row.term,
      examState: row.exam_state,
    }));
  }

  /** Every subject's real, final mark for every currently-enrolled student in
   * this section, for one exam -- the whole-class, cross-subject aggregation
   * Class Results does its grade-distribution/topper math over. */
  async findResultsForExamAndSection(
    sectionId: string,
    examId: string,
    executor: Queryable = this.postgres,
  ): Promise<
    {
      studentId: string;
      firstName: string;
      lastName: string | null;
      rollNo: number | null;
      subjectId: string;
      subjectName: string;
      maxMarks: number;
      passMarks: number | null;
      marksObtained: number | null;
      isAbsent: boolean;
      isExempted: boolean;
    }[]
  > {
    const { rows } = await executor.query(
      `SELECT s.id AS student_id, p.first_name, p.last_name, se.roll_no,
              subj.id AS subject_id, subj.name AS subject_name,
              es.max_marks, es.pass_marks,
              m.marks_obtained, m.is_absent, m.is_exempted
       FROM student_enrolment se
       JOIN student s ON s.id = se.student_id
       JOIN person p ON p.id = s.person_id
       JOIN subject_offering so ON so.section_id = se.section_id
       JOIN exam_subject es ON es.subject_offering_id = so.id AND es.exam_id = $2
       JOIN subject subj ON subj.id = so.subject_id
       LEFT JOIN mark m ON m.exam_subject_id = es.id AND m.student_id = s.id AND m.state IN ('VERIFIED', 'PUBLISHED')
       WHERE se.section_id = $1 AND se.status = 'ACTIVE'
       ORDER BY se.roll_no NULLS LAST, p.first_name, subj.name`,
      [sectionId, examId],
    );
    return rows.map((row: any) => ({
      studentId: row.student_id,
      firstName: row.first_name,
      lastName: row.last_name,
      rollNo: row.roll_no,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      maxMarks: Number(row.max_marks),
      passMarks: row.pass_marks === null ? null : Number(row.pass_marks),
      marksObtained:
        row.marks_obtained === null ? null : Number(row.marks_obtained),
      isAbsent: row.is_absent ?? false,
      isExempted: row.is_exempted ?? false,
    }));
  }

  async upsertMark(
    input: {
      examSubjectId: string;
      studentId: string;
      marksObtained: number | null;
      isAbsent: boolean;
      enteredBy: string;
    },
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO mark (exam_subject_id, student_id, marks_obtained, is_absent, entered_by, entered_at, state)
       VALUES ($1, $2, $3, $4, $5, now(), 'ENTERED')
       ON CONFLICT (exam_subject_id, student_id) DO UPDATE SET
         marks_obtained = EXCLUDED.marks_obtained, is_absent = EXCLUDED.is_absent,
         entered_by = EXCLUDED.entered_by, entered_at = now(), state = 'ENTERED'`,
      [
        input.examSubjectId,
        input.studentId,
        input.marksObtained,
        input.isAbsent,
        input.enteredBy,
      ],
    );
  }

  /** Bulk-publish every ENTERED mark for this exam_subject at once -- matches
   * the design's own single "Save"/whole-class action, not a per-student
   * publish. */
  async publishMarks(
    examSubjectId: string,
    executor: Queryable,
  ): Promise<number> {
    const { rowCount } = await executor.query(
      `UPDATE mark SET state = 'PUBLISHED' WHERE exam_subject_id = $1 AND state = 'ENTERED'`,
      [examSubjectId],
    );
    return rowCount ?? 0;
  }
}

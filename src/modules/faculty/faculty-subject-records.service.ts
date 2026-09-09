// Subject Records -- a subject teacher's real, published marks for their own
// class, one subject at a time (never advisor-scoped -- this is the "classes I
// teach" scope, distinct from "classes I advise"). Grade bands use the same
// simple percentage thresholds as Marks Entry/Class Results (see
// marks.repository.ts's own header note on why).

import { ForbiddenException, Injectable } from '@nestjs/common';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { AttendanceRecordsService } from '../attendance/attendance-records.service';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { MarksRepository } from './repositories/marks.repository';

function gradeFor(percent: number): string {
  if (percent >= 90) return 'A+';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B';
  if (percent >= 60) return 'C';
  return 'D';
}

@Injectable()
export class FacultySubjectRecordsService {
  constructor(
    private readonly marksRepo: MarksRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly attendanceRecordsService: AttendanceRecordsService,
    private readonly postgres: PostgresService,
  ) {}

  async getRecords(personId: string, subjectOfferingId: string) {
    const owns = await this.scopeRepo.ownsOffering(personId, subjectOfferingId);
    if (!owns) throw new ForbiddenException('You do not teach this subject for this class.');

    // The section comes from the offering itself -- never a second,
    // separately-trusted client-supplied id that could mismatch it (the same
    // fix applied to Marks Entry's own roster lookup).
    const { rows: offeringRows } = await this.postgres.query(`SELECT section_id FROM subject_offering WHERE id = $1`, [subjectOfferingId]);
    const sectionId = offeringRows[0]?.section_id;
    if (!sectionId) throw new ForbiddenException('This subject offering no longer exists.');

    const rows = await this.marksRepo.findPublishedMarksForOffering(sectionId, subjectOfferingId);

    const byStudent = new Map<string, any>();
    for (const row of rows) {
      let entry = byStudent.get(row.student_id);
      if (!entry) {
        entry = {
          studentId: row.student_id,
          studentName: [row.first_name, row.last_name].filter(Boolean).join(' '),
          rollNo: row.roll_no,
          exams: [] as { examName: string; marksObtained: number | null; maxMarks: number; isAbsent: boolean }[],
        };
        byStudent.set(row.student_id, entry);
      }
      if (row.exam_id) {
        entry.exams.push({
          examName: row.exam_name,
          marksObtained: row.marks_obtained === null ? null : Number(row.marks_obtained),
          // exam_subject.max_marks is a numeric(5,2) column -- node-pg returns it
          // as a string (same precision-safety convention as bigint/money
          // columns elsewhere in this codebase); a raw `sum + string` below
          // would silently string-concatenate instead of adding.
          maxMarks: Number(row.max_marks),
          isAbsent: row.is_absent ?? false,
        });
      }
    }

    const students = [];
    for (const entry of byStudent.values()) {
      const scored = entry.exams.filter((e: any) => e.marksObtained !== null);
      // Rounded to 2dp -- summing several numeric(5,2) marks in floating point
      // otherwise produces display artifacts like 497.90000000000003.
      const total = Math.round(scored.reduce((sum: number, e: any) => sum + e.marksObtained, 0) * 100) / 100;
      const max = scored.reduce((sum: number, e: any) => sum + e.maxMarks, 0);
      const percent = max > 0 ? Math.round((total / max) * 100) : null;

      const [attendance, guardian] = await Promise.all([
        this.attendanceRecordsService.getAttendanceSummaryForStudent(entry.studentId),
        this.getPrimaryGuardianPhone(entry.studentId),
      ]);

      students.push({
        ...entry,
        totalObtained: total,
        totalMax: max,
        percent,
        grade: percent === null ? null : gradeFor(percent),
        attendancePercent: attendance.percentage,
        guardianPhone: guardian,
      });
    }

    const withPercent = students.filter((s) => s.percent !== null);
    const classAvg = withPercent.length > 0 ? Math.round(withPercent.reduce((sum, s) => sum + s.percent!, 0) / withPercent.length) : null;
    const highest = withPercent.length > 0 ? Math.max(...withPercent.map((s) => s.percent!)) : null;

    return { students, classAvg, highest, studentCount: students.length };
  }

  private async getPrimaryGuardianPhone(studentId: string): Promise<string | null> {
    const { rows } = await this.postgres.query(
      `SELECT p.mobile FROM guardian_link gl JOIN person p ON p.id = gl.person_id
       WHERE gl.student_id = $1 AND gl.status = 'ACTIVE' ORDER BY gl.is_primary_contact DESC LIMIT 1`,
      [studentId],
    );
    return rows[0]?.mobile ?? null;
  }
}

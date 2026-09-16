// Real, already-populated `mark_correction` table (10 real rows) -- the
// DB's own intended mechanism for changing a PUBLISHED mark: the
// guard_published_mark trigger on `mark` unconditionally rejects any direct
// UPDATE to marks_obtained/practical_marks/is_absent once mark.state =
// 'PUBLISHED' ("Published mark is immutable; record a mark_correction
// instead" -- its own exception message). This repository is the first
// real write path onto that table in this backend.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface MarkCorrectionRow {
  id: string;
  markId: string;
  oldMarks: number | null;
  newMarks: number | null;
  reason: string | null;
  correctedBy: string;
  correctedAt: Date;
}

function mapRow(row: any): MarkCorrectionRow {
  return {
    id: row.id,
    markId: row.mark_id,
    oldMarks: row.old_marks === null ? null : Number(row.old_marks),
    newMarks: row.new_marks === null ? null : Number(row.new_marks),
    reason: row.reason,
    correctedBy: row.corrected_by,
    correctedAt: row.corrected_at,
  };
}

@Injectable()
export class MarkCorrectionRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMarkId(
    examSubjectId: string,
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ id: string; marksObtained: number | null } | null> {
    const { rows } = await executor.query(
      `SELECT id, marks_obtained FROM mark WHERE exam_subject_id = $1 AND student_id = $2`,
      [examSubjectId, studentId],
    );
    if (!rows.length) return null;
    return {
      id: rows[0].id,
      marksObtained:
        rows[0].marks_obtained === null ? null : Number(rows[0].marks_obtained),
    };
  }

  async create(
    input: {
      markId: string;
      oldMarks: number | null;
      newMarks: number;
      reason: string;
      correctedBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<MarkCorrectionRow> {
    const { rows } = await executor.query(
      `INSERT INTO mark_correction (mark_id, old_marks, new_marks, reason, corrected_by, corrected_at)
       VALUES ($1, $2, $3, $4, $5, now())
       RETURNING id, mark_id, old_marks, new_marks, reason, corrected_by, corrected_at`,
      [
        input.markId,
        input.oldMarks,
        input.newMarks,
        input.reason,
        input.correctedBy,
      ],
    );
    return mapRow(rows[0]);
  }

  async findForSectionAndExam(
    sectionId: string,
    examId: string,
    executor: Queryable = this.postgres,
  ): Promise<
    (MarkCorrectionRow & {
      studentId: string;
      subjectName: string;
      studentFirstName: string;
      studentLastName: string | null;
    })[]
  > {
    const { rows } = await executor.query(
      `SELECT mc.id, mc.mark_id, mc.old_marks, mc.new_marks, mc.reason, mc.corrected_by, mc.corrected_at,
              m.student_id, subj.name AS subject_name, p.first_name AS student_first_name, p.last_name AS student_last_name
       FROM mark_correction mc
       JOIN mark m ON m.id = mc.mark_id
       JOIN exam_subject es ON es.id = m.exam_subject_id
       JOIN subject_offering so ON so.id = es.subject_offering_id
       JOIN subject subj ON subj.id = so.subject_id
       JOIN student s ON s.id = m.student_id
       JOIN person p ON p.id = s.person_id
       WHERE es.exam_id = $2 AND so.section_id = $1
       ORDER BY mc.corrected_at DESC`,
      [sectionId, examId],
    );
    return rows.map((r: any) => ({
      ...mapRow(r),
      studentId: r.student_id,
      subjectName: r.subject_name,
      studentFirstName: r.student_first_name,
      studentLastName: r.student_last_name,
    }));
  }
}

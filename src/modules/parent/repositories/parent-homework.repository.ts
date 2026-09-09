// Real homework/homework_submission tables (same tables Faculty's own
// HomeworkRepository uses, see ../../faculty/repositories/homework.repository.ts)
// -- read/write here is scoped to exactly one student at a time (the parent's
// own child), never a whole class roster. Submission rows are pre-created one
// per currently-enrolled student the moment homework is posted (PENDING), so
// this is almost always an UPDATE, but the upsert defends against the one edge
// case where a student enrolled into the offering after homework was posted
// and so never got a seeded row.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ParentHomeworkRow {
  id: string;
  subjectOfferingId: string;
  subjectName: string;
  title: string;
  description: string | null;
  attachmentKeys: string[] | null;
  assignedOn: string;
  dueDate: string;
  maxMarks: number | null;
  submissionStatus: string;
  submittedAt: Date | null;
  isLate: boolean;
  objectKeys: string[] | null;
  note: string | null;
  marksAwarded: number | null;
  feedback: string | null;
}

function mapRow(row: any): ParentHomeworkRow {
  return {
    id: row.id,
    subjectOfferingId: row.subject_offering_id,
    subjectName: row.subject_name,
    title: row.title,
    description: row.description,
    attachmentKeys: row.attachment_keys,
    assignedOn: row.assigned_on,
    dueDate: row.due_date,
    maxMarks: row.max_marks === null ? null : Number(row.max_marks),
    submissionStatus: row.submission_status ?? 'PENDING',
    submittedAt: row.submitted_at,
    isLate: row.is_late ?? false,
    objectKeys: row.object_keys,
    note: row.note,
    marksAwarded: row.marks_awarded === null ? null : Number(row.marks_awarded),
    feedback: row.feedback,
  };
}

const HOMEWORK_FOR_STUDENT = `
  SELECT h.id, h.subject_offering_id, subj.name AS subject_name, h.title, h.description,
         h.attachment_keys, h.assigned_on, h.due_date, h.max_marks,
         COALESCE(hs.status, 'PENDING') AS submission_status, hs.submitted_at, COALESCE(hs.is_late, false) AS is_late,
         hs.object_keys, hs.note, hs.marks_awarded, hs.feedback
  FROM homework h
  JOIN subject_offering so ON so.id = h.subject_offering_id
  JOIN subject subj ON subj.id = so.subject_id
  LEFT JOIN homework_submission hs ON hs.homework_id = h.id AND hs.student_id = $1
`;

@Injectable()
export class ParentHomeworkRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every real, non-draft homework across this student's own current
   * subject_offerings, with that same student's own submission (if any). */
  async findForStudent(
    studentId: string,
    subjectOfferingIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<ParentHomeworkRow[]> {
    if (subjectOfferingIds.length === 0) return [];
    const { rows } = await executor.query(
      `${HOMEWORK_FOR_STUDENT}
       WHERE h.status IN ('PUBLISHED', 'CLOSED') AND h.subject_offering_id = ANY($2)
       ORDER BY h.due_date DESC, h.created_at DESC`,
      [studentId, subjectOfferingIds],
    );
    return rows.map(mapRow);
  }

  async findById(
    homeworkId: string,
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<ParentHomeworkRow | null> {
    const { rows } = await executor.query(
      `${HOMEWORK_FOR_STUDENT}
       WHERE h.id = $2`,
      [studentId, homeworkId],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  /** Appends any newly-uploaded object keys to whatever this student already
   * submitted (never drops earlier uploads across repeated submit calls),
   * updates note/submitted_at/is_late/status. Upsert defends against a
   * missing pre-seeded row (see file header). */
  async upsertSubmission(
    input: {
      homeworkId: string;
      studentId: string;
      newObjectKeys: string[];
      note: string | null;
      isLate: boolean;
      status: 'SUBMITTED' | 'LATE';
    },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO homework_submission (homework_id, student_id, object_keys, note, submitted_at, is_late, status)
       VALUES ($1, $2, $3, $4, now(), $5, $6)
       ON CONFLICT (homework_id, student_id) DO UPDATE
         SET object_keys = COALESCE(homework_submission.object_keys, '{}') || EXCLUDED.object_keys,
             note = COALESCE(EXCLUDED.note, homework_submission.note),
             submitted_at = now(),
             is_late = EXCLUDED.is_late,
             status = EXCLUDED.status
       WHERE homework_submission.status NOT IN ('GRADED')`,
      [
        input.homeworkId,
        input.studentId,
        input.newObjectKeys,
        input.note,
        input.isLate,
        input.status,
      ],
    );
  }
}

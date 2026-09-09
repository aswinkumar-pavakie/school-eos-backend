// Real homework/homework_submission tables (336 real homework rows, 6720 real
// submission rows already seeded). Submission rows are pre-created one per
// currently-enrolled student the moment homework is posted (matching the
// seeded data's own shape -- there is no DB trigger that does this, see this
// repository's own create()), each starting at status='PENDING' and later
// transitioning to SUBMITTED/LATE/GRADED (real submission, out of this
// build's scope -- the Parent/Student app's own job, same as Leave's
// creation path) or NOT_DONE (past due, never submitted). "Finished" for the
// Faculty tracking view means SUBMITTED/LATE/GRADED; "not finished" means
// PENDING/NOT_DONE -- this maps directly onto the design's own "Completed" /
// "Not submitted" roster tabs.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface HomeworkRow {
  id: string;
  subjectOfferingId: string;
  sectionId: string;
  gradeName: string;
  sectionName: string;
  subjectName: string;
  title: string;
  description: string | null;
  attachmentKeys: string[] | null;
  assignedOn: string;
  dueDate: string;
  maxMarks: number | null;
  status: string;
  total: number;
  finishedCount: number;
  gradedCount: number;
}

function mapHomeworkRow(row: any): HomeworkRow {
  return {
    id: row.id,
    subjectOfferingId: row.subject_offering_id,
    sectionId: row.section_id,
    gradeName: row.grade_name,
    sectionName: row.section_name,
    subjectName: row.subject_name,
    title: row.title,
    description: row.description,
    attachmentKeys: row.attachment_keys,
    assignedOn: row.assigned_on,
    dueDate: row.due_date,
    maxMarks: row.max_marks === null ? null : Number(row.max_marks),
    status: row.status,
    total: Number(row.total),
    finishedCount: Number(row.finished_count),
    gradedCount: Number(row.graded_count),
  };
}

const HOMEWORK_WITH_STATS = `
  SELECT h.id, h.subject_offering_id, so.section_id, g.name AS grade_name, sec.name AS section_name, subj.name AS subject_name,
         h.title, h.description, h.attachment_keys, h.assigned_on, h.due_date, h.max_marks, h.status,
         COUNT(hs.id) AS total,
         COUNT(hs.id) FILTER (WHERE hs.status IN ('SUBMITTED', 'LATE', 'GRADED')) AS finished_count,
         COUNT(hs.id) FILTER (WHERE hs.status = 'GRADED') AS graded_count
  FROM homework h
  JOIN subject_offering so ON so.id = h.subject_offering_id
  JOIN section sec ON sec.id = so.section_id
  JOIN grade g ON g.id = sec.grade_id
  JOIN subject subj ON subj.id = so.subject_id
  LEFT JOIN homework_submission hs ON hs.homework_id = h.id
`;

@Injectable()
export class HomeworkRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every real homework across every one of this teacher's own
   * subject_offerings -- the combined, filterable-by-class list the design's
   * own "All / per class" chips filter client-side. */
  async findForOfferings(
    subjectOfferingIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<HomeworkRow[]> {
    if (subjectOfferingIds.length === 0) return [];
    const { rows } = await executor.query(
      `${HOMEWORK_WITH_STATS}
       WHERE h.subject_offering_id = ANY($1)
       GROUP BY h.id, so.section_id, g.name, sec.name, subj.name
       ORDER BY h.due_date DESC, h.created_at DESC`,
      [subjectOfferingIds],
    );
    return rows.map(mapHomeworkRow);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<HomeworkRow | null> {
    const { rows } = await executor.query(
      `${HOMEWORK_WITH_STATS}
       WHERE h.id = $1
       GROUP BY h.id, so.section_id, g.name, sec.name, subj.name`,
      [id],
    );
    return rows.length > 0 ? mapHomeworkRow(rows[0]) : null;
  }

  /** Inserts the homework row, then one PENDING submission row per
   * currently-ACTIVE-enrolled student in the offering's section -- matches
   * the real seeded data's own shape (no DB trigger creates these). */
  async create(
    input: {
      subjectOfferingId: string;
      title: string;
      description: string | null;
      attachmentKeys: string[] | null;
      dueDate: string;
      maxMarks: number | null;
      assignedBy: string;
    },
    executor: Queryable,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO homework (subject_offering_id, title, description, attachment_keys, due_date, max_marks, assigned_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PUBLISHED')
       RETURNING id`,
      [
        input.subjectOfferingId,
        input.title,
        input.description,
        input.attachmentKeys,
        input.dueDate,
        input.maxMarks,
        input.assignedBy,
      ],
    );
    const homeworkId = rows[0].id;

    await executor.query(
      `INSERT INTO homework_submission (homework_id, student_id, status)
       SELECT $1, se.student_id, 'PENDING'
       FROM subject_offering so
       JOIN student_enrolment se ON se.section_id = so.section_id AND se.status = 'ACTIVE'
       WHERE so.id = $2`,
      [homeworkId, input.subjectOfferingId],
    );

    return homeworkId;
  }

  async update(
    id: string,
    input: Partial<{
      title: string;
      description: string | null;
      attachmentKeys: string[] | null;
      dueDate: string;
      maxMarks: number | null;
      status: string;
    }>,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.title !== undefined) push('title', input.title);
    if (input.description !== undefined) push('description', input.description);
    if (input.attachmentKeys !== undefined)
      push('attachment_keys', input.attachmentKeys);
    if (input.dueDate !== undefined) push('due_date', input.dueDate);
    if (input.maxMarks !== undefined) push('max_marks', input.maxMarks);
    if (input.status !== undefined) push('status', input.status);
    if (sets.length === 0) return;
    params.push(id);
    await executor.query(
      `UPDATE homework SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params,
    );
  }

  /** Cascades to homework_submission automatically (ON DELETE CASCADE). */
  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM homework WHERE id = $1`, [id]);
  }

  async findRoster(
    homeworkId: string,
    executor: Queryable = this.postgres,
  ): Promise<
    {
      studentId: string;
      studentName: string;
      rollNo: number | null;
      status: string;
      submittedAt: Date | null;
      isLate: boolean;
      objectKeys: string[] | null;
      note: string | null;
      marksAwarded: number | null;
      feedback: string | null;
    }[]
  > {
    const { rows } = await executor.query(
      `SELECT hs.student_id, p.first_name, p.last_name, se.roll_no,
              hs.status, hs.submitted_at, hs.is_late, hs.object_keys, hs.note, hs.marks_awarded, hs.feedback
       FROM homework_submission hs
       JOIN homework h ON h.id = hs.homework_id
       JOIN student s ON s.id = hs.student_id
       JOIN person p ON p.id = s.person_id
       JOIN subject_offering so ON so.id = h.subject_offering_id
       LEFT JOIN student_enrolment se ON se.student_id = hs.student_id AND se.section_id = so.section_id AND se.status = 'ACTIVE'
       WHERE hs.homework_id = $1
       ORDER BY se.roll_no NULLS LAST, p.first_name`,
      [homeworkId],
    );
    return rows.map((row: any) => ({
      studentId: row.student_id,
      studentName: [row.first_name, row.last_name].filter(Boolean).join(' '),
      rollNo: row.roll_no,
      status: row.status,
      submittedAt: row.submitted_at,
      isLate: row.is_late,
      objectKeys: row.object_keys,
      note: row.note,
      marksAwarded:
        row.marks_awarded === null ? null : Number(row.marks_awarded),
      feedback: row.feedback,
    }));
  }

  /** The real object_keys array for one student's submission on one homework
   * -- used only to verify a requested key genuinely belongs to that
   * submission before minting a signed URL for it. */
  async findSubmissionObjectKeys(
    homeworkId: string,
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<string[] | null> {
    const { rows } = await executor.query(
      `SELECT object_keys FROM homework_submission WHERE homework_id = $1 AND student_id = $2`,
      [homeworkId, studentId],
    );
    return rows.length > 0 ? rows[0].object_keys : null;
  }
}

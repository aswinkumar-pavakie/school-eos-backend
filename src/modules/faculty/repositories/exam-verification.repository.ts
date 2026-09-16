// Real per-(section, exam) review decision an Academic Coordinator records
// against a class's real, already-PUBLISHED exam results (see
// MarksRepository.findExamsForSection/findResultsForExamAndSection, which
// this never duplicates) -- Verified, or Sent back with a comment. Purely
// additive over the existing marks/exam state machine: never writes to
// `mark` or `exam`, never gates a teacher's own publish action.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ExamVerificationRow {
  sectionId: string;
  examId: string;
  status: 'PENDING' | 'VERIFIED' | 'SENT_BACK';
  comment: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  updatedAt: Date;
}

@Injectable()
export class ExamVerificationRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** One row per (sectionId, examId) actually on record -- callers default
   * anything missing to PENDING themselves, since most real submissions
   * never got a decision yet and this table only ever stores an actual one. */
  async findForSections(
    sectionIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<ExamVerificationRow[]> {
    if (sectionIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT section_id, exam_id, status, comment, decided_by, decided_at, updated_at
       FROM exam_verification
       WHERE section_id = ANY($1::uuid[])`,
      [sectionIds],
    );
    return rows.map(mapRow);
  }

  async findOne(
    sectionId: string,
    examId: string,
    executor: Queryable = this.postgres,
  ): Promise<ExamVerificationRow | null> {
    const { rows } = await executor.query(
      `SELECT section_id, exam_id, status, comment, decided_by, decided_at, updated_at
       FROM exam_verification
       WHERE section_id = $1 AND exam_id = $2`,
      [sectionId, examId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async setDecision(
    sectionId: string,
    examId: string,
    status: 'VERIFIED' | 'SENT_BACK',
    comment: string | null,
    decidedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO exam_verification (section_id, exam_id, status, comment, decided_by, decided_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (section_id, exam_id)
       DO UPDATE SET status = $3, comment = $4, decided_by = $5, decided_at = now()`,
      [sectionId, examId, status, comment, decidedBy],
    );
  }

  /** Every real SENT_BACK row -- the Faculty side's own "correction
   * requests" list is built from this (see
   * faculty-marks.service.ts's own listSentBackSubmissions), filtered down
   * to whichever of these sections+exams actually contain a subject this
   * particular teacher owns. */
  async findAllSentBack(
    executor: Queryable = this.postgres,
  ): Promise<ExamVerificationRow[]> {
    const { rows } = await executor.query(
      `SELECT section_id, exam_id, status, comment, decided_by, decided_at, updated_at
       FROM exam_verification
       WHERE status = 'SENT_BACK'`,
    );
    return rows.map(mapRow);
  }

  /** Real re-open: once a subject teacher submits a mark_correction against
   * a SENT_BACK submission (faculty-marks.service.ts's own correctMark),
   * the coordinator's own decision flips back to PENDING so it genuinely
   * re-enters their Submissions queue as a fresh review -- "the request
   * reaching them again" the user asked for, not a silent no-op. A no-op if
   * the row isn't currently SENT_BACK (a correction against an already-
   * VERIFIED or still-PENDING submission never happens in the real flow,
   * but this stays a safe no-op either way rather than clobbering an
   * unrelated decision). */
  async resetToPendingIfSentBack(
    sectionId: string,
    examId: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE exam_verification
       SET status = 'PENDING', comment = NULL, decided_by = NULL, decided_at = NULL, updated_at = now()
       WHERE section_id = $1 AND exam_id = $2 AND status = 'SENT_BACK'`,
      [sectionId, examId],
    );
  }
}

function mapRow(row: any): ExamVerificationRow {
  return {
    sectionId: row.section_id,
    examId: row.exam_id,
    status: row.status,
    comment: row.comment,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    updatedAt: row.updated_at,
  };
}

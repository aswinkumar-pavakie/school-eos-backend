// staff_appraisal -- a Faculty member's own self-assessment for one appraisal
// cycle, reviewed by the Principal (single-step, already-seeded
// STAFF_APPRAISAL approval_policy). No approval_request_id FK column exists
// on this table (unlike staff_hr_request/payroll_period) -- it's looked up
// the same polymorphic way student_leave_request/staff_leave_request are,
// via subject_object_type/subject_object_id (cast ::text -- see those
// repositories' own note on why the cast is required).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StaffAppraisalRow {
  id: string;
  staffId: string;
  cycle: string;
  selfAssessment: string;
  attachmentObjectKey: string | null;
  attachmentFileName: string | null;
  score: number | null;
  principalRemark: string | null;
  state: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  approvalRequestId: string | null;
}

const COLUMNS = `sa.id, sa.staff_id, sa.cycle, sa.self_assessment, sa.attachment_object_key, sa.attachment_file_name,
  sa.score, sa.principal_remark, sa.state, sa.reviewed_by, sa.reviewed_at, sa.created_at,
  ar.id AS approval_request_id`;

const FROM = `
  FROM staff_appraisal sa
  LEFT JOIN approval_request ar ON ar.subject_object_type = 'staff_appraisal' AND ar.subject_object_id = sa.id::text`;

function mapRow(row: any): StaffAppraisalRow {
  return {
    id: row.id,
    staffId: row.staff_id,
    cycle: row.cycle,
    selfAssessment: row.self_assessment,
    attachmentObjectKey: row.attachment_object_key,
    attachmentFileName: row.attachment_file_name,
    score: row.score === null ? null : Number(row.score),
    principalRemark: row.principal_remark,
    state: row.state,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    approvalRequestId: row.approval_request_id,
  };
}

@Injectable()
export class StaffAppraisalRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByStaffId(
    staffId: string,
    executor: Queryable = this.postgres,
  ): Promise<StaffAppraisalRow[]> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} ${FROM} WHERE sa.staff_id = $1 ORDER BY sa.created_at DESC`,
      [staffId],
    );
    return rows.map(mapRow);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<StaffAppraisalRow | null> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} ${FROM} WHERE sa.id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async create(
    input: {
      staffId: string;
      cycle: string;
      selfAssessment: string;
      attachmentObjectKey: string | null;
      attachmentFileName: string | null;
    },
    executor: Queryable,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO staff_appraisal (staff_id, cycle, self_assessment, attachment_object_key, attachment_file_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        input.staffId,
        input.cycle,
        input.selfAssessment,
        input.attachmentObjectKey,
        input.attachmentFileName,
      ],
    );
    return rows[0].id;
  }

  /** The generic engine's own onApproved/onRejected have no way to carry a
   * score or free-text remark (see SubjectStateHandler's signature) -- both
   * are Principal-UI concerns explicitly out of scope for this build. Every
   * decision here just closes the review cycle: state='REVIEWED'. */
  async markReviewed(
    id: string,
    reviewedBy: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE staff_appraisal SET state = 'REVIEWED', reviewed_by = $2, reviewed_at = now(), updated_at = now() WHERE id = $1`,
      [id, reviewedBy],
    );
  }
}

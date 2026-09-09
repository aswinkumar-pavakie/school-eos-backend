import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ApprovalStepRow {
  id: string;
  requestId: string;
  sequenceNo: number;
  approverRoleCode: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decision: string | null;
  comment: string | null;
  decidedAt: Date | null;
  escalatedAt: Date | null;
}

function mapRow(row: any): ApprovalStepRow {
  return {
    id: row.id,
    requestId: row.request_id,
    sequenceNo: row.sequence_no,
    approverRoleCode: row.approver_role_code,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by_name ?? null,
    decision: row.decision,
    comment: row.comment,
    decidedAt: row.decided_at,
    escalatedAt: row.escalated_at,
  };
}

@Injectable()
export class ApprovalStepRepository {
  constructor(private readonly postgres: PostgresService) {}

  async createMany(
    requestId: string,
    steps: { sequenceNo: number; approverRoleCode: string }[],
    executor: Queryable,
  ): Promise<void> {
    for (const step of steps) {
      await executor.query(
        `INSERT INTO approval_step (request_id, sequence_no, approver_role_code)
         VALUES ($1, $2, $3)`,
        [requestId, step.sequenceNo, step.approverRoleCode],
      );
    }
  }

  async findByRequestAndSequence(
    requestId: string,
    sequenceNo: number,
    executor: Queryable = this.postgres,
  ): Promise<ApprovalStepRow | null> {
    const { rows } = await executor.query(
      `SELECT id, request_id, sequence_no, approver_role_code, decided_by, decision, comment,
              decided_at, escalated_at
       FROM approval_step WHERE request_id = $1 AND sequence_no = $2`,
      [requestId, sequenceNo],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** decidedByName is a real name, not just an id -- every "approved/rejected
   * by whom" display in the app (HR Payroll, Payslip request, Appraisal,
   * etc.) reads this instead of resolving the id separately. */
  async listByRequest(
    requestId: string,
    executor: Queryable = this.postgres,
  ): Promise<ApprovalStepRow[]> {
    const { rows } = await executor.query(
      `SELECT st.id, st.request_id, st.sequence_no, st.approver_role_code, st.decided_by,
              (p.first_name || COALESCE(' ' || p.last_name, '')) AS decided_by_name,
              st.decision, st.comment, st.decided_at, st.escalated_at
       FROM approval_step st
       LEFT JOIN person p ON p.id = st.decided_by
       WHERE st.request_id = $1 ORDER BY st.sequence_no ASC`,
      [requestId],
    );
    return rows.map(mapRow);
  }

  async hasNextStep(
    requestId: string,
    sequenceNo: number,
    executor: Queryable,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM approval_step WHERE request_id = $1 AND sequence_no = $2 LIMIT 1`,
      [requestId, sequenceNo + 1],
    );
    return rows.length > 0;
  }

  async recordDecision(
    stepId: string,
    decidedBy: string,
    decision: 'APPROVED' | 'REJECTED',
    comment: string | null,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE approval_step
       SET decided_by = $2, decision = $3, comment = $4, decided_at = now()
       WHERE id = $1`,
      [stepId, decidedBy, decision, comment],
    );
  }
}

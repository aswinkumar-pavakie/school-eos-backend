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
  decision: string | null;
  comment: string | null;
  decidedAt: Date | null;
}

const COLUMNS = `id, request_id AS "requestId", sequence_no AS "sequenceNo",
  approver_role_code AS "approverRoleCode", decided_by AS "decidedBy", decision, comment,
  decided_at AS "decidedAt"`;

@Injectable()
export class ApprovalStepRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByRequestId(
    requestId: string,
    executor: Queryable = this.postgres,
  ): Promise<ApprovalStepRow[]> {
    const { rows } = await executor.query<ApprovalStepRow>(
      `SELECT ${COLUMNS} FROM approval_step WHERE request_id = $1 ORDER BY sequence_no`,
      [requestId],
    );
    return rows;
  }

  async create(
    requestId: string,
    sequenceNo: number,
    approverRoleCode: string,
    executor: Queryable,
  ): Promise<ApprovalStepRow> {
    const { rows } = await executor.query<ApprovalStepRow>(
      `INSERT INTO approval_step (request_id, sequence_no, approver_role_code)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [requestId, sequenceNo, approverRoleCode],
    );
    return rows[0];
  }

  async decide(
    requestId: string,
    sequenceNo: number,
    decision: 'APPROVED' | 'REJECTED',
    decidedBy: string,
    comment: string | null,
    executor: Queryable,
  ): Promise<ApprovalStepRow | null> {
    const { rows } = await executor.query<ApprovalStepRow>(
      `UPDATE approval_step SET decision = $3, decided_by = $4, comment = $5, decided_at = now()
       WHERE request_id = $1 AND sequence_no = $2
       RETURNING ${COLUMNS}`,
      [requestId, sequenceNo, decision, decidedBy, comment],
    );
    return rows[0] ?? null;
  }
}

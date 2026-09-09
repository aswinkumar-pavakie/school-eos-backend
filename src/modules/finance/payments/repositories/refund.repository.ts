import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';

export interface RefundRow {
  id: string;
  paymentId: string | null;
  studentId: string;
  amountPaise: string;
  reason: string;
  refundToSourceRef: string | null;
  approvalRequestId: string | null;
  state: string;
  processedAt: Date | null;
  createdAt: Date;
}

function mapRow(row: any): RefundRow {
  return {
    id: row.id,
    paymentId: row.payment_id,
    studentId: row.student_id,
    amountPaise: row.amount_paise,
    reason: row.reason,
    refundToSourceRef: row.refund_to_source_ref,
    approvalRequestId: row.approval_request_id,
    state: row.state,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

@Injectable()
export class RefundRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      paymentId: string | null;
      studentId: string;
      amountPaise: string;
      reason: string;
    },
    executor: Queryable,
  ): Promise<RefundRow> {
    const { rows } = await executor.query(
      `INSERT INTO refund (payment_id, student_id, amount_paise, reason, state)
       VALUES ($1, $2, $3, $4, 'PENDING')
       RETURNING *`,
      [input.paymentId, input.studentId, input.amountPaise, input.reason],
    );
    return mapRow(rows[0]);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<RefundRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM refund WHERE id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async listByPayment(
    paymentId: string,
    executor: Queryable = this.postgres,
  ): Promise<RefundRow[]> {
    const { rows } = await executor.query(
      `SELECT * FROM refund WHERE payment_id = $1 ORDER BY created_at DESC`,
      [paymentId],
    );
    return rows.map(mapRow);
  }

  async linkApprovalRequest(
    id: string,
    approvalRequestId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE refund SET approval_request_id = $2 WHERE id = $1`,
      [id, approvalRequestId],
    );
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<RefundRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM refund WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** Below-threshold direct path: Finance's own authority clears it immediately (still not PROCESSED — that's a separate payout-confirmation step). */
  async autoApprove(id: string, executor: Queryable): Promise<void> {
    await executor.query(`UPDATE refund SET state = 'APPROVED' WHERE id = $1`, [
      id,
    ]);
  }

  async markRejected(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE refund SET state = 'REJECTED', processed_at = now() WHERE id = $1`,
      [id],
    );
  }

  /** APPROVED -> PROCESSED: Finance confirms the money has actually been sent back. */
  async markPayoutProcessed(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE refund SET state = 'PROCESSED', processed_at = now() WHERE id = $1`,
      [id],
    );
  }
}

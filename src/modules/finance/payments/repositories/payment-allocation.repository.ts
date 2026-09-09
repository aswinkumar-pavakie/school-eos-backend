import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';

export interface ReceiptLineItemRow {
  feeHeadId: string | null;
  feeHeadName: string | null;
  instalmentNo: number;
  amountPaise: string;
}

export interface PaymentAllocationRow {
  id: string;
  paymentId: string;
  feeDemandId: string;
  amountPaise: string;
  allocatedAt: Date;
}

function mapRow(row: any): PaymentAllocationRow {
  return {
    id: row.id,
    paymentId: row.payment_id,
    feeDemandId: row.fee_demand_id,
    amountPaise: row.amount_paise,
    allocatedAt: row.allocated_at,
  };
}

@Injectable()
export class PaymentAllocationRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    paymentId: string,
    feeDemandId: string,
    amountPaise: string,
    executor: Queryable,
  ): Promise<PaymentAllocationRow> {
    const { rows } = await executor.query(
      `INSERT INTO payment_allocation (payment_id, fee_demand_id, amount_paise)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [paymentId, feeDemandId, amountPaise],
    );
    return mapRow(rows[0]);
  }

  async listByPayment(
    paymentId: string,
    executor: Queryable = this.postgres,
  ): Promise<PaymentAllocationRow[]> {
    const { rows } = await executor.query(
      `SELECT * FROM payment_allocation WHERE payment_id = $1 ORDER BY allocated_at ASC`,
      [paymentId],
    );
    return rows.map(mapRow);
  }

  async sumAllocatedForPayment(
    paymentId: string,
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `SELECT COALESCE(SUM(amount_paise), 0)::text AS total FROM payment_allocation WHERE payment_id = $1`,
      [paymentId],
    );
    return rows[0].total;
  }

  /** Distinct students covered by a payment's allocations, for per-student receipt generation. */
  async listDistinctStudentsForPayment(
    paymentId: string,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const { rows } = await executor.query(
      `SELECT DISTINCT fd.student_id
       FROM payment_allocation pa
       JOIN fee_demand fd ON fd.id = pa.fee_demand_id
       WHERE pa.payment_id = $1`,
      [paymentId],
    );
    return rows.map((r: any) => r.student_id);
  }

  /** Total allocated toward a specific student from a specific payment, for receipt amount. */
  async sumAllocatedForPaymentAndStudent(
    paymentId: string,
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `SELECT COALESCE(SUM(pa.amount_paise), 0)::text AS total
       FROM payment_allocation pa
       JOIN fee_demand fd ON fd.id = pa.fee_demand_id
       WHERE pa.payment_id = $1 AND fd.student_id = $2`,
      [paymentId, studentId],
    );
    return rows[0].total;
  }

  /** The receipt's own "Particulars" table — one line per fee head this payment
   * actually settled for this student, real amounts straight off payment_allocation,
   * never invented or estimated. */
  async listLineItemsForReceipt(
    paymentId: string,
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<ReceiptLineItemRow[]> {
    const { rows } = await executor.query(
      `SELECT fh.id AS fee_head_id, fh.name AS fee_head_name, fd.instalment_no, pa.amount_paise
       FROM payment_allocation pa
       JOIN fee_demand fd ON fd.id = pa.fee_demand_id
       LEFT JOIN fee_head fh ON fh.id = fd.fee_head_id
       WHERE pa.payment_id = $1 AND fd.student_id = $2
       ORDER BY fd.instalment_no ASC`,
      [paymentId, studentId],
    );
    return rows.map((r: any) => ({
      feeHeadId: r.fee_head_id,
      feeHeadName: r.fee_head_name,
      instalmentNo: r.instalment_no,
      amountPaise: r.amount_paise,
    }));
  }
}

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../../infrastructure/postgres/postgres.service';

export interface ReceiptRow {
  id: string;
  paymentId: string;
  studentId: string;
  receiptNo: string;
  financialYear: string;
  amountPaise: string;
  issuedOn: Date;
  pdfObjectKey: string | null;
  isReprintOf: string | null;
}

function mapRow(row: any): ReceiptRow {
  return {
    id: row.id,
    paymentId: row.payment_id,
    studentId: row.student_id,
    receiptNo: row.receipt_no,
    financialYear: row.financial_year,
    amountPaise: row.amount_paise,
    issuedOn: row.issued_on,
    pdfObjectKey: row.pdf_object_key,
    isReprintOf: row.is_reprint_of,
  };
}

@Injectable()
export class ReceiptRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findById(id: string, executor: Queryable = this.postgres): Promise<ReceiptRow | null> {
    const { rows } = await executor.query(`SELECT * FROM receipt WHERE id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByPaymentAndStudent(
    paymentId: string,
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<ReceiptRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM receipt WHERE payment_id = $1 AND student_id = $2 AND is_reprint_of IS NULL`,
      [paymentId, studentId],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async listByPayment(paymentId: string, executor: Queryable = this.postgres): Promise<ReceiptRow[]> {
    const { rows } = await executor.query(
      `SELECT * FROM receipt WHERE payment_id = $1 ORDER BY issued_on ASC`,
      [paymentId],
    );
    return rows.map(mapRow);
  }

  async countForFinancialYear(financialYear: string, executor: Queryable): Promise<number> {
    const { rows } = await executor.query(
      `SELECT COUNT(*)::int AS count FROM receipt WHERE financial_year = $1`,
      [financialYear],
    );
    return rows[0].count;
  }

  async create(
    input: {
      paymentId: string;
      studentId: string;
      receiptNo: string;
      financialYear: string;
      amountPaise: string;
      isReprintOf?: string | null;
    },
    executor: Queryable,
  ): Promise<ReceiptRow> {
    const { rows } = await executor.query(
      `INSERT INTO receipt (payment_id, student_id, receipt_no, financial_year, amount_paise, is_reprint_of)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.paymentId,
        input.studentId,
        input.receiptNo,
        input.financialYear,
        input.amountPaise,
        input.isReprintOf ?? null,
      ],
    );
    return mapRow(rows[0]);
  }
}

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface PaymentRow {
  id: string;
  studentId: string | null;
  studentFirstName: string | null;
  studentLastName: string | null;
  admissionNo: string | null;
  amountPaise: string;
  mode: string;
  state: string;
  gatewayRef: string | null;
  initiatedAt: Date;
  confirmedAt: Date | null;
  receiptNo: string | null;
  issuedOn: string | null;
  collectedByName: string | null;
}

export interface PaymentFilter {
  search?: string;
  state?: string;
  mode?: string;
  academicYearId?: string;
  limit: number;
  offset: number;
}

const COLUMNS = `pay.id, fd.student_id AS "studentId", p.first_name AS "studentFirstName",
  p.last_name AS "studentLastName", s.admission_no AS "admissionNo",
  pay.amount_paise AS "amountPaise", pay.mode, pay.state, pay.gateway_ref AS "gatewayRef",
  pay.initiated_at AS "initiatedAt", pay.confirmed_at AS "confirmedAt",
  r.receipt_no AS "receiptNo", r.issued_on AS "issuedOn",
  (CASE WHEN cb.id IS NOT NULL THEN trim(both ' ' from cb.first_name || ' ' || coalesce(cb.last_name, '')) END)
    AS "collectedByName"`;

const FROM = `payment pay
  LEFT JOIN payment_allocation pa ON pa.payment_id = pay.id
  LEFT JOIN fee_demand fd ON fd.id = pa.fee_demand_id
  LEFT JOIN student_fee_assignment sfa ON sfa.id = fd.assignment_id
  LEFT JOIN student s ON s.id = fd.student_id
  LEFT JOIN person p ON p.id = s.person_id
  LEFT JOIN receipt r ON r.payment_id = pay.id
  LEFT JOIN person cb ON cb.id = pay.collected_by`;

/** Admin's read-only payment/receipt visibility -- section 4 of Admin ->
 * Finance. Every payment a student's guardian (or the student) has made,
 * whichever fee instalment(s) it was allocated against. No payment actions
 * live here -- Finance owns collect/refund/reconcile. A payment can be
 * allocated across several instalments but never spans more than one student
 * in this schema, so the DISTINCT-per-payment join is safe here. */
@Injectable()
export class PaymentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: PaymentFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: PaymentRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.academicYearId) {
      params.push(filter.academicYearId);
      conditions.push(`sfa.academic_year_id = $${params.length}`);
    }
    if (filter.state) {
      params.push(filter.state);
      conditions.push(`pay.state = $${params.length}`);
    }
    if (filter.mode) {
      params.push(filter.mode);
      conditions.push(`pay.mode = $${params.length}`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(coalesce(p.first_name, '')) LIKE $${params.length} OR lower(coalesce(p.last_name, '')) LIKE $${params.length}
          OR lower(coalesce(s.admission_no, '')) LIKE $${params.length} OR lower(coalesce(r.receipt_no, '')) LIKE $${params.length}
          OR lower(coalesce(pay.gateway_ref, '')) LIKE $${params.length})`,
      );
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(DISTINCT pay.id) FROM ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<PaymentRow>(
      `SELECT DISTINCT ${COLUMNS} FROM ${FROM} ${where}
       ORDER BY pay.initiated_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }
}

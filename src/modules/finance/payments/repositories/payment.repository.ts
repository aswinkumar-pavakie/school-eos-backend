import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../../infrastructure/postgres/postgres.service';
import { PageQuery, toOffsetLimit } from '../../../../common/pagination/pagination.util';
import { OFFLINE_MODES } from '../dto/create-payment.dto';

export interface PaymentRow {
  id: string;
  paidByPersonId: string | null;
  amountPaise: string;
  mode: string;
  gateway: string | null;
  gatewayRef: string | null;
  idempotencyKey: string;
  state: string;
  initiatedAt: Date;
  confirmedAt: Date | null;
  reconciledAt: Date | null;
  failureReason: string | null;
  collectedBy: string | null;
}

function mapRow(row: any): PaymentRow {
  return {
    id: row.id,
    paidByPersonId: row.paid_by_person_id,
    amountPaise: row.amount_paise,
    mode: row.mode,
    gateway: row.gateway,
    gatewayRef: row.gateway_ref,
    idempotencyKey: row.idempotency_key,
    state: row.state,
    initiatedAt: row.initiated_at,
    confirmedAt: row.confirmed_at,
    reconciledAt: row.reconciled_at,
    failureReason: row.failure_reason,
    collectedBy: row.collected_by,
  };
}

export interface EducationLoanDDRow extends PaymentRow {
  studentId: string;
  studentDisplayName: string;
  studentAdmissionNo: string;
}

function mapDDRow(row: any): EducationLoanDDRow {
  return { ...mapRow(row), studentId: row.student_id, studentDisplayName: row.display_name, studentAdmissionNo: row.admission_no };
}

/** What the Payments list needs beyond the bare payment row: a human-readable "who
 * paid this for" (blank for a genuinely multi-student split payment) and, when the
 * payment resolved to exactly one receipt, that receipt's own id/number so the row
 * can link straight to Print — a real multi-student split still routes through the
 * payment's own detail page, where every receipt is listed individually. */
export interface PaymentListRow extends PaymentRow {
  studentNames: string | null;
  receiptId: string | null;
  receiptNo: string | null;
  receiptCount: number;
}

function mapListRow(row: any): PaymentListRow {
  // COUNT(*) comes back from pg as a bigint-typed string even with ::int cast SQL-side
  // in some drivers' type-parsing config — Number(...) here is the real fix, the ::int
  // cast above is belt-and-suspenders. A loose `=== 1` against whatever the driver
  // handed back was the actual bug: it silently never matched a string "1".
  const receiptCount = Number(row.receipt_count ?? 0);
  return {
    ...mapRow(row),
    studentNames: row.student_names ?? null,
    receiptId: receiptCount === 1 ? row.first_receipt_id : null,
    receiptNo: receiptCount === 1 ? row.first_receipt_no : null,
    receiptCount,
  };
}

@Injectable()
export class PaymentRepository {
  constructor(private readonly postgres: PostgresService) {}

  isOfflineMode(mode: string): boolean {
    return OFFLINE_MODES.includes(mode as any);
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
    executor: Queryable = this.postgres,
  ): Promise<PaymentRow | null> {
    const { rows } = await executor.query(`SELECT * FROM payment WHERE idempotency_key = $1`, [
      idempotencyKey,
    ]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async createOfflineConfirmed(
    input: {
      paidByPersonId: string | null;
      amountPaise: string;
      mode: string;
      idempotencyKey: string;
      collectedBy: string;
      // For DD specifically: bank name (reuses `gateway`) + DD reference number
      // (reuses `gateway_ref`) — same columns the online-gateway path uses for its
      // own reference pair, repurposed rather than adding new columns (no schema
      // change; see Finance README's "Education Loan DD" note).
      gateway?: string | null;
      gatewayRef?: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<PaymentRow> {
    const { rows } = await executor.query(
      `INSERT INTO payment
         (paid_by_person_id, amount_paise, mode, idempotency_key, state, confirmed_at, collected_by, gateway, gateway_ref)
       VALUES ($1, $2, $3, $4, 'CONFIRMED', now(), $5, $6, $7)
       RETURNING *`,
      [
        input.paidByPersonId,
        input.amountPaise,
        input.mode,
        input.idempotencyKey,
        input.collectedBy,
        input.gateway ?? null,
        input.gatewayRef ?? null,
      ],
    );
    return mapRow(rows[0]);
  }

  /**
   * DD only: a demand draft can bounce, so it starts PENDING (received, not yet
   * cleared by the bank) rather than instantly CONFIRMED like CASH/CHEQUE — see
   * markCleared below for the step that actually confirms it.
   */
  async createOfflinePending(
    input: {
      paidByPersonId: string | null;
      amountPaise: string;
      mode: string;
      idempotencyKey: string;
      collectedBy: string;
      gateway?: string | null;
      gatewayRef?: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<PaymentRow> {
    const { rows } = await executor.query(
      `INSERT INTO payment
         (paid_by_person_id, amount_paise, mode, idempotency_key, state, collected_by, gateway, gateway_ref)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7)
       RETURNING *`,
      [
        input.paidByPersonId,
        input.amountPaise,
        input.mode,
        input.idempotencyKey,
        input.collectedBy,
        input.gateway ?? null,
        input.gatewayRef ?? null,
      ],
    );
    return mapRow(rows[0]);
  }

  /** DD only: bank has cleared it — PENDING -> CONFIRMED. */
  async markCleared(id: string, executor: Queryable): Promise<void> {
    await executor.query(`UPDATE payment SET state = 'CONFIRMED', confirmed_at = now() WHERE id = $1`, [id]);
  }

  async createIntent(
    input: {
      paidByPersonId: string | null;
      amountPaise: string;
      mode: string;
      gateway: string;
      idempotencyKey: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<PaymentRow> {
    const { rows } = await executor.query(
      `INSERT INTO payment (paid_by_person_id, amount_paise, mode, gateway, idempotency_key, state)
       VALUES ($1, $2, $3, $4, $5, 'INITIATED')
       RETURNING *`,
      [input.paidByPersonId, input.amountPaise, input.mode, input.gateway, input.idempotencyKey],
    );
    return mapRow(rows[0]);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<PaymentRow | null> {
    const { rows } = await executor.query(`SELECT * FROM payment WHERE id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(id: string, executor: Queryable): Promise<PaymentRow | null> {
    const { rows } = await executor.query(`SELECT * FROM payment WHERE id = $1 FOR UPDATE`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByGatewayRef(
    gateway: string,
    gatewayRef: string,
    executor: Queryable = this.postgres,
  ): Promise<PaymentRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM payment WHERE gateway = $1 AND gateway_ref = $2`,
      [gateway, gatewayRef],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIdempotencyKeyForUpdate(
    idempotencyKey: string,
    executor: Queryable,
  ): Promise<PaymentRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM payment WHERE idempotency_key = $1 FOR UPDATE`,
      [idempotencyKey],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** Payments touching a given student, found via payment_allocation -> fee_demand -> student_id (payment itself has no direct student column — one payment can cover several students at once). Carries this student's own receipt id/number (unambiguous here — student is fixed) so the Student Workspace's Payment History can link straight to Print. */
  async listForStudent(
    studentId: string,
    filter: { mode?: string } = {},
    executor: Queryable = this.postgres,
  ): Promise<PaymentListRow[]> {
    const { rows } = await executor.query(
      `SELECT DISTINCT pay.*,
         NULL::text AS student_names,
         (SELECT COUNT(*) FROM receipt r WHERE r.payment_id = pay.id AND r.student_id = $1 AND r.is_reprint_of IS NULL)::int AS receipt_count,
         (SELECT r.id FROM receipt r WHERE r.payment_id = pay.id AND r.student_id = $1 AND r.is_reprint_of IS NULL ORDER BY r.issued_on ASC LIMIT 1) AS first_receipt_id,
         (SELECT r.receipt_no FROM receipt r WHERE r.payment_id = pay.id AND r.student_id = $1 AND r.is_reprint_of IS NULL ORDER BY r.issued_on ASC LIMIT 1) AS first_receipt_no
       FROM payment pay
       JOIN payment_allocation pa ON pa.payment_id = pay.id
       JOIN fee_demand fd ON fd.id = pa.fee_demand_id
       WHERE fd.student_id = $1 AND ($2::text IS NULL OR pay.mode = $2)
       ORDER BY pay.initiated_at DESC`,
      [studentId, filter.mode ?? null],
    );
    return rows.map(mapListRow);
  }

  /** Global "Education Loan DD" nav page — every DD-mode payment across every student, joined with student identity for display+search. */
  async listAllEducationLoanDDs(
    filter: { search?: string; state?: string },
    page: PageQuery,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: EducationLoanDDRow[]; total: number }> {
    const { offset, limit } = toOffsetLimit(page);
    const joinClause = `
      FROM payment pay
      JOIN payment_allocation pa ON pa.payment_id = pay.id
      JOIN fee_demand fd ON fd.id = pa.fee_demand_id
      JOIN student s ON s.id = fd.student_id
      JOIN person p ON p.id = s.person_id
      WHERE pay.mode = 'DD'
        AND ($1::text IS NULL OR pay.state = $1)
        AND ($2::text IS NULL OR p.display_name ILIKE '%' || $2 || '%' OR s.admission_no ILIKE '%' || $2 || '%' OR pay.gateway_ref ILIKE '%' || $2 || '%')
    `;
    const { rows: countRows } = await executor.query(
      `SELECT COUNT(DISTINCT pay.id)::int AS total ${joinClause}`,
      [filter.state ?? null, filter.search ?? null],
    );
    const { rows } = await executor.query(
      `SELECT DISTINCT pay.*, s.id AS student_id, s.admission_no, p.display_name ${joinClause}
       ORDER BY pay.initiated_at DESC LIMIT $3 OFFSET $4`,
      [filter.state ?? null, filter.search ?? null, limit, offset],
    );
    return { rows: rows.map(mapDDRow), total: countRows[0].total };
  }

  async list(
    filter: { state?: string; mode?: string; studentSearch?: string; fromDate?: string; toDate?: string },
    page: PageQuery,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: PaymentListRow[]; total: number }> {
    const { offset, limit } = toOffsetLimit(page);
    const search = filter.studentSearch?.trim() ? `%${filter.studentSearch.trim()}%` : null;
    const params = [
      filter.state ?? null,
      filter.mode ?? null,
      filter.fromDate ?? null,
      filter.toDate ?? null,
      search,
    ];
    // "which student(s) is this for" only exists via payment_allocation -> fee_demand
    // -> student -> person — a payment itself carries no student_id (it may legitimately
    // cover several students in one transaction). studentSearch matches against that
    // same join, not a column on payment.
    const whereClause = `
      WHERE ($1::text IS NULL OR p.state = $1)
        AND ($2::text IS NULL OR p.mode = $2)
        AND ($3::date IS NULL OR p.initiated_at::date >= $3)
        AND ($4::date IS NULL OR p.initiated_at::date <= $4)
        AND ($5::text IS NULL OR EXISTS (
          SELECT 1 FROM payment_allocation pa2
          JOIN fee_demand fd2 ON fd2.id = pa2.fee_demand_id
          JOIN student s2 ON s2.id = fd2.student_id
          JOIN person p2 ON p2.id = s2.person_id
          WHERE pa2.payment_id = p.id AND (p2.display_name ILIKE $5 OR s2.admission_no ILIKE $5)
        ))
    `;
    const { rows: countRows } = await executor.query(
      `SELECT COUNT(*)::int AS total FROM payment p ${whereClause}`,
      params,
    );
    const { rows } = await executor.query(
      `SELECT p.*,
         (SELECT string_agg(DISTINCT per.display_name, ', ')
          FROM payment_allocation pa
          JOIN fee_demand fd ON fd.id = pa.fee_demand_id
          JOIN student st ON st.id = fd.student_id
          JOIN person per ON per.id = st.person_id
          WHERE pa.payment_id = p.id) AS student_names,
         (SELECT COUNT(*) FROM receipt r WHERE r.payment_id = p.id AND r.is_reprint_of IS NULL)::int AS receipt_count,
         (SELECT r.id FROM receipt r WHERE r.payment_id = p.id AND r.is_reprint_of IS NULL ORDER BY r.issued_on ASC LIMIT 1) AS first_receipt_id,
         (SELECT r.receipt_no FROM receipt r WHERE r.payment_id = p.id AND r.is_reprint_of IS NULL ORDER BY r.issued_on ASC LIMIT 1) AS first_receipt_no
       FROM payment p
       ${whereClause}
       ORDER BY p.initiated_at DESC LIMIT $6 OFFSET $7`,
      [...params, limit, offset],
    );
    return { rows: rows.map(mapListRow), total: countRows[0].total };
  }

  async markConfirmedFromWebhook(
    id: string,
    gateway: string,
    gatewayRef: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE payment SET state = 'CONFIRMED', confirmed_at = now(), gateway = $2, gateway_ref = $3
       WHERE id = $1`,
      [id, gateway, gatewayRef],
    );
  }

  async markFailedFromWebhook(id: string, reason: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE payment SET state = 'FAILED', failure_reason = $2 WHERE id = $1`,
      [id, reason],
    );
  }

  // Real payment_state_check includes RECONCILED as its own terminal state (not just a
  // timestamp on top of CONFIRMED) — payment_confirmed_ts requires confirmed_at to
  // stay non-null for both CONFIRMED and RECONCILED, which it already is by the time a
  // reconciliation run can match this row (only CONFIRMED payments are matched).
  async markReconciled(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE payment SET state = 'RECONCILED', reconciled_at = now() WHERE id = $1`,
      [id],
    );
  }
}

// Canteen counter's own reads/writes -- see database/migrations/0028_canteen_transactions.sql
// and 0029_canteen_transaction_idempotency.sql for why this table and its
// idempotency_key column exist (the `wallet` table already tracked
// balance/freeze but nothing ever recorded an actual spend, and a POS
// charge is exactly the kind of write a client-side network retry could
// silently duplicate without one). `chargeWallet` is the one real write
// here and always runs inside UnitOfWork.run() from CanteenService (the
// idempotency check, row lock, balance check, debit and ledger insert must
// all be one atomic unit, or two near-simultaneous charges -- or a retried
// one -- could double-spend the same balance).

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CanteenStudentSearchRow {
  id: string;
  firstName: string;
  lastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  walletId: string | null;
  balancePaise: string | null;
  walletStatus: string | null;
}

export interface CanteenHistoryRow {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  amountPaise: string;
  balanceAfterPaise: string;
  createdAt: Date;
  performedByFirstName: string | null;
  performedByLastName: string | null;
}

export interface ChargeResult {
  transactionId: string;
  balanceAfterPaise: string;
  createdAt: Date;
  /** True when this call found and returned an EXISTING charge for the
   * same idempotencyKey instead of debiting the wallet again -- the
   * caller (CanteenService) uses this to audit a replay distinctly from a
   * genuine first-time charge, without ever re-touching the wallet. */
  replayed: boolean;
}

// One student's name/admission no, joined the same way everywhere else in
// this codebase joins student -> person -> current (ACTIVE) enrolment ->
// section -> grade (see attendance-record.repository.ts's own
// findBySessionId for the same shape).
const STUDENT_JOIN = `
  FROM student s
  JOIN person p ON p.id = s.person_id
  LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id
`;

@Injectable()
export class CanteenRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Stand-in for an NFC card tap -- canteen staff types a name/admission
   * number and picks the match themselves. Only ACTIVE students, since a
   * left-school student's wallet shouldn't be reachable at the counter. */
  async searchStudents(
    query: string,
    executor: Queryable = this.postgres,
  ): Promise<CanteenStudentSearchRow[]> {
    const { rows } = await executor.query<CanteenStudentSearchRow>(
      `SELECT s.id, p.first_name AS "firstName", p.last_name AS "lastName",
              s.admission_no AS "admissionNo", g.name AS "gradeName", sec.name AS "sectionName",
              w.id AS "walletId", w.balance_paise AS "balancePaise", w.status AS "walletStatus"
       ${STUDENT_JOIN}
       LEFT JOIN wallet w ON w.student_id = s.id
       WHERE s.status = 'ACTIVE'
         AND (p.first_name ILIKE $1 OR p.last_name ILIKE $1 OR s.admission_no ILIKE $1)
       ORDER BY p.first_name, p.last_name
       LIMIT 20`,
      [`%${query}%`],
    );
    return rows;
  }

  /** Must be called with the SAME `executor` the rest of a charge attempt
   * runs under (a live transaction client, not the bare pool) -- called
   * again here on purpose right before the debit (not trusted from an
   * earlier, separate pre-check) so a student who went inactive between
   * the search and the charge can't slip through a stale check. */
  async getStudentBasicInfo(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<{
    id: string;
    firstName: string;
    lastName: string | null;
    admissionNo: string;
  } | null> {
    const { rows } = await executor.query(
      `SELECT s.id, p.first_name AS "firstName", p.last_name AS "lastName", s.admission_no AS "admissionNo"
       FROM student s JOIN person p ON p.id = s.person_id
       WHERE s.id = $1 AND s.status = 'ACTIVE'`,
      [studentId],
    );
    return rows[0] ?? null;
  }

  /** Must run inside a transaction (UnitOfWork) -- `client` is a live
   * PoolClient mid-BEGIN, never the plain pool, so the row lock below
   * actually holds until the caller commits/rolls back. */
  async chargeWallet(
    input: {
      studentId: string;
      amountPaise: number;
      performedBy: string;
      idempotencyKey: string;
    },
    client: PoolClient,
  ): Promise<ChargeResult> {
    // Idempotent replay: this exact attempt (by its client-generated key)
    // already went through -- hand back the original result verbatim
    // instead of touching the wallet again. Checked first, inside the same
    // transaction as the rest of this call, so a retry racing the original
    // request either sees it committed (and replays) or waits on the row
    // lock below until it is (nothing in between).
    const existing = await client.query(
      `SELECT id, balance_after_paise, created_at FROM canteen_transaction WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    if (existing.rows.length > 0) {
      return {
        transactionId: existing.rows[0].id,
        balanceAfterPaise: existing.rows[0].balance_after_paise,
        createdAt: existing.rows[0].created_at,
        replayed: true,
      };
    }

    const walletRes = await client.query(
      `SELECT id, balance_paise, status FROM wallet WHERE student_id = $1 FOR UPDATE`,
      [input.studentId],
    );
    const wallet = walletRes.rows[0] as
      { id: string; balance_paise: string; status: string } | undefined;
    if (!wallet) {
      throw new Error('WALLET_NOT_FOUND');
    }
    if (wallet.status !== 'ACTIVE') {
      throw new Error('WALLET_FROZEN');
    }
    const currentBalance = BigInt(wallet.balance_paise);
    const amount = BigInt(input.amountPaise);
    if (currentBalance < amount) {
      throw new Error('INSUFFICIENT_BALANCE');
    }
    const newBalance = currentBalance - amount;

    await client.query(
      `UPDATE wallet SET balance_paise = $2, version = version + 1, updated_at = now() WHERE id = $1`,
      [wallet.id, newBalance.toString()],
    );
    const txRes = await client.query(
      `INSERT INTO canteen_transaction (student_id, wallet_id, amount_paise, balance_after_paise, performed_by, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        input.studentId,
        wallet.id,
        input.amountPaise,
        newBalance.toString(),
        input.performedBy,
        input.idempotencyKey,
      ],
    );
    return {
      transactionId: txRes.rows[0].id,
      balanceAfterPaise: newBalance.toString(),
      createdAt: txRes.rows[0].created_at,
      replayed: false,
    };
  }

  async listHistory(
    limit: number,
    offset: number,
    executor: Queryable = this.postgres,
  ): Promise<CanteenHistoryRow[]> {
    const { rows } = await executor.query<CanteenHistoryRow>(
      `SELECT ct.id, ct.student_id AS "studentId", p.first_name AS "firstName", p.last_name AS "lastName",
              s.admission_no AS "admissionNo", g.name AS "gradeName", sec.name AS "sectionName",
              ct.amount_paise AS "amountPaise", ct.balance_after_paise AS "balanceAfterPaise",
              ct.created_at AS "createdAt",
              pf.first_name AS "performedByFirstName", pf.last_name AS "performedByLastName"
       FROM canteen_transaction ct
       JOIN student s ON s.id = ct.student_id
       JOIN person p ON p.id = s.person_id
       LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
       LEFT JOIN section sec ON sec.id = se.section_id
       LEFT JOIN grade g ON g.id = sec.grade_id
       LEFT JOIN person pf ON pf.id = ct.performed_by
       ORDER BY ct.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows;
  }

  /** One day's 3 headline numbers in one query -- `dateOffset` 0 is today,
   * 1 is yesterday (used for the dashboard's day-over-day comparison), via
   * the same plain-CURRENT_DATE idiom already used everywhere else in this
   * codebase for a "today" filter (see shoot-assignment.repository.ts's own
   * countToday()), not a bespoke timezone-aware calculation. */
  async getDaySummary(
    dateOffset: number,
    executor: Queryable = this.postgres,
  ): Promise<{
    salesPaise: string;
    transactionCount: number;
    uniqueStudents: number;
  }> {
    const { rows } = await executor.query(
      `SELECT COALESCE(SUM(amount_paise), 0) AS "salesPaise",
              COUNT(*)::int AS "transactionCount",
              COUNT(DISTINCT student_id)::int AS "uniqueStudents"
       FROM canteen_transaction
       WHERE created_at::date = CURRENT_DATE - $1::int`,
      [dateOffset],
    );
    return rows[0];
  }

  /** Today's real spend broken down by grade -- tells the vendor which
   * classes are actually buying today, real signal for what/how much to
   * stock. Ranked highest-first; the service layer folds anything past the
   * top slots into "Other", same convention the website Reports module's
   * own assignCategoricalColors() already uses for a categorical chart. */
  async getGradeBreakdownToday(
    executor: Queryable = this.postgres,
  ): Promise<{ gradeName: string | null; totalPaise: string }[]> {
    const { rows } = await executor.query(
      `SELECT g.name AS "gradeName", SUM(ct.amount_paise) AS "totalPaise"
       FROM canteen_transaction ct
       JOIN student s ON s.id = ct.student_id
       LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
       LEFT JOIN section sec ON sec.id = se.section_id
       LEFT JOIN grade g ON g.id = sec.grade_id
       WHERE ct.created_at::date = CURRENT_DATE
       GROUP BY g.name
       ORDER BY SUM(ct.amount_paise) DESC`,
    );
    return rows;
  }

  /** Real count of charge attempts that were DENIED today (insufficient
   * balance, frozen wallet, student/wallet not found) -- the one friction
   * signal nothing else on this dashboard surfaces: a student who tried to
   * buy and couldn't. Reads the same audit_event rows CanteenService writes
   * on every failed charge (see its own header comment), never a second,
   * separate log. */
  async getDeclinedCountToday(
    executor: Queryable = this.postgres,
  ): Promise<number> {
    const { rows } = await executor.query(
      `SELECT COUNT(*)::int AS count FROM audit_event
       WHERE action = 'CANTEEN_WALLET_CHARGE_FAILED' AND occurred_at::date = CURRENT_DATE`,
    );
    return rows[0].count;
  }

  /** Last 7 days (including today), always exactly 7 rows -- generate_series
   * zero-fills any day with no sales directly in SQL, so the caller never
   * has to reconcile a sparse result set against JS-side date math (which
   * would risk a timezone mismatch against Postgres's own CURRENT_DATE). */
  async getWeeklySalesTrend(
    executor: Queryable = this.postgres,
  ): Promise<{ day: string; totalPaise: string }[]> {
    const { rows } = await executor.query(
      `SELECT d::date AS day, COALESCE(SUM(ct.amount_paise), 0) AS "totalPaise"
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d
       LEFT JOIN canteen_transaction ct ON ct.created_at::date = d::date
       GROUP BY d
       ORDER BY d`,
    );
    return rows;
  }

  /** Today only, one row per hour from 7am-7pm (a school's real operating
   * window) -- same zero-filling via generate_series as the weekly trend,
   * so a quiet hour renders as a real zero bar, not a missing one. */
  async getTodayHourlySales(
    executor: Queryable = this.postgres,
  ): Promise<{ hour: number; totalPaise: string }[]> {
    const { rows } = await executor.query(
      `SELECT h AS hour, COALESCE(SUM(ct.amount_paise), 0) AS "totalPaise"
       FROM generate_series(7, 19) AS h
       LEFT JOIN canteen_transaction ct
         ON EXTRACT(HOUR FROM ct.created_at)::int = h AND ct.created_at::date = CURRENT_DATE
       GROUP BY h
       ORDER BY h`,
    );
    return rows;
  }
}

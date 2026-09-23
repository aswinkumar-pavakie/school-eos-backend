// Canteen counter's own reads/writes -- see database/migrations/0028_canteen_transactions.sql,
// 0029_canteen_transaction_idempotency.sql, 0030_canteen_products.sql, and
// 0031_canteen_transaction_items.sql for why these tables and columns
// exist. `chargeWallet` is the one real money-moving write here and always
// runs inside UnitOfWork.run() from CanteenService: the idempotency check,
// row locks (wallet AND every product being sold), balance check, stock
// check, debit, stock decrement, and both ledger inserts must all be one
// atomic unit -- two near-simultaneous charges (or a retried one, or two
// vendors selling the last unit of the same product at once) could
// otherwise double-spend a balance or oversell stock below zero.

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';
import { CANTEEN_PRODUCTS_BUCKET } from '../canteen-product-storage.util';

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

export interface CanteenTransactionItemRow {
  id: string;
  transactionId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPricePaise: string;
  lineTotalPaise: string;
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
  itemsTotalPaise: string | null;
  balanceAfterPaise: string;
  createdAt: Date;
  performedByFirstName: string | null;
  performedByLastName: string | null;
}

export interface CanteenProductRow {
  id: string;
  name: string;
  imageObjectKey: string | null;
  imageUrl: string | null;
  quantity: number;
  pricePerUnitPaise: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChargeResult {
  transactionId: string;
  balanceAfterPaise: string;
  createdAt: Date;
  itemsTotalPaise: string;
  amountPaise: string;
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

function productImageUrlSql(column: string): string {
  const base = `${process.env.SUPABASE_URL ?? ''}/storage/v1/object/public/${CANTEEN_PRODUCTS_BUCKET}/`;
  return `(CASE WHEN ${column} IS NOT NULL THEN '${base}' || ${column} END)`;
}

// A FUNCTION, not a top-level const -- called fresh from inside each query
// method (request time), never evaluated once at module-import time. Node
// requires/evaluates this whole file (including any top-level const) before
// NestJS's ConfigModule has loaded .env into process.env, so a top-level
// const built from SUPABASE_URL here would freeze in as empty forever,
// regardless of what's actually in the env file or how many times the
// server restarts -- confirmed live (this exact bug, caught and fixed).
function productColumns(): string {
  return `id, name, image_object_key AS "imageObjectKey",
  ${productImageUrlSql('image_object_key')} AS "imageUrl",
  quantity, price_per_unit_paise AS "pricePerUnitPaise", is_active AS "isActive",
  created_at AS "createdAt", updated_at AS "updatedAt"`;
}

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

  // ============================================================
  // Inventory (canteen_product) -- full CRUD, this role's own real product
  // catalog. Every write is scoped to this table only; charging a wallet
  // (below) is the only place inventory quantity ever changes as a SIDE
  // EFFECT of something else.
  // ============================================================

  async listProducts(
    includeInactive: boolean,
    executor: Queryable = this.postgres,
  ): Promise<CanteenProductRow[]> {
    const where = includeInactive ? '' : 'WHERE is_active = true';
    const { rows } = await executor.query<CanteenProductRow>(
      `SELECT ${productColumns()} FROM canteen_product ${where} ORDER BY name ASC`,
    );
    return rows;
  }

  async getProductById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<CanteenProductRow | null> {
    const { rows } = await executor.query<CanteenProductRow>(
      `SELECT ${productColumns()} FROM canteen_product WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async createProduct(
    input: {
      name: string;
      quantity: number;
      pricePerUnitPaise: number;
      imageObjectKey: string | null;
      createdBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<CanteenProductRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO canteen_product (name, image_object_key, quantity, price_per_unit_paise, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.name,
        input.imageObjectKey,
        input.quantity,
        input.pricePerUnitPaise,
        input.createdBy,
      ],
    );
    return (await this.getProductById(rows[0].id, executor))!;
  }

  async updateProduct(
    id: string,
    input: Partial<{
      name: string;
      quantity: number;
      pricePerUnitPaise: number;
      isActive: boolean;
      imageObjectKey: string | null;
    }>,
    executor: Queryable = this.postgres,
  ): Promise<CanteenProductRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.name !== undefined) push('name', input.name);
    if (input.quantity !== undefined) push('quantity', input.quantity);
    if (input.pricePerUnitPaise !== undefined)
      push('price_per_unit_paise', input.pricePerUnitPaise);
    if (input.isActive !== undefined) push('is_active', input.isActive);
    if (input.imageObjectKey !== undefined)
      push('image_object_key', input.imageObjectKey);

    if (sets.length === 0) return this.getProductById(id, executor);

    params.push(id);
    await executor.query(
      `UPDATE canteen_product SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
      params,
    );
    return this.getProductById(id, executor);
  }

  async deleteProduct(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    // Hard delete, as this role explicitly needs full CRUD -- past sales
    // keep their own snapshot of this product's name/price in
    // canteen_transaction_item (product_id ON DELETE SET NULL there), so
    // deleting the catalog row never rewrites or breaks sale history.
    await executor.query(`DELETE FROM canteen_product WHERE id = $1`, [id]);
  }

  // ============================================================
  // Charging a wallet -- now a real multi-product sale, not a flat amount.
  // ============================================================

  /** Must run inside a transaction (UnitOfWork) -- `client` is a live
   * PoolClient mid-BEGIN, never the plain pool, so the row locks below
   * actually hold until the caller commits/rolls back. */
  async chargeWallet(
    input: {
      studentId: string;
      items: { productId: string; quantity: number }[];
      amountOverridePaise: number | null;
      performedBy: string;
      idempotencyKey: string;
    },
    client: PoolClient,
  ): Promise<ChargeResult> {
    // Idempotent replay: this exact attempt (by its client-generated key)
    // already went through -- hand back the original result verbatim
    // instead of touching the wallet or inventory again. Checked first,
    // inside the same transaction as the rest of this call, so a retry
    // racing the original request either sees it committed (and replays)
    // or waits on the row locks below until it is (nothing in between).
    const existing = await client.query(
      `SELECT id, balance_after_paise, created_at, amount_paise, items_total_paise
       FROM canteen_transaction WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        transactionId: row.id,
        balanceAfterPaise: row.balance_after_paise,
        createdAt: row.created_at,
        itemsTotalPaise: row.items_total_paise ?? row.amount_paise,
        amountPaise: row.amount_paise,
        replayed: true,
      };
    }

    // Lock every product being sold, in a fixed order (by id) to avoid a
    // classic deadlock if two concurrent sales both touch the same two
    // products in different orders.
    const productIds = [...new Set(input.items.map((i) => i.productId))].sort();
    const productsRes = await client.query(
      `SELECT id, name, quantity, price_per_unit_paise
       FROM canteen_product WHERE id = ANY($1) AND is_active = true
       ORDER BY id FOR UPDATE`,
      [productIds],
    );
    const productsById = new Map<
      string,
      { id: string; name: string; quantity: number; price_per_unit_paise: string }
    >(productsRes.rows.map((r) => [r.id, r]));

    let itemsTotal = 0n;
    const lineItems: {
      productId: string;
      productName: string;
      quantity: number;
      unitPricePaise: bigint;
      lineTotalPaise: bigint;
    }[] = [];
    for (const item of input.items) {
      const product = productsById.get(item.productId);
      if (!product) throw new Error('PRODUCT_NOT_FOUND');
      if (product.quantity < item.quantity) {
        throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
      }
      const unitPrice = BigInt(product.price_per_unit_paise);
      const lineTotal = unitPrice * BigInt(item.quantity);
      itemsTotal += lineTotal;
      lineItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPricePaise: unitPrice,
        lineTotalPaise: lineTotal,
      });
    }

    // The vendor may adjust the total DOWN (a discount, a rounding
    // correction) but never up past what the real items actually add up
    // to -- an override above itemsTotal would mean charging a student
    // for more than what was actually rung up, which is never legitimate
    // regardless of who/what is asking, so it's enforced here rather than
    // trusted from the request.
    if (
      input.amountOverridePaise !== null &&
      BigInt(input.amountOverridePaise) > itemsTotal
    ) {
      throw new Error('OVERRIDE_EXCEEDS_ITEMS_TOTAL');
    }
    const chargeAmount =
      input.amountOverridePaise !== null
        ? BigInt(input.amountOverridePaise)
        : itemsTotal;

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
    if (currentBalance < chargeAmount) {
      throw new Error('INSUFFICIENT_BALANCE');
    }
    const newBalance = currentBalance - chargeAmount;

    await client.query(
      `UPDATE wallet SET balance_paise = $2, version = version + 1, updated_at = now() WHERE id = $1`,
      [wallet.id, newBalance.toString()],
    );

    // Decrement real stock -- always by the REAL quantities sold, entirely
    // independent of any amountOverridePaise above.
    for (const item of lineItems) {
      await client.query(
        `UPDATE canteen_product SET quantity = quantity - $2, updated_at = now() WHERE id = $1`,
        [item.productId, item.quantity],
      );
    }

    const txRes = await client.query(
      `INSERT INTO canteen_transaction (student_id, wallet_id, amount_paise, items_total_paise, balance_after_paise, performed_by, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        input.studentId,
        wallet.id,
        chargeAmount.toString(),
        itemsTotal.toString(),
        newBalance.toString(),
        input.performedBy,
        input.idempotencyKey,
      ],
    );
    const transactionId = txRes.rows[0].id;

    for (const item of lineItems) {
      await client.query(
        `INSERT INTO canteen_transaction_item (transaction_id, product_id, product_name, quantity, unit_price_paise, line_total_paise)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          transactionId,
          item.productId,
          item.productName,
          item.quantity,
          item.unitPricePaise.toString(),
          item.lineTotalPaise.toString(),
        ],
      );
    }

    return {
      transactionId,
      balanceAfterPaise: newBalance.toString(),
      createdAt: txRes.rows[0].created_at,
      itemsTotalPaise: itemsTotal.toString(),
      amountPaise: chargeAmount.toString(),
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
              ct.amount_paise AS "amountPaise", ct.items_total_paise AS "itemsTotalPaise",
              ct.balance_after_paise AS "balanceAfterPaise",
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

  /** Line items for a batch of transactions in ONE query (never N+1) --
   * used to embed "what did they buy" directly into a history page/list
   * response so the frontend's expand-on-click needs no second round
   * trip. */
  async listItemsForTransactions(
    transactionIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<CanteenTransactionItemRow[]> {
    if (transactionIds.length === 0) return [];
    const { rows } = await executor.query<CanteenTransactionItemRow>(
      `SELECT id, transaction_id AS "transactionId", product_id AS "productId",
              product_name AS "productName", quantity,
              unit_price_paise AS "unitPricePaise", line_total_paise AS "lineTotalPaise"
       FROM canteen_transaction_item
       WHERE transaction_id = ANY($1)
       ORDER BY created_at ASC`,
      [transactionIds],
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
   * balance, frozen wallet, student/wallet not found, out of stock) -- the
   * one friction signal nothing else on this dashboard surfaces: a student
   * who tried to buy and couldn't. Reads the same audit_event rows
   * CanteenService writes on every failed charge (see its own header
   * comment), never a second, separate log. */
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

  // ============================================================
  // Reports (date-ranged) -- everything a canteen vendor actually needs to
  // review its own business over a period, plus the two always-live
  // (not date-ranged) inventory snapshots.
  // ============================================================

  async getRangeSummary(
    fromDate: string,
    toDate: string,
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
       WHERE created_at::date BETWEEN $1 AND $2`,
      [fromDate, toDate],
    );
    return rows[0];
  }

  async getDailyTrendForRange(
    fromDate: string,
    toDate: string,
    executor: Queryable = this.postgres,
  ): Promise<{ day: string; totalPaise: string; transactionCount: number }[]> {
    const { rows } = await executor.query(
      `SELECT d::date AS day, COALESCE(SUM(ct.amount_paise), 0) AS "totalPaise",
              COUNT(ct.id)::int AS "transactionCount"
       FROM generate_series($1::date, $2::date, INTERVAL '1 day') AS d
       LEFT JOIN canteen_transaction ct ON ct.created_at::date = d::date
       GROUP BY d
       ORDER BY d`,
      [fromDate, toDate],
    );
    return rows;
  }

  async getGradeBreakdownForRange(
    fromDate: string,
    toDate: string,
    executor: Queryable = this.postgres,
  ): Promise<{ gradeName: string | null; totalPaise: string }[]> {
    const { rows } = await executor.query(
      `SELECT g.name AS "gradeName", SUM(ct.amount_paise) AS "totalPaise"
       FROM canteen_transaction ct
       JOIN student s ON s.id = ct.student_id
       LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
       LEFT JOIN section sec ON sec.id = se.section_id
       LEFT JOIN grade g ON g.id = sec.grade_id
       WHERE ct.created_at::date BETWEEN $1 AND $2
       GROUP BY g.name
       ORDER BY SUM(ct.amount_paise) DESC`,
      [fromDate, toDate],
    );
    return rows;
  }

  /** Best/worst sellers by real quantity and revenue -- the report a
   * vendor actually restocks against. */
  async getTopProductsForRange(
    fromDate: string,
    toDate: string,
    limit: number,
    executor: Queryable = this.postgres,
  ): Promise<{ productName: string; quantitySold: number; revenuePaise: string }[]> {
    const { rows } = await executor.query(
      `SELECT cti.product_name AS "productName",
              SUM(cti.quantity)::int AS "quantitySold",
              SUM(cti.line_total_paise) AS "revenuePaise"
       FROM canteen_transaction_item cti
       JOIN canteen_transaction ct ON ct.id = cti.transaction_id
       WHERE ct.created_at::date BETWEEN $1 AND $2
       GROUP BY cti.product_name
       ORDER BY SUM(cti.line_total_paise) DESC
       LIMIT $3`,
      [fromDate, toDate, limit],
    );
    return rows;
  }

  async getDeclinedCountForRange(
    fromDate: string,
    toDate: string,
    executor: Queryable = this.postgres,
  ): Promise<number> {
    const { rows } = await executor.query(
      `SELECT COUNT(*)::int AS count FROM audit_event
       WHERE action = 'CANTEEN_WALLET_CHARGE_FAILED' AND occurred_at::date BETWEEN $1 AND $2`,
      [fromDate, toDate],
    );
    return rows[0].count;
  }

  /** Live snapshot (not date-ranged) -- what's actually on the shelf right
   * now, and what it's collectively worth at current pricing. */
  async getInventoryValuation(
    executor: Queryable = this.postgres,
  ): Promise<{ totalUnits: number; totalValuePaise: string; productCount: number }> {
    const { rows } = await executor.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS "totalUnits",
              COALESCE(SUM(quantity * price_per_unit_paise), 0) AS "totalValuePaise",
              COUNT(*)::int AS "productCount"
       FROM canteen_product WHERE is_active = true`,
    );
    return rows[0];
  }

  /** Live snapshot -- anything at or below `threshold` units, the vendor's
   * own real restock list. */
  async getLowStockProducts(
    threshold: number,
    executor: Queryable = this.postgres,
  ): Promise<{ name: string; quantity: number }[]> {
    const { rows } = await executor.query(
      `SELECT name, quantity FROM canteen_product
       WHERE is_active = true AND quantity <= $1
       ORDER BY quantity ASC, name ASC`,
      [threshold],
    );
    return rows;
  }
}

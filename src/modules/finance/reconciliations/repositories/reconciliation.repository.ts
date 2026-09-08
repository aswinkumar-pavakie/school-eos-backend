// Backs reconciliation/reconciliation_entry (database/migrations/0003_reconciliation.sql)
// — no such tables existed anywhere in the schema before that migration; only
// payment.reconciled_at existed. See that migration's header comment for why.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../../infrastructure/postgres/postgres.service';
import { PageQuery, toOffsetLimit } from '../../../../common/pagination/pagination.util';

export interface ReconciliationRow {
  id: string;
  gateway: string;
  periodFrom: Date;
  periodTo: Date;
  settlementObjectKey: string | null;
  state: string;
  matchedCount: number;
  unmatchedCount: number;
  discrepancyCount: number;
  createdBy: string;
  runAt: Date | null;
  closedBy: string | null;
  closedAt: Date | null;
  createdAt: Date;
}

export interface ReconciliationEntryRow {
  id: string;
  reconciliationId: string;
  paymentId: string | null;
  gatewayRef: string;
  gatewayAmountPaise: string;
  matchState: string;
  discrepancyReason: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
}

function mapReconciliation(row: any): ReconciliationRow {
  return {
    id: row.id,
    gateway: row.gateway,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    settlementObjectKey: row.settlement_object_key,
    state: row.state,
    matchedCount: row.matched_count,
    unmatchedCount: row.unmatched_count,
    discrepancyCount: row.discrepancy_count,
    createdBy: row.created_by,
    runAt: row.run_at,
    closedBy: row.closed_by,
    closedAt: row.closed_at,
    createdAt: row.created_at,
  };
}

function mapEntry(row: any): ReconciliationEntryRow {
  return {
    id: row.id,
    reconciliationId: row.reconciliation_id,
    paymentId: row.payment_id,
    gatewayRef: row.gateway_ref,
    gatewayAmountPaise: row.gateway_amount_paise,
    matchState: row.match_state,
    discrepancyReason: row.discrepancy_reason,
    resolutionNote: row.resolution_note,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
  };
}

@Injectable()
export class ReconciliationRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: { gateway: string; periodFrom: string; periodTo: string; settlementObjectKey: string | null; createdBy: string },
    executor: Queryable = this.postgres,
  ): Promise<ReconciliationRow> {
    const { rows } = await executor.query(
      `INSERT INTO reconciliation (gateway, period_from, period_to, settlement_object_key, created_by, state)
       VALUES ($1, $2, $3, $4, $5, 'DRAFT')
       RETURNING *`,
      [input.gateway, input.periodFrom, input.periodTo, input.settlementObjectKey, input.createdBy],
    );
    return mapReconciliation(rows[0]);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<ReconciliationRow | null> {
    const { rows } = await executor.query(`SELECT * FROM reconciliation WHERE id = $1`, [id]);
    return rows.length ? mapReconciliation(rows[0]) : null;
  }

  async findByIdForUpdate(id: string, executor: Queryable): Promise<ReconciliationRow | null> {
    const { rows } = await executor.query(`SELECT * FROM reconciliation WHERE id = $1 FOR UPDATE`, [id]);
    return rows.length ? mapReconciliation(rows[0]) : null;
  }

  async list(
    filter: { state?: string },
    page: PageQuery,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: ReconciliationRow[]; total: number }> {
    const { offset, limit } = toOffsetLimit(page);
    const { rows: countRows } = await executor.query(
      `SELECT COUNT(*)::int AS total FROM reconciliation WHERE ($1::text IS NULL OR state = $1)`,
      [filter.state ?? null],
    );
    const { rows } = await executor.query(
      `SELECT * FROM reconciliation WHERE ($1::text IS NULL OR state = $1)
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [filter.state ?? null, limit, offset],
    );
    return { rows: rows.map(mapReconciliation), total: countRows[0].total };
  }

  async delete(id: string, executor: Queryable): Promise<void> {
    await executor.query(`DELETE FROM reconciliation_entry WHERE reconciliation_id = $1`, [id]);
    await executor.query(`DELETE FROM reconciliation WHERE id = $1`, [id]);
  }

  async setState(id: string, state: string, executor: Queryable): Promise<void> {
    await executor.query(`UPDATE reconciliation SET state = $2, updated_at = now() WHERE id = $1`, [
      id,
      state,
    ]);
  }

  async markRun(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE reconciliation SET run_at = now(), updated_at = now() WHERE id = $1`,
      [id],
    );
  }

  async markClosed(id: string, closedBy: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE reconciliation SET state = 'CLOSED', closed_by = $2, closed_at = now(), updated_at = now()
       WHERE id = $1`,
      [id, closedBy],
    );
  }

  async recomputeCounts(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE reconciliation r
       SET matched_count = sub.matched,
           unmatched_count = sub.unmatched,
           discrepancy_count = sub.discrepancy,
           updated_at = now()
       FROM (
         SELECT
           COUNT(*) FILTER (WHERE match_state = 'MATCHED') AS matched,
           COUNT(*) FILTER (WHERE match_state = 'UNMATCHED') AS unmatched,
           COUNT(*) FILTER (WHERE match_state = 'DISCREPANCY') AS discrepancy
         FROM reconciliation_entry WHERE reconciliation_id = $1
       ) sub
       WHERE r.id = $1`,
      [id],
    );
  }

  async createEntry(
    input: {
      reconciliationId: string;
      paymentId: string | null;
      gatewayRef: string;
      gatewayAmountPaise: string;
      matchState: string;
      discrepancyReason: string | null;
    },
    executor: Queryable,
  ): Promise<ReconciliationEntryRow> {
    const { rows } = await executor.query(
      `INSERT INTO reconciliation_entry
         (reconciliation_id, payment_id, gateway_ref, gateway_amount_paise, match_state, discrepancy_reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.reconciliationId,
        input.paymentId,
        input.gatewayRef,
        input.gatewayAmountPaise,
        input.matchState,
        input.discrepancyReason,
      ],
    );
    return mapEntry(rows[0]);
  }

  async listEntries(reconciliationId: string, executor: Queryable = this.postgres): Promise<ReconciliationEntryRow[]> {
    const { rows } = await executor.query(
      `SELECT * FROM reconciliation_entry WHERE reconciliation_id = $1 ORDER BY created_at ASC`,
      [reconciliationId],
    );
    return rows.map(mapEntry);
  }

  async findEntryByIdForUpdate(id: string, executor: Queryable): Promise<ReconciliationEntryRow | null> {
    const { rows } = await executor.query(`SELECT * FROM reconciliation_entry WHERE id = $1 FOR UPDATE`, [id]);
    return rows.length ? mapEntry(rows[0]) : null;
  }

  async resolveEntry(
    id: string,
    resolvedBy: string,
    resolutionNote: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE reconciliation_entry
       SET match_state = 'RESOLVED', resolution_note = $2, resolved_by = $3, resolved_at = now()
       WHERE id = $1`,
      [id, resolutionNote, resolvedBy],
    );
  }
}

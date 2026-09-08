import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface InventoryItemRow {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  assetCode: string | null;
  quantity: number;
  lowStockThreshold: number | null;
  location: string | null;
  status: string;
  assignedToPersonId: string | null;
  assignedToName: string | null;
  assignedOn: string | null;
  description: string | null;
  acquisitionDate: string | null;
  acquisitionCostPaise: string | null;
  vendor: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInventoryItemInput {
  name: string;
  categoryId: string;
  assetCode?: string | null;
  quantity?: number;
  lowStockThreshold?: number | null;
  location?: string | null;
  description?: string | null;
  acquisitionDate?: string | null;
  acquisitionCostPaise?: number | null;
  vendor?: string | null;
  createdBy?: string | null;
}

/** Plain field edit only -- quantity and status/assignment each have their own
 * dedicated action (addStock/adjust, issue/return/markDamaged/markLost/retire)
 * so this never touches them, same split as UpdateEnrolmentDto vs transferSection. */
export interface UpdateInventoryItemInput {
  name?: string;
  categoryId?: string;
  assetCode?: string | null;
  lowStockThreshold?: number | null;
  location?: string | null;
  description?: string | null;
  acquisitionDate?: string | null;
  acquisitionCostPaise?: number | null;
  vendor?: string | null;
}

export interface InventoryItemFilter {
  search?: string;
  categoryId?: string;
  status?: string;
  location?: string;
  limit: number;
  offset: number;
}

export interface InventoryOverviewCounts {
  total: number;
  available: number;
  assigned: number;
  damaged: number;
  lost: number;
  retired: number;
  lowStock: number;
}

const COLUMNS = `i.id, i.name, i.category_id AS "categoryId", c.name AS "categoryName",
  i.asset_code AS "assetCode", i.quantity, i.low_stock_threshold AS "lowStockThreshold",
  i.location, i.status, i.assigned_to_person_id AS "assignedToPersonId",
  (CASE WHEN ap.id IS NOT NULL THEN trim(both ' ' from ap.first_name || ' ' || coalesce(ap.last_name, '')) END)
    AS "assignedToName",
  i.assigned_on AS "assignedOn", i.description, i.acquisition_date AS "acquisitionDate",
  i.acquisition_cost_paise AS "acquisitionCostPaise", i.vendor, i.created_by AS "createdBy",
  i.created_at AS "createdAt", i.updated_at AS "updatedAt"`;

const FROM = `inventory_item i
  JOIN inventory_category c ON c.id = i.category_id
  LEFT JOIN person ap ON ap.id = i.assigned_to_person_id`;

@Injectable()
export class InventoryItemRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: InventoryItemFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: InventoryItemRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(i.name) LIKE $${params.length} OR lower(coalesce(i.asset_code, '')) LIKE $${params.length})`,
      );
    }
    if (filter.categoryId) {
      params.push(filter.categoryId);
      conditions.push(`i.category_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (filter.location) {
      params.push(`%${filter.location.toLowerCase()}%`);
      conditions.push(`lower(coalesce(i.location, '')) LIKE $${params.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<InventoryItemRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where}
       ORDER BY i.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findOverviewCounts(
    executor: Queryable = this.postgres,
  ): Promise<InventoryOverviewCounts> {
    const { rows } = await executor.query<{
      total: string;
      available: string;
      assigned: string;
      damaged: string;
      lost: string;
      retired: string;
      low_stock: string;
    }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE status = 'AVAILABLE') AS available,
              count(*) FILTER (WHERE status = 'ASSIGNED') AS assigned,
              count(*) FILTER (WHERE status = 'DAMAGED') AS damaged,
              count(*) FILTER (WHERE status = 'LOST') AS lost,
              count(*) FILTER (WHERE status = 'RETIRED') AS retired,
              count(*) FILTER (WHERE low_stock_threshold IS NOT NULL AND quantity <= low_stock_threshold)
                AS low_stock
       FROM inventory_item`,
    );
    const row = rows[0];
    return {
      total: parseInt(row.total, 10),
      available: parseInt(row.available, 10),
      assigned: parseInt(row.assigned, 10),
      damaged: parseInt(row.damaged, 10),
      lost: parseInt(row.lost, 10),
      retired: parseInt(row.retired, 10),
      lowStock: parseInt(row.low_stock, 10),
    };
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<InventoryItemRow | null> {
    const { rows } = await executor.query<InventoryItemRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE i.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Row-locking read, for use inside a transaction right before a status/quantity
   * change that must not race with a concurrent action on the same item. */
  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<InventoryItemRow | null> {
    const { rows } = await executor.query<InventoryItemRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE i.id = $1 FOR UPDATE OF i`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateInventoryItemInput,
    executor: Queryable = this.postgres,
  ): Promise<InventoryItemRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO inventory_item
         (name, category_id, asset_code, quantity, low_stock_threshold, location, description,
          acquisition_date, acquisition_cost_paise, vendor, created_by)
       VALUES ($1, $2, $3, COALESCE($4, 1), $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        input.name,
        input.categoryId,
        input.assetCode ?? null,
        input.quantity ?? null,
        input.lowStockThreshold ?? null,
        input.location ?? null,
        input.description ?? null,
        input.acquisitionDate ?? null,
        input.acquisitionCostPaise ?? null,
        input.vendor ?? null,
        input.createdBy ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(
    id: string,
    input: UpdateInventoryItemInput,
    executor: Queryable = this.postgres,
  ): Promise<InventoryItemRow | null> {
    await executor.query(
      `UPDATE inventory_item SET
         name = COALESCE($2, name),
         category_id = COALESCE($3, category_id),
         asset_code = COALESCE($4, asset_code),
         low_stock_threshold = COALESCE($5, low_stock_threshold),
         location = COALESCE($6, location),
         description = COALESCE($7, description),
         acquisition_date = COALESCE($8, acquisition_date),
         acquisition_cost_paise = COALESCE($9, acquisition_cost_paise),
         vendor = COALESCE($10, vendor),
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.name ?? null,
        input.categoryId ?? null,
        input.assetCode ?? null,
        input.lowStockThreshold ?? null,
        input.location ?? null,
        input.description ?? null,
        input.acquisitionDate ?? null,
        input.acquisitionCostPaise ?? null,
        input.vendor ?? null,
      ],
    );
    return this.findById(id, executor);
  }

  async addStock(
    id: string,
    addQuantity: number,
    executor: Queryable,
  ): Promise<InventoryItemRow | null> {
    await executor.query(
      `UPDATE inventory_item SET quantity = quantity + $2, updated_at = now() WHERE id = $1`,
      [id, addQuantity],
    );
    return this.findById(id, executor);
  }

  async setQuantity(
    id: string,
    quantity: number,
    executor: Queryable,
  ): Promise<InventoryItemRow | null> {
    await executor.query(
      `UPDATE inventory_item SET quantity = $2, updated_at = now() WHERE id = $1`,
      [id, quantity],
    );
    return this.findById(id, executor);
  }

  async issue(
    id: string,
    assignedToPersonId: string,
    assignedOn: string,
    executor: Queryable,
  ): Promise<InventoryItemRow | null> {
    await executor.query(
      `UPDATE inventory_item SET
         status = 'ASSIGNED', assigned_to_person_id = $2, assigned_on = $3, updated_at = now()
       WHERE id = $1`,
      [id, assignedToPersonId, assignedOn],
    );
    return this.findById(id, executor);
  }

  async returnItem(
    id: string,
    executor: Queryable,
  ): Promise<InventoryItemRow | null> {
    await executor.query(
      `UPDATE inventory_item SET
         status = 'AVAILABLE', assigned_to_person_id = NULL, assigned_on = NULL, updated_at = now()
       WHERE id = $1`,
      [id],
    );
    return this.findById(id, executor);
  }

  async transfer(
    id: string,
    location: string,
    executor: Queryable,
  ): Promise<InventoryItemRow | null> {
    await executor.query(
      `UPDATE inventory_item SET location = $2, updated_at = now() WHERE id = $1`,
      [id, location],
    );
    return this.findById(id, executor);
  }

  /** Shared by markDamaged/markLost/retire (and return, which clears the
   * assignment too) -- every one of these is just "set status, clear
   * assignment if the new status can no longer be assigned out". */
  async setStatus(
    id: string,
    status: string,
    executor: Queryable,
  ): Promise<InventoryItemRow | null> {
    await executor.query(
      `UPDATE inventory_item SET
         status = $2, assigned_to_person_id = NULL, assigned_on = NULL, updated_at = now()
       WHERE id = $1`,
      [id, status],
    );
    return this.findById(id, executor);
  }

  /** Used only by Repair & Maintenance on request completion, to flip a DAMAGED
   * item back to AVAILABLE once it's fixed. */
  async restoreToAvailable(
    id: string,
    executor: Queryable,
  ): Promise<InventoryItemRow | null> {
    await executor.query(
      `UPDATE inventory_item SET status = 'AVAILABLE', updated_at = now() WHERE id = $1`,
      [id],
    );
    return this.findById(id, executor);
  }
}

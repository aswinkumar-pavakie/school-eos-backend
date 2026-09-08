import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface RepairRequestRow {
  id: string;
  title: string;
  inventoryItemId: string | null;
  inventoryItemName: string | null;
  inventoryItemAssetCode: string | null;
  issueType: string;
  location: string | null;
  priority: string;
  description: string;
  status: string;
  requestedOn: string;
  requestedBy: string | null;
  requestedByName: string | null;
  assignedToPersonId: string | null;
  assignedToName: string | null;
  assignedOn: string | null;
  completedOn: string | null;
  repairAction: string | null;
  completionNotes: string | null;
  costPaise: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRepairRequestInput {
  title: string;
  inventoryItemId?: string | null;
  issueType?: string;
  location?: string | null;
  priority?: string;
  description: string;
  requestedOn?: string;
  requestedBy?: string | null;
}

/** Plain field edit only -- status/assignment/completion each have their own
 * dedicated action (assign/start/complete/cancel), same split used everywhere
 * else in this codebase (e.g. UpdateEnrolmentDto vs transferSection). */
export interface UpdateRepairRequestInput {
  title?: string;
  inventoryItemId?: string | null;
  issueType?: string;
  location?: string | null;
  priority?: string;
  description?: string;
}

export interface RepairRequestFilter {
  search?: string;
  status?: string;
  priority?: string;
  issueType?: string;
  inventoryItemId?: string;
  location?: string;
  limit: number;
  offset: number;
}

export interface RepairRequestOverviewCounts {
  total: number;
  requested: number;
  assigned: number;
  inProgress: number;
  completed: number;
  cancelled: number;
}

const COLUMNS = `r.id, r.title, r.inventory_item_id AS "inventoryItemId", i.name AS "inventoryItemName",
  i.asset_code AS "inventoryItemAssetCode", r.issue_type AS "issueType", r.location, r.priority,
  r.description, r.status, r.requested_on AS "requestedOn", r.requested_by AS "requestedBy",
  (CASE WHEN rp.id IS NOT NULL THEN trim(both ' ' from rp.first_name || ' ' || coalesce(rp.last_name, '')) END)
    AS "requestedByName",
  r.assigned_to_person_id AS "assignedToPersonId",
  (CASE WHEN ap.id IS NOT NULL THEN trim(both ' ' from ap.first_name || ' ' || coalesce(ap.last_name, '')) END)
    AS "assignedToName",
  r.assigned_on AS "assignedOn", r.completed_on AS "completedOn", r.repair_action AS "repairAction",
  r.completion_notes AS "completionNotes", r.cost_paise AS "costPaise",
  r.created_at AS "createdAt", r.updated_at AS "updatedAt"`;

const FROM = `repair_request r
  LEFT JOIN inventory_item i ON i.id = r.inventory_item_id
  LEFT JOIN person rp ON rp.id = r.requested_by
  LEFT JOIN person ap ON ap.id = r.assigned_to_person_id`;

@Injectable()
export class RepairRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: RepairRequestFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: RepairRequestRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(r.title) LIKE $${params.length} OR lower(r.description) LIKE $${params.length})`,
      );
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (filter.priority) {
      params.push(filter.priority);
      conditions.push(`r.priority = $${params.length}`);
    }
    if (filter.issueType) {
      params.push(filter.issueType);
      conditions.push(`r.issue_type = $${params.length}`);
    }
    if (filter.inventoryItemId) {
      params.push(filter.inventoryItemId);
      conditions.push(`r.inventory_item_id = $${params.length}`);
    }
    if (filter.location) {
      params.push(`%${filter.location.toLowerCase()}%`);
      conditions.push(`lower(coalesce(r.location, '')) LIKE $${params.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<RepairRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where}
       ORDER BY r.requested_on DESC, r.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findOverviewCounts(
    executor: Queryable = this.postgres,
  ): Promise<RepairRequestOverviewCounts> {
    const { rows } = await executor.query<{
      total: string;
      requested: string;
      assigned: string;
      in_progress: string;
      completed: string;
      cancelled: string;
    }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE status = 'REQUESTED') AS requested,
              count(*) FILTER (WHERE status = 'ASSIGNED') AS assigned,
              count(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress,
              count(*) FILTER (WHERE status = 'COMPLETED') AS completed,
              count(*) FILTER (WHERE status = 'CANCELLED') AS cancelled
       FROM repair_request`,
    );
    const row = rows[0];
    return {
      total: parseInt(row.total, 10),
      requested: parseInt(row.requested, 10),
      assigned: parseInt(row.assigned, 10),
      inProgress: parseInt(row.in_progress, 10),
      completed: parseInt(row.completed, 10),
      cancelled: parseInt(row.cancelled, 10),
    };
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<RepairRequestRow | null> {
    const { rows } = await executor.query<RepairRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Row-locking read, for use inside a transaction right before a status change
   * that must not race with a concurrent action on the same request. */
  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<RepairRequestRow | null> {
    const { rows } = await executor.query<RepairRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = $1 FOR UPDATE OF r`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateRepairRequestInput,
    executor: Queryable = this.postgres,
  ): Promise<RepairRequestRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO repair_request
         (title, inventory_item_id, issue_type, location, priority, description, requested_on, requested_by)
       VALUES ($1, $2, COALESCE($3, 'OTHER'), $4, COALESCE($5, 'MEDIUM'), $6, COALESCE($7, CURRENT_DATE), $8)
       RETURNING id`,
      [
        input.title,
        input.inventoryItemId ?? null,
        input.issueType ?? null,
        input.location ?? null,
        input.priority ?? null,
        input.description,
        input.requestedOn ?? null,
        input.requestedBy ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(
    id: string,
    input: UpdateRepairRequestInput,
    executor: Queryable = this.postgres,
  ): Promise<RepairRequestRow | null> {
    await executor.query(
      `UPDATE repair_request SET
         title = COALESCE($2, title),
         inventory_item_id = COALESCE($3, inventory_item_id),
         issue_type = COALESCE($4, issue_type),
         location = COALESCE($5, location),
         priority = COALESCE($6, priority),
         description = COALESCE($7, description),
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.title ?? null,
        input.inventoryItemId ?? null,
        input.issueType ?? null,
        input.location ?? null,
        input.priority ?? null,
        input.description ?? null,
      ],
    );
    return this.findById(id, executor);
  }

  async assign(
    id: string,
    assignedToPersonId: string,
    assignedOn: string,
    nextStatus: string,
    executor: Queryable,
  ): Promise<RepairRequestRow | null> {
    await executor.query(
      `UPDATE repair_request SET
         assigned_to_person_id = $2, assigned_on = $3, status = $4, updated_at = now()
       WHERE id = $1`,
      [id, assignedToPersonId, assignedOn, nextStatus],
    );
    return this.findById(id, executor);
  }

  async setStatus(
    id: string,
    status: string,
    executor: Queryable,
  ): Promise<RepairRequestRow | null> {
    await executor.query(
      `UPDATE repair_request SET status = $2, updated_at = now() WHERE id = $1`,
      [id, status],
    );
    return this.findById(id, executor);
  }

  async complete(
    id: string,
    input: {
      completedOn: string;
      repairAction?: string | null;
      completionNotes?: string | null;
      costPaise?: number | null;
    },
    executor: Queryable,
  ): Promise<RepairRequestRow | null> {
    await executor.query(
      `UPDATE repair_request SET
         status = 'COMPLETED', completed_on = $2, repair_action = COALESCE($3, repair_action),
         completion_notes = COALESCE($4, completion_notes), cost_paise = COALESCE($5, cost_paise),
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.completedOn,
        input.repairAction ?? null,
        input.completionNotes ?? null,
        input.costPaise ?? null,
      ],
    );
    return this.findById(id, executor);
  }
}

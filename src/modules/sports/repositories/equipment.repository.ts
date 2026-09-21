import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export const EQUIPMENT_STATUSES = ['ACTIVE', 'RETIRED'] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export interface EquipmentRow {
  id: string;
  name: string;
  sportId: string | null;
  quantityTotal: number;
  quantityAvailable: number;
  condition: string | null;
  status: EquipmentStatus;
}

export interface CreateEquipmentInput {
  name: string;
  sportId?: string | null;
  quantityTotal: number;
  quantityAvailable?: number;
  condition?: string | null;
}

export interface UpdateEquipmentInput {
  name?: string;
  sportId?: string | null;
  quantityTotal?: number;
  quantityAvailable?: number;
  condition?: string | null;
  status?: EquipmentStatus;
}

const COLUMNS = `id, name, sport_id AS "sportId", quantity_total AS "quantityTotal",
  quantity_available AS "quantityAvailable", condition, status`;

@Injectable()
export class EquipmentRepository {
  constructor(private readonly postgres: PostgresService) {}

  // Real soft-delete: status='RETIRED' rows are excluded from the default
  // catalog view (see migration 0025_equipment_status.sql -- this table had
  // no status column, and no delete route, at all before that).
  async findMany(
    filter: { includeRetired?: boolean } = {},
    executor: Queryable = this.postgres,
  ): Promise<EquipmentRow[]> {
    const where = filter.includeRetired ? '' : `WHERE status = 'ACTIVE'`;
    const { rows } = await executor.query<EquipmentRow>(
      `SELECT ${COLUMNS} FROM equipment ${where} ORDER BY name`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<EquipmentRow | null> {
    const { rows } = await executor.query<EquipmentRow>(
      `SELECT ${COLUMNS} FROM equipment WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateEquipmentInput,
    executor: Queryable = this.postgres,
  ): Promise<EquipmentRow> {
    const { rows } = await executor.query<EquipmentRow>(
      `INSERT INTO equipment (name, sport_id, quantity_total, quantity_available, condition)
       VALUES ($1, $2, $3::int, COALESCE($4::int, $6::int), $5)
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.sportId ?? null,
        input.quantityTotal,
        input.quantityAvailable ?? null,
        input.condition ?? null,
        input.quantityTotal,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateEquipmentInput,
    executor: Queryable = this.postgres,
  ): Promise<EquipmentRow | null> {
    const { rows } = await executor.query<EquipmentRow>(
      `UPDATE equipment SET
         name = COALESCE($2, name),
         sport_id = COALESCE($3, sport_id),
         quantity_total = COALESCE($4, quantity_total),
         quantity_available = COALESCE($5, quantity_available),
         condition = COALESCE($6, condition),
         status = COALESCE($7, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.sportId ?? null,
        input.quantityTotal ?? null,
        input.quantityAvailable ?? null,
        input.condition ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface EquipmentRow {
  id: string;
  name: string;
  sportId: string | null;
  quantityTotal: number;
  quantityAvailable: number;
  condition: string | null;
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
}

const COLUMNS = `id, name, sport_id AS "sportId", quantity_total AS "quantityTotal",
  quantity_available AS "quantityAvailable", condition`;

@Injectable()
export class EquipmentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<EquipmentRow[]> {
    const { rows } = await executor.query<EquipmentRow>(`SELECT ${COLUMNS} FROM equipment ORDER BY name`);
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<EquipmentRow | null> {
    const { rows } = await executor.query<EquipmentRow>(`SELECT ${COLUMNS} FROM equipment WHERE id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async create(input: CreateEquipmentInput, executor: Queryable = this.postgres): Promise<EquipmentRow> {
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
         condition = COALESCE($6, condition)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.sportId ?? null,
        input.quantityTotal ?? null,
        input.quantityAvailable ?? null,
        input.condition ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}

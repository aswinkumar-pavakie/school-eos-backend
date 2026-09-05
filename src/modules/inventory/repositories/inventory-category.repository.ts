import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface InventoryCategoryRow {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInventoryCategoryInput {
  name: string;
  status?: string;
}

export interface UpdateInventoryCategoryInput {
  name?: string;
  status?: string;
}

const COLUMNS = `id, name, status, created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class InventoryCategoryRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<InventoryCategoryRow[]> {
    const { rows } = await executor.query<InventoryCategoryRow>(
      `SELECT ${COLUMNS} FROM inventory_category ORDER BY name`,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<InventoryCategoryRow | null> {
    const { rows } = await executor.query<InventoryCategoryRow>(
      `SELECT ${COLUMNS} FROM inventory_category WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateInventoryCategoryInput,
    executor: Queryable = this.postgres,
  ): Promise<InventoryCategoryRow> {
    const { rows } = await executor.query<InventoryCategoryRow>(
      `INSERT INTO inventory_category (name, status)
       VALUES ($1, COALESCE($2, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [input.name, input.status ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateInventoryCategoryInput,
    executor: Queryable = this.postgres,
  ): Promise<InventoryCategoryRow | null> {
    const { rows } = await executor.query<InventoryCategoryRow>(
      `UPDATE inventory_category SET
         name = COALESCE($2, name),
         status = COALESCE($3, status),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, input.name ?? null, input.status ?? null],
    );
    return rows[0] ?? null;
  }
}

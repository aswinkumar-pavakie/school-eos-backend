import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CampusRow {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isPrimary: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCampusInput {
  name: string;
  code: string;
  address?: string | null;
  status?: string;
}

export interface UpdateCampusInput {
  name?: string;
  code?: string;
  address?: string | null;
  status?: string;
}

const COLUMNS = `id, name, code, address, is_primary AS "isPrimary", status,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class CampusRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<CampusRow[]> {
    const { rows } = await executor.query<CampusRow>(
      `SELECT ${COLUMNS} FROM campus ORDER BY name`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<CampusRow | null> {
    const { rows } = await executor.query<CampusRow>(
      `SELECT ${COLUMNS} FROM campus WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateCampusInput,
    executor: Queryable = this.postgres,
  ): Promise<CampusRow> {
    const { rows } = await executor.query<CampusRow>(
      `INSERT INTO campus (name, code, address, status)
       VALUES ($1, $2, $3, COALESCE($4, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [input.name, input.code, input.address ?? null, input.status ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateCampusInput,
    executor: Queryable = this.postgres,
  ): Promise<CampusRow | null> {
    const { rows } = await executor.query<CampusRow>(
      `UPDATE campus SET
         name = COALESCE($2, name),
         code = COALESCE($3, code),
         address = COALESCE($4, address),
         status = COALESCE($5, status),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.code ?? null,
        input.address ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  /** Same single-primary invariant as academic_year's is_current -- must run inside a
   * transaction. */
  async clearPrimary(executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE campus SET is_primary = false WHERE is_primary = true`,
    );
  }

  async setPrimary(id: string, executor: Queryable): Promise<CampusRow | null> {
    const { rows } = await executor.query<CampusRow>(
      `UPDATE campus SET is_primary = true, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id],
    );
    return rows[0] ?? null;
  }
}

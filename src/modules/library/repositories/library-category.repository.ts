import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface LibraryCategoryRow {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryFilter {
  status?: string;
}

const COLUMNS = `id, name, status, created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class LibraryCategoryRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(filter: CategoryFilter, executor: Queryable = this.postgres): Promise<LibraryCategoryRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<LibraryCategoryRow>(
      `SELECT ${COLUMNS} FROM library_category ${where} ORDER BY name`,
      params,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<LibraryCategoryRow | null> {
    const { rows } = await executor.query<LibraryCategoryRow>(`SELECT ${COLUMNS} FROM library_category WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async create(name: string, executor: Queryable = this.postgres): Promise<LibraryCategoryRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO library_category (name) VALUES ($1) RETURNING id`,
      [name],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(
    id: string,
    input: { name?: string; status?: string },
    executor: Queryable = this.postgres,
  ): Promise<LibraryCategoryRow | null> {
    await executor.query(
      `UPDATE library_category SET
         name = COALESCE($2, name),
         status = COALESCE($3, status),
         updated_at = now()
       WHERE id = $1`,
      [id, input.name ?? null, input.status ?? null],
    );
    return this.findById(id, executor);
  }
}

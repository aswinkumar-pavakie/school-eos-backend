import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface MediumRow {
  id: string;
  name: string;
  code: string;
  status: string;
  createdAt: Date;
}

export interface CreateMediumInput {
  name: string;
  code: string;
  status?: string;
}

export interface UpdateMediumInput {
  name?: string;
  code?: string;
  status?: string;
}

const COLUMNS = `id, name, code, status, created_at AS "createdAt"`;

@Injectable()
export class MediumRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<MediumRow[]> {
    const { rows } = await executor.query<MediumRow>(`SELECT ${COLUMNS} FROM medium ORDER BY name`);
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<MediumRow | null> {
    const { rows } = await executor.query<MediumRow>(`SELECT ${COLUMNS} FROM medium WHERE id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async create(input: CreateMediumInput, executor: Queryable = this.postgres): Promise<MediumRow> {
    const { rows } = await executor.query<MediumRow>(
      `INSERT INTO medium (name, code, status) VALUES ($1, $2, COALESCE($3, 'ACTIVE')) RETURNING ${COLUMNS}`,
      [input.name, input.code, input.status ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateMediumInput,
    executor: Queryable = this.postgres,
  ): Promise<MediumRow | null> {
    const { rows } = await executor.query<MediumRow>(
      `UPDATE medium SET name = COALESCE($2, name), code = COALESCE($3, code), status = COALESCE($4, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, input.name ?? null, input.code ?? null, input.status ?? null],
    );
    return rows[0] ?? null;
  }
}

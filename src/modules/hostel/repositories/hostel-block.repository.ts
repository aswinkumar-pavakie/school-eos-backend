import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface HostelBlockRow {
  id: string;
  hostelId: string;
  name: string;
}

export interface CreateHostelBlockInput {
  name: string;
}

export interface UpdateHostelBlockInput {
  name?: string;
}

const COLUMNS = `id, hostel_id AS "hostelId", name`;

@Injectable()
export class HostelBlockRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByHostelId(
    hostelId: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelBlockRow[]> {
    const { rows } = await executor.query<HostelBlockRow>(
      `SELECT ${COLUMNS} FROM hostel_block WHERE hostel_id = $1 ORDER BY name`,
      [hostelId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelBlockRow | null> {
    const { rows } = await executor.query<HostelBlockRow>(
      `SELECT ${COLUMNS} FROM hostel_block WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    hostelId: string,
    input: CreateHostelBlockInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelBlockRow> {
    const { rows } = await executor.query<HostelBlockRow>(
      `INSERT INTO hostel_block (hostel_id, name) VALUES ($1, $2) RETURNING ${COLUMNS}`,
      [hostelId, input.name],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateHostelBlockInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelBlockRow | null> {
    const { rows } = await executor.query<HostelBlockRow>(
      `UPDATE hostel_block SET name = COALESCE($2, name) WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, input.name ?? null],
    );
    return rows[0] ?? null;
  }
}

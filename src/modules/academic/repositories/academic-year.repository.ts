import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface AcademicYearRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  isCurrent: boolean;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAcademicYearInput {
  name: string;
  startDate: string;
  endDate: string;
  status?: string;
}

export interface UpdateAcademicYearInput {
  name?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

const COLUMNS = `id, name, start_date AS "startDate", end_date AS "endDate", status,
  is_current AS "isCurrent", closed_at AS "closedAt", created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class AcademicYearRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    executor: Queryable = this.postgres,
  ): Promise<AcademicYearRow[]> {
    const { rows } = await executor.query<AcademicYearRow>(
      `SELECT ${COLUMNS} FROM academic_year ORDER BY start_date DESC`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<AcademicYearRow | null> {
    const { rows } = await executor.query<AcademicYearRow>(
      `SELECT ${COLUMNS} FROM academic_year WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateAcademicYearInput,
    executor: Queryable = this.postgres,
  ): Promise<AcademicYearRow> {
    const { rows } = await executor.query<AcademicYearRow>(
      `INSERT INTO academic_year (name, start_date, end_date, status)
       VALUES ($1, $2, $3, COALESCE($4, 'PLANNED'))
       RETURNING ${COLUMNS}`,
      [input.name, input.startDate, input.endDate, input.status ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateAcademicYearInput,
    executor: Queryable = this.postgres,
  ): Promise<AcademicYearRow | null> {
    const { rows } = await executor.query<AcademicYearRow>(
      `UPDATE academic_year SET
         name = COALESCE($2, name),
         start_date = COALESCE($3, start_date),
         end_date = COALESCE($4, end_date),
         status = COALESCE($5, status),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.startDate ?? null,
        input.endDate ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  /** Unsets any existing current year, then sets the target -- must run inside a
   * transaction (UnitOfWork) so the partial-unique index on is_current never sees two
   * true rows even momentarily under concurrent requests. */
  async clearCurrent(executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE academic_year SET is_current = false WHERE is_current = true`,
    );
  }

  async setCurrent(
    id: string,
    executor: Queryable,
  ): Promise<AcademicYearRow | null> {
    const { rows } = await executor.query<AcademicYearRow>(
      `UPDATE academic_year SET is_current = true, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id],
    );
    return rows[0] ?? null;
  }

  async close(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<AcademicYearRow | null> {
    const { rows } = await executor.query<AcademicYearRow>(
      `UPDATE academic_year SET status = 'CLOSED', closed_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id],
    );
    return rows[0] ?? null;
  }
}

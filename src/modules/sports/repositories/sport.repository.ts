import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface SportRow {
  id: string;
  name: string;
  sportType: string;
  resultType: string;
  scoringTemplate: Record<string, unknown>;
  status: string;
}

export interface CreateSportInput {
  name: string;
  sportType: string;
  resultType: string;
  scoringTemplate?: Record<string, unknown>;
  status?: string;
}

export interface UpdateSportInput {
  name?: string;
  sportType?: string;
  resultType?: string;
  scoringTemplate?: Record<string, unknown>;
  status?: string;
}

const COLUMNS = `id, name, sport_type AS "sportType", result_type AS "resultType",
  scoring_template AS "scoringTemplate", status`;

@Injectable()
export class SportRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<SportRow[]> {
    const { rows } = await executor.query<SportRow>(
      `SELECT ${COLUMNS} FROM sport ORDER BY name`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<SportRow | null> {
    const { rows } = await executor.query<SportRow>(
      `SELECT ${COLUMNS} FROM sport WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateSportInput,
    executor: Queryable = this.postgres,
  ): Promise<SportRow> {
    const { rows } = await executor.query<SportRow>(
      `INSERT INTO sport (name, sport_type, result_type, scoring_template, status)
       VALUES ($1, $2, $3, COALESCE($4, '{}'::jsonb), COALESCE($5, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.sportType,
        input.resultType,
        input.scoringTemplate ? JSON.stringify(input.scoringTemplate) : null,
        input.status ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateSportInput,
    executor: Queryable = this.postgres,
  ): Promise<SportRow | null> {
    const { rows } = await executor.query<SportRow>(
      `UPDATE sport SET
         name = COALESCE($2, name),
         sport_type = COALESCE($3, sport_type),
         result_type = COALESCE($4, result_type),
         scoring_template = COALESCE($5, scoring_template),
         status = COALESCE($6, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.sportType ?? null,
        input.resultType ?? null,
        input.scoringTemplate ? JSON.stringify(input.scoringTemplate) : null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}

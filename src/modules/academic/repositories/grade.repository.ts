import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface GradeRow {
  id: string;
  name: string;
  levelNo: number;
  stage: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGradeInput {
  name: string;
  levelNo: number;
  stage: string;
  status?: string;
}

export interface UpdateGradeInput {
  name?: string;
  levelNo?: number;
  stage?: string;
  status?: string;
}

const COLUMNS = `id, name, level_no AS "levelNo", stage, status,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class GradeRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<GradeRow[]> {
    const { rows } = await executor.query<GradeRow>(
      `SELECT ${COLUMNS} FROM grade ORDER BY level_no`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<GradeRow | null> {
    const { rows } = await executor.query<GradeRow>(
      `SELECT ${COLUMNS} FROM grade WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateGradeInput,
    executor: Queryable = this.postgres,
  ): Promise<GradeRow> {
    const { rows } = await executor.query<GradeRow>(
      `INSERT INTO grade (name, level_no, stage, status)
       VALUES ($1, $2, $3, COALESCE($4, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [input.name, input.levelNo, input.stage, input.status ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateGradeInput,
    executor: Queryable = this.postgres,
  ): Promise<GradeRow | null> {
    const { rows } = await executor.query<GradeRow>(
      `UPDATE grade SET
         name = COALESCE($2, name),
         level_no = COALESCE($3, level_no),
         stage = COALESCE($4, stage),
         status = COALESCE($5, status),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.levelNo ?? null,
        input.stage ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}

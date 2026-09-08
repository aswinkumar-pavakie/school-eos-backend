import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface SubjectRow {
  id: string;
  name: string;
  code: string;
  subjectType: string;
  appliesToStage: string | null;
  departmentId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubjectInput {
  name: string;
  code: string;
  subjectType: string;
  appliesToStage?: string | null;
  departmentId?: string | null;
  status?: string;
}

export interface UpdateSubjectInput {
  name?: string;
  code?: string;
  subjectType?: string;
  appliesToStage?: string | null;
  departmentId?: string | null;
  status?: string;
}

const COLUMNS = `id, name, code, subject_type AS "subjectType", applies_to_stage AS "appliesToStage",
  department_id AS "departmentId", status, created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class SubjectRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<SubjectRow[]> {
    const { rows } = await executor.query<SubjectRow>(
      `SELECT ${COLUMNS} FROM subject ORDER BY name`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<SubjectRow | null> {
    const { rows } = await executor.query<SubjectRow>(
      `SELECT ${COLUMNS} FROM subject WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateSubjectInput,
    executor: Queryable = this.postgres,
  ): Promise<SubjectRow> {
    const { rows } = await executor.query<SubjectRow>(
      `INSERT INTO subject (name, code, subject_type, applies_to_stage, department_id, status)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.code,
        input.subjectType,
        input.appliesToStage ?? null,
        input.departmentId ?? null,
        input.status ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateSubjectInput,
    executor: Queryable = this.postgres,
  ): Promise<SubjectRow | null> {
    const { rows } = await executor.query<SubjectRow>(
      `UPDATE subject SET
         name = COALESCE($2, name),
         code = COALESCE($3, code),
         subject_type = COALESCE($4, subject_type),
         applies_to_stage = COALESCE($5, applies_to_stage),
         department_id = COALESCE($6, department_id),
         status = COALESCE($7, status),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.code ?? null,
        input.subjectType ?? null,
        input.appliesToStage ?? null,
        input.departmentId ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}

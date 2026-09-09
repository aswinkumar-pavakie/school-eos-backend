import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface SectionRow {
  id: string;
  academicYearId: string;
  gradeId: string;
  mediumId: string;
  campusId: string | null;
  name: string;
  capacity: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SectionListFilter {
  academicYearId?: string;
  gradeId?: string;
  status?: string;
}

export interface CreateSectionInput {
  academicYearId: string;
  gradeId: string;
  mediumId: string;
  campusId?: string | null;
  name: string;
  capacity?: number | null;
  status?: string;
}

export interface UpdateSectionInput {
  name?: string;
  campusId?: string | null;
  capacity?: number | null;
  status?: string;
}

const COLUMNS = `id, academic_year_id AS "academicYearId", grade_id AS "gradeId", medium_id AS "mediumId",
  campus_id AS "campusId", name, capacity, status, created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class SectionRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: SectionListFilter,
    executor: Queryable = this.postgres,
  ): Promise<SectionRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.academicYearId) {
      params.push(filter.academicYearId);
      conditions.push(`academic_year_id = $${params.length}`);
    }
    if (filter.gradeId) {
      params.push(filter.gradeId);
      conditions.push(`grade_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<SectionRow>(
      `SELECT ${COLUMNS} FROM section ${where} ORDER BY name`,
      params,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<SectionRow | null> {
    const { rows } = await executor.query<SectionRow>(`SELECT ${COLUMNS} FROM section WHERE id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async create(input: CreateSectionInput, executor: Queryable = this.postgres): Promise<SectionRow> {
    const { rows } = await executor.query<SectionRow>(
      `INSERT INTO section (academic_year_id, grade_id, medium_id, campus_id, name, capacity, status)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.academicYearId,
        input.gradeId,
        input.mediumId,
        input.campusId ?? null,
        input.name,
        input.capacity ?? null,
        input.status ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateSectionInput,
    executor: Queryable = this.postgres,
  ): Promise<SectionRow | null> {
    const { rows } = await executor.query<SectionRow>(
      `UPDATE section SET
         name = COALESCE($2, name),
         campus_id = COALESCE($3, campus_id),
         capacity = COALESCE($4, capacity),
         status = COALESCE($5, status),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, input.name ?? null, input.campusId ?? null, input.capacity ?? null, input.status ?? null],
    );
    return rows[0] ?? null;
  }
}

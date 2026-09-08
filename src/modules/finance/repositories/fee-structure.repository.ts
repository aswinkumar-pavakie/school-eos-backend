import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface FeeStructureRow {
  id: string;
  academicYearId: string;
  gradeId: string;
  mediumId: string | null;
  category: string | null;
  totalPaise: string;
  approvalRequestId: string | null;
  state: string;
}

export interface CreateFeeStructureInput {
  academicYearId: string;
  gradeId: string;
  mediumId?: string | null;
  category?: string | null;
}

export interface UpdateFeeStructureInput {
  academicYearId?: string;
  gradeId?: string;
  mediumId?: string | null;
  category?: string | null;
}

export interface FeeStructureFilter {
  academicYearId?: string;
  gradeId?: string;
  state?: string;
}

const COLUMNS = `id, academic_year_id AS "academicYearId", grade_id AS "gradeId",
  medium_id AS "mediumId", category, total_paise AS "totalPaise",
  approval_request_id AS "approvalRequestId", state`;

@Injectable()
export class FeeStructureRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: FeeStructureFilter,
    executor: Queryable = this.postgres,
  ): Promise<FeeStructureRow[]> {
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
    if (filter.state) {
      params.push(filter.state);
      conditions.push(`state = $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<FeeStructureRow>(
      `SELECT ${COLUMNS} FROM fee_structure ${where} ORDER BY created_at DESC`,
      params,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<FeeStructureRow | null> {
    const { rows } = await executor.query<FeeStructureRow>(
      `SELECT ${COLUMNS} FROM fee_structure WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<FeeStructureRow | null> {
    const { rows } = await executor.query<FeeStructureRow>(
      `SELECT ${COLUMNS} FROM fee_structure WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateFeeStructureInput,
    executor: Queryable = this.postgres,
  ): Promise<FeeStructureRow> {
    const { rows } = await executor.query<FeeStructureRow>(
      `INSERT INTO fee_structure (academic_year_id, grade_id, medium_id, category, total_paise, state)
       VALUES ($1, $2, $3, $4, 0, 'DRAFT')
       RETURNING ${COLUMNS}`,
      [
        input.academicYearId,
        input.gradeId,
        input.mediumId ?? null,
        input.category ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateFeeStructureInput,
    executor: Queryable = this.postgres,
  ): Promise<FeeStructureRow | null> {
    const { rows } = await executor.query<FeeStructureRow>(
      `UPDATE fee_structure SET
         academic_year_id = COALESCE($2, academic_year_id),
         grade_id = COALESCE($3, grade_id),
         medium_id = COALESCE($4, medium_id),
         category = COALESCE($5, category)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.academicYearId ?? null,
        input.gradeId ?? null,
        input.mediumId ?? null,
        input.category ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  /** total_paise is derived from the sum of this structure's lines -- never set
   * independently by a caller, only recomputed here whenever a line changes. */
  async recomputeTotal(
    id: string,
    executor: Queryable,
  ): Promise<FeeStructureRow | null> {
    const { rows } = await executor.query<FeeStructureRow>(
      `UPDATE fee_structure SET total_paise = COALESCE(
         (SELECT SUM(amount_paise) FROM fee_structure_line WHERE fee_structure_id = $1), 0)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id],
    );
    return rows[0] ?? null;
  }

  async setState(
    id: string,
    state: string,
    executor: Queryable = this.postgres,
  ): Promise<FeeStructureRow | null> {
    const { rows } = await executor.query<FeeStructureRow>(
      `UPDATE fee_structure SET state = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, state],
    );
    return rows[0] ?? null;
  }
}

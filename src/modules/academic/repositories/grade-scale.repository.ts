import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface GradeScaleRow {
  id: string;
  name: string;
  scaleType: string;
  isDefault: boolean;
  status: string;
  createdAt: Date;
}

export interface CreateGradeScaleInput {
  name: string;
  scaleType: string;
  status?: string;
}

export interface UpdateGradeScaleInput {
  name?: string;
  scaleType?: string;
  status?: string;
}

export interface GradeBandRow {
  id: string;
  gradeScaleId: string;
  label: string;
  minPercent: string;
  maxPercent: string;
  gradePoint: string | null;
  remark: string | null;
}

export interface CreateGradeBandInput {
  label: string;
  minPercent: number;
  maxPercent: number;
  gradePoint?: number | null;
  remark?: string | null;
}

export interface UpdateGradeBandInput {
  label?: string;
  minPercent?: number;
  maxPercent?: number;
  gradePoint?: number | null;
  remark?: string | null;
}

const SCALE_COLUMNS = `id, name, scale_type AS "scaleType", is_default AS "isDefault", status,
  created_at AS "createdAt"`;
const BAND_COLUMNS = `id, grade_scale_id AS "gradeScaleId", label, min_percent AS "minPercent",
  max_percent AS "maxPercent", grade_point AS "gradePoint", remark`;

@Injectable()
export class GradeScaleRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<GradeScaleRow[]> {
    const { rows } = await executor.query<GradeScaleRow>(
      `SELECT ${SCALE_COLUMNS} FROM grade_scale ORDER BY name`,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<GradeScaleRow | null> {
    const { rows } = await executor.query<GradeScaleRow>(
      `SELECT ${SCALE_COLUMNS} FROM grade_scale WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateGradeScaleInput,
    executor: Queryable = this.postgres,
  ): Promise<GradeScaleRow> {
    const { rows } = await executor.query<GradeScaleRow>(
      `INSERT INTO grade_scale (name, scale_type, status)
       VALUES ($1, $2, COALESCE($3, 'ACTIVE'))
       RETURNING ${SCALE_COLUMNS}`,
      [input.name, input.scaleType, input.status ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateGradeScaleInput,
    executor: Queryable = this.postgres,
  ): Promise<GradeScaleRow | null> {
    const { rows } = await executor.query<GradeScaleRow>(
      `UPDATE grade_scale SET
         name = COALESCE($2, name),
         scale_type = COALESCE($3, scale_type),
         status = COALESCE($4, status)
       WHERE id = $1
       RETURNING ${SCALE_COLUMNS}`,
      [id, input.name ?? null, input.scaleType ?? null, input.status ?? null],
    );
    return rows[0] ?? null;
  }

  /** Single-default invariant, same pattern as academic_year.is_current -- run inside a
   * transaction. */
  async clearDefault(executor: Queryable): Promise<void> {
    await executor.query(`UPDATE grade_scale SET is_default = false WHERE is_default = true`);
  }

  async setDefault(id: string, executor: Queryable): Promise<GradeScaleRow | null> {
    const { rows } = await executor.query<GradeScaleRow>(
      `UPDATE grade_scale SET is_default = true WHERE id = $1 RETURNING ${SCALE_COLUMNS}`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findBands(gradeScaleId: string, executor: Queryable = this.postgres): Promise<GradeBandRow[]> {
    const { rows } = await executor.query<GradeBandRow>(
      `SELECT ${BAND_COLUMNS} FROM grade_band WHERE grade_scale_id = $1 ORDER BY min_percent DESC`,
      [gradeScaleId],
    );
    return rows;
  }

  async createBand(
    gradeScaleId: string,
    input: CreateGradeBandInput,
    executor: Queryable = this.postgres,
  ): Promise<GradeBandRow> {
    const { rows } = await executor.query<GradeBandRow>(
      `INSERT INTO grade_band (grade_scale_id, label, min_percent, max_percent, grade_point, remark)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${BAND_COLUMNS}`,
      [
        gradeScaleId,
        input.label,
        input.minPercent,
        input.maxPercent,
        input.gradePoint ?? null,
        input.remark ?? null,
      ],
    );
    return rows[0];
  }

  async findBandById(id: string, executor: Queryable = this.postgres): Promise<GradeBandRow | null> {
    const { rows } = await executor.query<GradeBandRow>(
      `SELECT ${BAND_COLUMNS} FROM grade_band WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async updateBand(
    id: string,
    input: UpdateGradeBandInput,
    executor: Queryable = this.postgres,
  ): Promise<GradeBandRow | null> {
    const { rows } = await executor.query<GradeBandRow>(
      `UPDATE grade_band SET
         label = COALESCE($2, label),
         min_percent = COALESCE($3, min_percent),
         max_percent = COALESCE($4, max_percent),
         grade_point = COALESCE($5, grade_point),
         remark = COALESCE($6, remark)
       WHERE id = $1
       RETURNING ${BAND_COLUMNS}`,
      [
        id,
        input.label ?? null,
        input.minPercent ?? null,
        input.maxPercent ?? null,
        input.gradePoint ?? null,
        input.remark ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async deleteBand(id: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rowCount } = await executor.query(`DELETE FROM grade_band WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }
}

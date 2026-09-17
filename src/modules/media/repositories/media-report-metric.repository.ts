// media_report_metric -- see database/migrations/0018_media_report_metrics.sql.
// A user-curated scorecard row, not a computed analytics value.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface MediaReportMetricRow {
  id: string;
  academicYearId: string;
  name: string;
  nowValue: string;
  targetValue: string | null;
  attainmentPct: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id, academic_year_id AS "academicYearId", name, now_value AS "nowValue",
  target_value AS "targetValue", attainment_pct AS "attainmentPct",
  created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class MediaReportMetricRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(academicYearId: string, executor: Queryable = this.postgres): Promise<MediaReportMetricRow[]> {
    const { rows } = await executor.query<MediaReportMetricRow>(
      `SELECT ${COLUMNS} FROM media_report_metric WHERE academic_year_id = $1 ORDER BY created_at`,
      [academicYearId],
    );
    return rows;
  }

  async create(
    input: { academicYearId: string; name: string; nowValue: string; targetValue: string | null; attainmentPct: string | null; createdBy: string },
    executor: Queryable = this.postgres,
  ): Promise<MediaReportMetricRow> {
    const { rows } = await executor.query<MediaReportMetricRow>(
      `INSERT INTO media_report_metric (academic_year_id, name, now_value, target_value, attainment_pct, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [input.academicYearId, input.name, input.nowValue, input.targetValue, input.attainmentPct, input.createdBy],
    );
    return rows[0];
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<MediaReportMetricRow | null> {
    const { rows } = await executor.query<MediaReportMetricRow>(
      `SELECT ${COLUMNS} FROM media_report_metric WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async update(
    id: string,
    input: { name?: string; nowValue?: string; targetValue?: string | null; attainmentPct?: string | null },
    executor: Queryable = this.postgres,
  ): Promise<MediaReportMetricRow | null> {
    const { rows } = await executor.query<MediaReportMetricRow>(
      `UPDATE media_report_metric SET
         name = COALESCE($2, name),
         now_value = COALESCE($3, now_value),
         target_value = COALESCE($4, target_value),
         attainment_pct = COALESCE($5, attainment_pct),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, input.name ?? null, input.nowValue ?? null, input.targetValue ?? null, input.attainmentPct ?? null],
    );
    return rows[0] ?? null;
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rowCount } = await executor.query(`DELETE FROM media_report_metric WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }
}

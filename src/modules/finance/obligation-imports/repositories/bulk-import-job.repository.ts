// Backs bulk_import_job (database/migrations/0002_bulk_import_job.sql) — no such table
// existed anywhere in the schema before that migration; see its header comment for why.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';
import {
  PageQuery,
  toOffsetLimit,
} from '../../../../common/pagination/pagination.util';

export interface BulkImportJobRow {
  id: string;
  jobType: string;
  sourceObjectKey: string;
  fileName: string;
  totalRows: number | null;
  validRows: number | null;
  errorRows: number | null;
  rowErrors: unknown;
  state: string;
  createdBy: string;
  validatedAt: Date | null;
  committedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: any): BulkImportJobRow {
  return {
    id: row.id,
    jobType: row.job_type,
    sourceObjectKey: row.source_object_key,
    fileName: row.file_name,
    totalRows: row.total_rows,
    validRows: row.valid_rows,
    errorRows: row.error_rows,
    rowErrors: row.row_errors,
    state: row.state,
    createdBy: row.created_by,
    validatedAt: row.validated_at,
    committedAt: row.committed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class BulkImportJobRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      jobType: string;
      sourceObjectKey: string;
      fileName: string;
      createdBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<BulkImportJobRow> {
    const { rows } = await executor.query(
      `INSERT INTO bulk_import_job (job_type, source_object_key, file_name, created_by, state)
       VALUES ($1, $2, $3, $4, 'DRAFT')
       RETURNING *`,
      [input.jobType, input.sourceObjectKey, input.fileName, input.createdBy],
    );
    return mapRow(rows[0]);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<BulkImportJobRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM bulk_import_job WHERE id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<BulkImportJobRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM bulk_import_job WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async list(
    filter: { state?: string },
    page: PageQuery,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: BulkImportJobRow[]; total: number }> {
    const { offset, limit } = toOffsetLimit(page);
    const { rows: countRows } = await executor.query(
      `SELECT COUNT(*)::int AS total FROM bulk_import_job WHERE ($1::text IS NULL OR state = $1)`,
      [filter.state ?? null],
    );
    const { rows } = await executor.query(
      `SELECT * FROM bulk_import_job WHERE ($1::text IS NULL OR state = $1)
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [filter.state ?? null, limit, offset],
    );
    return { rows: rows.map(mapRow), total: countRows[0].total };
  }

  async recordValidation(
    id: string,
    result: {
      totalRows: number;
      validRows: number;
      errorRows: number;
      rowErrors: unknown;
      state: string;
    },
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE bulk_import_job
       SET total_rows = $2, valid_rows = $3, error_rows = $4, row_errors = $5, state = $6,
           validated_at = now(), updated_at = now()
       WHERE id = $1`,
      [
        id,
        result.totalRows,
        result.validRows,
        result.errorRows,
        JSON.stringify(result.rowErrors),
        result.state,
      ],
    );
  }

  async markCommitted(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE bulk_import_job SET state = 'COMMITTED', committed_at = now(), updated_at = now() WHERE id = $1`,
      [id],
    );
  }

  async markCancelled(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE bulk_import_job SET state = 'CANCELLED', cancelled_at = now(), updated_at = now() WHERE id = $1`,
      [id],
    );
  }
}

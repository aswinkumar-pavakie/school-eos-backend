import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

// Mirrors VehicleDocumentRepository exactly -- same shape, same query
// patterns. Table is additive (query.md) -- not yet live until that
// migration is run.

export interface DriverDocumentRow {
  id: string;
  driverId: string;
  docType: string;
  docNo: string | null;
  validFrom: string | null;
  validTo: string;
  objectKey: string | null;
}

export interface CreateDriverDocumentInput {
  docType: string;
  docNo?: string | null;
  validFrom?: string | null;
  validTo: string;
  objectKey?: string | null;
}

export interface UpdateDriverDocumentInput {
  docType?: string;
  docNo?: string | null;
  validFrom?: string | null;
  validTo?: string;
  objectKey?: string | null;
}

const COLUMNS = `id, driver_id AS "driverId", doc_type AS "docType", doc_no AS "docNo",
  valid_from AS "validFrom", valid_to AS "validTo", object_key AS "objectKey"`;

@Injectable()
export class DriverDocumentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByDriverId(
    driverId: string,
    executor: Queryable = this.postgres,
  ): Promise<DriverDocumentRow[]> {
    const { rows } = await executor.query<DriverDocumentRow>(
      `SELECT ${COLUMNS} FROM driver_document WHERE driver_id = $1 ORDER BY valid_to`,
      [driverId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<DriverDocumentRow | null> {
    const { rows } = await executor.query<DriverDocumentRow>(
      `SELECT ${COLUMNS} FROM driver_document WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    driverId: string,
    input: CreateDriverDocumentInput,
    executor: Queryable = this.postgres,
  ): Promise<DriverDocumentRow> {
    const { rows } = await executor.query<DriverDocumentRow>(
      `INSERT INTO driver_document (driver_id, doc_type, doc_no, valid_from, valid_to, object_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        driverId,
        input.docType,
        input.docNo ?? null,
        input.validFrom ?? null,
        input.validTo,
        input.objectKey ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateDriverDocumentInput,
    executor: Queryable = this.postgres,
  ): Promise<DriverDocumentRow | null> {
    const { rows } = await executor.query<DriverDocumentRow>(
      `UPDATE driver_document SET
         doc_type = COALESCE($2, doc_type),
         doc_no = COALESCE($3, doc_no),
         valid_from = COALESCE($4, valid_from),
         valid_to = COALESCE($5, valid_to),
         object_key = COALESCE($6, object_key)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.docType ?? null,
        input.docNo ?? null,
        input.validFrom ?? null,
        input.validTo ?? null,
        input.objectKey ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async delete(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      `DELETE FROM driver_document WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}

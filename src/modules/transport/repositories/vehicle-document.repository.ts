import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface VehicleDocumentRow {
  id: string;
  vehicleId: string;
  docType: string;
  docNo: string | null;
  validFrom: string | null;
  validTo: string;
  objectKey: string | null;
}

export interface CreateVehicleDocumentInput {
  docType: string;
  docNo?: string | null;
  validFrom?: string | null;
  validTo: string;
  objectKey?: string | null;
}

export interface UpdateVehicleDocumentInput {
  docType?: string;
  docNo?: string | null;
  validFrom?: string | null;
  validTo?: string;
  objectKey?: string | null;
}

const COLUMNS = `id, vehicle_id AS "vehicleId", doc_type AS "docType", doc_no AS "docNo",
  valid_from AS "validFrom", valid_to AS "validTo", object_key AS "objectKey"`;

@Injectable()
export class VehicleDocumentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByVehicleId(
    vehicleId: string,
    executor: Queryable = this.postgres,
  ): Promise<VehicleDocumentRow[]> {
    const { rows } = await executor.query<VehicleDocumentRow>(
      `SELECT ${COLUMNS} FROM vehicle_document WHERE vehicle_id = $1 ORDER BY valid_to`,
      [vehicleId],
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<VehicleDocumentRow | null> {
    const { rows } = await executor.query<VehicleDocumentRow>(
      `SELECT ${COLUMNS} FROM vehicle_document WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    vehicleId: string,
    input: CreateVehicleDocumentInput,
    executor: Queryable = this.postgres,
  ): Promise<VehicleDocumentRow> {
    const { rows } = await executor.query<VehicleDocumentRow>(
      `INSERT INTO vehicle_document (vehicle_id, doc_type, doc_no, valid_from, valid_to, object_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        vehicleId,
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
    input: UpdateVehicleDocumentInput,
    executor: Queryable = this.postgres,
  ): Promise<VehicleDocumentRow | null> {
    const { rows } = await executor.query<VehicleDocumentRow>(
      `UPDATE vehicle_document SET
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

  async delete(id: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rowCount } = await executor.query(`DELETE FROM vehicle_document WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }
}

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface GpsDeviceMappingRow {
  id: string;
  deviceId: string;
  vehicleId: string;
  mappedFrom: string;
  mappedTo: string | null;
}

export interface CreateGpsDeviceMappingInput {
  deviceId: string;
  vehicleId: string;
  mappedFrom: string;
  mappedTo?: string | null;
}

export interface UpdateGpsDeviceMappingInput {
  mappedFrom?: string;
  mappedTo?: string | null;
}

export interface GpsDeviceMappingQuery {
  deviceId?: string;
  vehicleId?: string;
}

const COLUMNS = `id, device_id AS "deviceId", vehicle_id AS "vehicleId",
  mapped_from AS "mappedFrom", mapped_to AS "mappedTo"`;

@Injectable()
export class GpsDeviceMappingRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    query: GpsDeviceMappingQuery,
    executor: Queryable = this.postgres,
  ): Promise<GpsDeviceMappingRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.deviceId) {
      params.push(query.deviceId);
      conditions.push(`device_id = $${params.length}`);
    }
    if (query.vehicleId) {
      params.push(query.vehicleId);
      conditions.push(`vehicle_id = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<GpsDeviceMappingRow>(
      `SELECT ${COLUMNS} FROM gps_device_mapping ${where} ORDER BY mapped_from DESC`,
      params,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<GpsDeviceMappingRow | null> {
    const { rows } = await executor.query<GpsDeviceMappingRow>(
      `SELECT ${COLUMNS} FROM gps_device_mapping WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateGpsDeviceMappingInput,
    executor: Queryable = this.postgres,
  ): Promise<GpsDeviceMappingRow> {
    const { rows } = await executor.query<GpsDeviceMappingRow>(
      `INSERT INTO gps_device_mapping (device_id, vehicle_id, mapped_from, mapped_to)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [input.deviceId, input.vehicleId, input.mappedFrom, input.mappedTo ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateGpsDeviceMappingInput,
    executor: Queryable = this.postgres,
  ): Promise<GpsDeviceMappingRow | null> {
    const { rows } = await executor.query<GpsDeviceMappingRow>(
      `UPDATE gps_device_mapping SET
         mapped_from = COALESCE($2, mapped_from),
         mapped_to = COALESCE($3, mapped_to)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, input.mappedFrom ?? null, input.mappedTo ?? null],
    );
    return rows[0] ?? null;
  }
}

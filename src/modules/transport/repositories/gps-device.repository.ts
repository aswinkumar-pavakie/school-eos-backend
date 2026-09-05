import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface GpsDeviceRow {
  id: string;
  deviceUid: string;
  vendor: string | null;
  protocol: string | null;
  authSecretRef: string;
  firmware: string | null;
  lastSeenAt: Date | null;
  status: string;
}

export interface CreateGpsDeviceInput {
  deviceUid: string;
  vendor?: string | null;
  protocol?: string | null;
  authSecretRef: string;
  firmware?: string | null;
  status?: string;
}

export interface UpdateGpsDeviceInput {
  deviceUid?: string;
  vendor?: string | null;
  protocol?: string | null;
  authSecretRef?: string;
  firmware?: string | null;
  status?: string;
}

const COLUMNS = `id, device_uid AS "deviceUid", vendor, protocol, auth_secret_ref AS "authSecretRef",
  firmware, last_seen_at AS "lastSeenAt", status`;

@Injectable()
export class GpsDeviceRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<GpsDeviceRow[]> {
    const { rows } = await executor.query<GpsDeviceRow>(
      `SELECT ${COLUMNS} FROM gps_device ORDER BY device_uid`,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<GpsDeviceRow | null> {
    const { rows } = await executor.query<GpsDeviceRow>(
      `SELECT ${COLUMNS} FROM gps_device WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateGpsDeviceInput,
    executor: Queryable = this.postgres,
  ): Promise<GpsDeviceRow> {
    const { rows } = await executor.query<GpsDeviceRow>(
      `INSERT INTO gps_device (device_uid, vendor, protocol, auth_secret_ref, firmware, status)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.deviceUid,
        input.vendor ?? null,
        input.protocol ?? null,
        input.authSecretRef,
        input.firmware ?? null,
        input.status ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateGpsDeviceInput,
    executor: Queryable = this.postgres,
  ): Promise<GpsDeviceRow | null> {
    const { rows } = await executor.query<GpsDeviceRow>(
      `UPDATE gps_device SET
         device_uid = COALESCE($2, device_uid),
         vendor = COALESCE($3, vendor),
         protocol = COALESCE($4, protocol),
         auth_secret_ref = COALESCE($5, auth_secret_ref),
         firmware = COALESCE($6, firmware),
         status = COALESCE($7, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.deviceUid ?? null,
        input.vendor ?? null,
        input.protocol ?? null,
        input.authSecretRef ?? null,
        input.firmware ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}

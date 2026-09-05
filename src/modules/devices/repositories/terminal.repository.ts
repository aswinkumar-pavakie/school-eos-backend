import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface TerminalRow {
  id: string;
  terminalUid: string;
  terminalType: string;
  label: string;
  vehicleId: string | null;
  vendorId: string | null;
  authSecretRef: string;
  firmwareVersion: string | null;
  offlineFloorPaise: string;
  blocklistVersion: string;
  rosterVersion: string;
  lastSeenAt: Date | null;
  lastSyncAt: Date | null;
  status: string;
}

export interface CreateTerminalInput {
  terminalUid: string;
  terminalType: string;
  label: string;
  vehicleId?: string | null;
  vendorId?: string | null;
  authSecretRef: string;
  firmwareVersion?: string | null;
  offlineFloorPaise?: number | null;
  status?: string;
}

export interface UpdateTerminalInput {
  label?: string;
  firmwareVersion?: string | null;
  offlineFloorPaise?: number | null;
  status?: string;
}

const COLUMNS = `id, terminal_uid AS "terminalUid", terminal_type AS "terminalType", label,
  vehicle_id AS "vehicleId", vendor_id AS "vendorId", auth_secret_ref AS "authSecretRef",
  firmware_version AS "firmwareVersion", offline_floor_paise AS "offlineFloorPaise",
  blocklist_version AS "blocklistVersion", roster_version AS "rosterVersion",
  last_seen_at AS "lastSeenAt", last_sync_at AS "lastSyncAt", status`;

@Injectable()
export class TerminalRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<TerminalRow[]> {
    const { rows } = await executor.query<TerminalRow>(
      `SELECT ${COLUMNS} FROM terminal ORDER BY label`,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<TerminalRow | null> {
    const { rows } = await executor.query<TerminalRow>(`SELECT ${COLUMNS} FROM terminal WHERE id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async create(input: CreateTerminalInput, executor: Queryable = this.postgres): Promise<TerminalRow> {
    const { rows } = await executor.query<TerminalRow>(
      `INSERT INTO terminal
         (terminal_uid, terminal_type, label, vehicle_id, vendor_id, auth_secret_ref,
          firmware_version, offline_floor_paise, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 10000), COALESCE($9, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.terminalUid,
        input.terminalType,
        input.label,
        input.vehicleId ?? null,
        input.vendorId ?? null,
        input.authSecretRef,
        input.firmwareVersion ?? null,
        input.offlineFloorPaise ?? null,
        input.status ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateTerminalInput,
    executor: Queryable = this.postgres,
  ): Promise<TerminalRow | null> {
    const { rows } = await executor.query<TerminalRow>(
      `UPDATE terminal SET
         label = COALESCE($2, label),
         firmware_version = COALESCE($3, firmware_version),
         offline_floor_paise = COALESCE($4, offline_floor_paise),
         status = COALESCE($5, status),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, input.label ?? null, input.firmwareVersion ?? null, input.offlineFloorPaise ?? null, input.status ?? null],
    );
    return rows[0] ?? null;
  }
}

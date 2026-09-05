import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface VehicleMaintenanceRow {
  id: string;
  vehicleId: string;
  maintenanceType: string;
  performedOn: string;
  odometerKm: number | null;
  costPaise: string | null;
  vendor: string | null;
  notes: string | null;
}

export interface CreateVehicleMaintenanceInput {
  maintenanceType: string;
  performedOn: string;
  odometerKm?: number | null;
  costPaise?: number | null;
  vendor?: string | null;
  notes?: string | null;
}

export interface UpdateVehicleMaintenanceInput {
  maintenanceType?: string;
  performedOn?: string;
  odometerKm?: number | null;
  costPaise?: number | null;
  vendor?: string | null;
  notes?: string | null;
}

const COLUMNS = `id, vehicle_id AS "vehicleId", maintenance_type AS "maintenanceType",
  performed_on AS "performedOn", odometer_km AS "odometerKm", cost_paise AS "costPaise",
  vendor, notes`;

@Injectable()
export class VehicleMaintenanceRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByVehicleId(
    vehicleId: string,
    executor: Queryable = this.postgres,
  ): Promise<VehicleMaintenanceRow[]> {
    const { rows } = await executor.query<VehicleMaintenanceRow>(
      `SELECT ${COLUMNS} FROM vehicle_maintenance WHERE vehicle_id = $1 ORDER BY performed_on DESC`,
      [vehicleId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<VehicleMaintenanceRow | null> {
    const { rows } = await executor.query<VehicleMaintenanceRow>(
      `SELECT ${COLUMNS} FROM vehicle_maintenance WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    vehicleId: string,
    input: CreateVehicleMaintenanceInput,
    executor: Queryable = this.postgres,
  ): Promise<VehicleMaintenanceRow> {
    const { rows } = await executor.query<VehicleMaintenanceRow>(
      `INSERT INTO vehicle_maintenance
         (vehicle_id, maintenance_type, performed_on, odometer_km, cost_paise, vendor, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        vehicleId,
        input.maintenanceType,
        input.performedOn,
        input.odometerKm ?? null,
        input.costPaise ?? null,
        input.vendor ?? null,
        input.notes ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateVehicleMaintenanceInput,
    executor: Queryable = this.postgres,
  ): Promise<VehicleMaintenanceRow | null> {
    const { rows } = await executor.query<VehicleMaintenanceRow>(
      `UPDATE vehicle_maintenance SET
         maintenance_type = COALESCE($2, maintenance_type),
         performed_on = COALESCE($3, performed_on),
         odometer_km = COALESCE($4, odometer_km),
         cost_paise = COALESCE($5, cost_paise),
         vendor = COALESCE($6, vendor),
         notes = COALESCE($7, notes)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.maintenanceType ?? null,
        input.performedOn ?? null,
        input.odometerKm ?? null,
        input.costPaise ?? null,
        input.vendor ?? null,
        input.notes ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}

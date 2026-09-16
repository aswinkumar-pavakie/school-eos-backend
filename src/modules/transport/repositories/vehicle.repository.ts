import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface VehicleRow {
  id: string;
  registrationNo: string;
  model: string | null;
  capacity: number;
  ownership: string | null;
  operationalStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVehicleInput {
  registrationNo: string;
  model?: string | null;
  capacity: number;
  ownership?: string | null;
  operationalStatus?: string;
}

export interface UpdateVehicleInput {
  registrationNo?: string;
  model?: string | null;
  capacity?: number;
  ownership?: string | null;
  operationalStatus?: string;
}

const COLUMNS = `id, registration_no AS "registrationNo", model, capacity, ownership,
  operational_status AS "operationalStatus", created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class VehicleRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<VehicleRow[]> {
    const { rows } = await executor.query<VehicleRow>(
      `SELECT ${COLUMNS} FROM vehicle ORDER BY registration_no`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<VehicleRow | null> {
    const { rows } = await executor.query<VehicleRow>(
      `SELECT ${COLUMNS} FROM vehicle WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateVehicleInput,
    executor: Queryable = this.postgres,
  ): Promise<VehicleRow> {
    const { rows } = await executor.query<VehicleRow>(
      `INSERT INTO vehicle (registration_no, model, capacity, ownership, operational_status)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.registrationNo,
        input.model ?? null,
        input.capacity,
        input.ownership ?? null,
        input.operationalStatus ?? null,
      ],
    );
    return rows[0];
  }

  /** Real odometer/service-due tracking for the Transport Overview
   * dashboard's own "Renewals & service" tile -- deliberately NOT part of the
   * main `VehicleRow`/`COLUMNS` above, which every existing vehicle list/get/
   * create/update call depends on: those two new columns only exist once
   * query.md's `ALTER TABLE vehicle ADD COLUMN ...` has actually been run, and
   * referencing a column that doesn't exist yet would 500 every one of those
   * already-working calls, not just this new feature. Catching 42703
   * (undefined_column) and returning an empty map instead means the feature
   * shows "not tracked yet" until the migration runs, and starts working
   * immediately after -- no redeploy needed, no risk to anything else. */
  async findServiceDueMap(
    executor: Queryable = this.postgres,
  ): Promise<Map<string, { currentOdometerKm: number | null; nextServiceDueKm: number | null }>> {
    try {
      const { rows } = await executor.query<{
        id: string;
        currentOdometerKm: number | null;
        nextServiceDueKm: number | null;
      }>(
        `SELECT id, current_odometer_km AS "currentOdometerKm", next_service_due_km AS "nextServiceDueKm" FROM vehicle`,
      );
      return new Map(rows.map((r) => [r.id, { currentOdometerKm: r.currentOdometerKm, nextServiceDueKm: r.nextServiceDueKm }]));
    } catch (err) {
      if ((err as { code?: string }).code === '42703') return new Map();
      throw err;
    }
  }

  async update(
    id: string,
    input: UpdateVehicleInput,
    executor: Queryable = this.postgres,
  ): Promise<VehicleRow | null> {
    const { rows } = await executor.query<VehicleRow>(
      `UPDATE vehicle SET
         registration_no = COALESCE($2, registration_no),
         model = COALESCE($3, model),
         capacity = COALESCE($4, capacity),
         ownership = COALESCE($5, ownership),
         operational_status = COALESCE($6, operational_status),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.registrationNo ?? null,
        input.model ?? null,
        input.capacity ?? null,
        input.ownership ?? null,
        input.operationalStatus ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  /** Real spec fields for the bus detail page's own "Vehicle specification"
   * card -- same 42703 (undefined_column) degrade-gracefully reasoning as
   * findServiceDueMap above: these eleven columns don't exist until
   * query.md's own ALTER TABLE has been run. Returns null (not an empty
   * object) so the caller can render "not recorded" per-field rather than a
   * page-wide error. */
  async findSpec(id: string, executor: Queryable = this.postgres): Promise<VehicleSpecRow | null> {
    try {
      const { rows } = await executor.query<VehicleSpecRow>(
        `SELECT year_of_manufacture AS "yearOfManufacture", body_type AS "bodyType",
           chassis_no AS "chassisNo", engine_no AS "engineNo", engine_desc AS "engineDesc",
           wheelbase_mm AS "wheelbaseMm", tyre_size AS "tyreSize", tyre_count AS "tyreCount",
           fuel_tank_litres AS "fuelTankLitres", rto_office AS "rtoOffice", parking_bay AS "parkingBay",
           current_odometer_km AS "currentOdometerKm", next_service_due_km AS "nextServiceDueKm"
         FROM vehicle WHERE id = $1`,
        [id],
      );
      return rows[0] ?? null;
    } catch (err) {
      if ((err as { code?: string }).code === '42703') return null;
      throw err;
    }
  }

  async updateSpec(id: string, input: UpdateVehicleSpecInput, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(
      `UPDATE vehicle SET
         year_of_manufacture = COALESCE($2, year_of_manufacture),
         body_type = COALESCE($3, body_type),
         chassis_no = COALESCE($4, chassis_no),
         engine_no = COALESCE($5, engine_no),
         engine_desc = COALESCE($6, engine_desc),
         wheelbase_mm = COALESCE($7, wheelbase_mm),
         tyre_size = COALESCE($8, tyre_size),
         tyre_count = COALESCE($9, tyre_count),
         fuel_tank_litres = COALESCE($10, fuel_tank_litres),
         rto_office = COALESCE($11, rto_office),
         parking_bay = COALESCE($12, parking_bay),
         current_odometer_km = COALESCE($13, current_odometer_km),
         next_service_due_km = COALESCE($14, next_service_due_km),
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.yearOfManufacture ?? null,
        input.bodyType ?? null,
        input.chassisNo ?? null,
        input.engineNo ?? null,
        input.engineDesc ?? null,
        input.wheelbaseMm ?? null,
        input.tyreSize ?? null,
        input.tyreCount ?? null,
        input.fuelTankLitres ?? null,
        input.rtoOffice ?? null,
        input.parkingBay ?? null,
        input.currentOdometerKm ?? null,
        input.nextServiceDueKm ?? null,
      ],
    );
  }

  /** Real fleet-wide compliance summary -- the sidebar's own "Compliance" nav
   * badge (a real count, not a label). Union of vehicle_document +
   * driver_document, both already real tables with no schema change needed.
   * "Expiring" = valid_to within 45 days (including already-lapsed), same
   * window the Overview dashboard's own "Renewals & service" tile uses. */
  async findComplianceSummary(executor: Queryable = this.postgres): Promise<{ expiring: number; overdue: number }> {
    const { rows } = await executor.query<{ expiring: string; overdue: string }>(
      `SELECT
         count(*) FILTER (WHERE valid_to <= current_date + interval '45 days') AS expiring,
         count(*) FILTER (WHERE valid_to < current_date) AS overdue
       FROM (
         SELECT valid_to FROM vehicle_document
         UNION ALL
         SELECT valid_to FROM driver_document WHERE valid_to IS NOT NULL
       ) docs`,
    );
    return { expiring: Number(rows[0]?.expiring ?? 0), overdue: Number(rows[0]?.overdue ?? 0) };
  }

  /** Real GPS device status for a vehicle -- gps_device/gps_device_mapping
   * already existed (no schema change needed here). `mapped_to IS NULL` is
   * the current/active mapping, same convention as every other "currently
   * effective" row this codebase already uses (vehicle_route_assignment's
   * own effective_to IS NULL, etc). */
  async findGpsStatus(
    vehicleId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ deviceUid: string; status: string; lastSeenAt: Date | null } | null> {
    const { rows } = await executor.query<{ deviceUid: string; status: string; lastSeenAt: Date | null }>(
      `SELECT gd.device_uid AS "deviceUid", gd.status, gd.last_seen_at AS "lastSeenAt"
       FROM gps_device_mapping gdm
       JOIN gps_device gd ON gd.id = gdm.device_id
       WHERE gdm.vehicle_id = $1 AND gdm.mapped_to IS NULL`,
      [vehicleId],
    );
    return rows[0] ?? null;
  }
}

export interface VehicleSpecRow {
  yearOfManufacture: number | null;
  bodyType: string | null;
  chassisNo: string | null;
  engineNo: string | null;
  engineDesc: string | null;
  wheelbaseMm: number | null;
  tyreSize: string | null;
  tyreCount: number | null;
  fuelTankLitres: number | null;
  rtoOffice: string | null;
  parkingBay: string | null;
  currentOdometerKm: number | null;
  nextServiceDueKm: number | null;
}

export interface UpdateVehicleSpecInput {
  yearOfManufacture?: number;
  bodyType?: string;
  chassisNo?: string;
  engineNo?: string;
  engineDesc?: string;
  wheelbaseMm?: number;
  tyreSize?: string;
  tyreCount?: number;
  fuelTankLitres?: number;
  rtoOffice?: string;
  parkingBay?: string;
  currentOdometerKm?: number;
  nextServiceDueKm?: number;
}

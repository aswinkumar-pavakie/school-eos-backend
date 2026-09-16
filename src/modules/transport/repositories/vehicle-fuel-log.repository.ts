// Real fuel log -- vehicle_fuel_log doesn't exist in the DB yet (see
// query.md's own CREATE TABLE). Every method here catches 42P01
// (undefined_table) and degrades to "no data yet" instead of a 500, exactly
// like VehicleRepository.findServiceDueMap's own reasoning -- this repository
// starts working the moment the table is created, no redeploy needed.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface FuelLogRow {
  id: string;
  vehicleId: string;
  registrationNo: string;
  filledOn: string;
  litres: string;
  costPaise: string;
  odometerKm: number | null;
  recordedByFirstName: string | null;
  recordedByLastName: string | null;
  createdAt: Date;
}

export interface CreateFuelLogInput {
  vehicleId: string;
  filledOn: string;
  litres: number;
  costPaise: number;
  odometerKm?: number | null;
  recordedBy: string;
}

function isUndefinedTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

const COLUMNS = `fl.id, fl.vehicle_id AS "vehicleId", v.registration_no AS "registrationNo",
  fl.filled_on AS "filledOn", fl.litres, fl.cost_paise AS "costPaise", fl.odometer_km AS "odometerKm",
  p.first_name AS "recordedByFirstName", p.last_name AS "recordedByLastName", fl.created_at AS "createdAt"`;
const FROM = `vehicle_fuel_log fl
  JOIN vehicle v ON v.id = fl.vehicle_id
  LEFT JOIN person p ON p.id = fl.recorded_by`;

@Injectable()
export class VehicleFuelLogRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByVehicleId(vehicleId: string, executor: Queryable = this.postgres): Promise<FuelLogRow[]> {
    try {
      const { rows } = await executor.query<FuelLogRow>(
        `SELECT ${COLUMNS} FROM ${FROM} WHERE fl.vehicle_id = $1 ORDER BY fl.filled_on DESC`,
        [vehicleId],
      );
      return rows;
    } catch (err) {
      if (isUndefinedTable(err)) return [];
      throw err;
    }
  }

  /** Real fleet-wide sum for a date range -- the Transport Overview
   * dashboard's own "Diesel today" tile. Returns litres/paise as '0' (not
   * null) when the table doesn't exist yet or no fill-ups fall in range --
   * both are a real, honest zero, not "unknown". */
  async sumByDateRange(
    filter: { from: string; to: string },
    executor: Queryable = this.postgres,
  ): Promise<{ totalLitres: string; totalCostPaise: string }> {
    try {
      const { rows } = await executor.query<{ totalLitres: string; totalCostPaise: string }>(
        `SELECT COALESCE(SUM(litres), 0)::text AS "totalLitres", COALESCE(SUM(cost_paise), 0)::text AS "totalCostPaise"
         FROM vehicle_fuel_log WHERE filled_on BETWEEN $1 AND $2`,
        [filter.from, filter.to],
      );
      return rows[0];
    } catch (err) {
      if (isUndefinedTable(err)) return { totalLitres: '0', totalCostPaise: '0' };
      throw err;
    }
  }

  async create(input: CreateFuelLogInput, executor: Queryable = this.postgres): Promise<{ id: string }> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO vehicle_fuel_log (vehicle_id, filled_on, litres, cost_paise, odometer_km, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [input.vehicleId, input.filledOn, input.litres, input.costPaise, input.odometerKm ?? null, input.recordedBy],
    );
    return rows[0];
  }
}

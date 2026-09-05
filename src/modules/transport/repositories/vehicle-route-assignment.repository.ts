import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface VehicleRouteAssignmentRow {
  id: string;
  vehicleId: string;
  routeId: string;
  driverId: string | null;
  attendantId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface CreateVehicleRouteAssignmentInput {
  vehicleId: string;
  routeId: string;
  driverId?: string | null;
  attendantId?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface UpdateVehicleRouteAssignmentInput {
  driverId?: string | null;
  attendantId?: string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

export interface VehicleRouteAssignmentQuery {
  vehicleId?: string;
  routeId?: string;
  currentOnly?: boolean;
}

const COLUMNS = `id, vehicle_id AS "vehicleId", route_id AS "routeId", driver_id AS "driverId",
  attendant_id AS "attendantId", effective_from AS "effectiveFrom", effective_to AS "effectiveTo"`;

@Injectable()
export class VehicleRouteAssignmentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    query: VehicleRouteAssignmentQuery,
    executor: Queryable = this.postgres,
  ): Promise<VehicleRouteAssignmentRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.vehicleId) {
      params.push(query.vehicleId);
      conditions.push(`vehicle_id = $${params.length}`);
    }
    if (query.routeId) {
      params.push(query.routeId);
      conditions.push(`route_id = $${params.length}`);
    }
    if (query.currentOnly) {
      conditions.push(`(effective_to IS NULL OR effective_to >= CURRENT_DATE)`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<VehicleRouteAssignmentRow>(
      `SELECT ${COLUMNS} FROM vehicle_route_assignment ${where} ORDER BY effective_from DESC`,
      params,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<VehicleRouteAssignmentRow | null> {
    const { rows } = await executor.query<VehicleRouteAssignmentRow>(
      `SELECT ${COLUMNS} FROM vehicle_route_assignment WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateVehicleRouteAssignmentInput,
    executor: Queryable = this.postgres,
  ): Promise<VehicleRouteAssignmentRow> {
    const { rows } = await executor.query<VehicleRouteAssignmentRow>(
      `INSERT INTO vehicle_route_assignment
         (vehicle_id, route_id, driver_id, attendant_id, effective_from, effective_to)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        input.vehicleId,
        input.routeId,
        input.driverId ?? null,
        input.attendantId ?? null,
        input.effectiveFrom,
        input.effectiveTo ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateVehicleRouteAssignmentInput,
    executor: Queryable = this.postgres,
  ): Promise<VehicleRouteAssignmentRow | null> {
    const { rows } = await executor.query<VehicleRouteAssignmentRow>(
      `UPDATE vehicle_route_assignment SET
         driver_id = COALESCE($2, driver_id),
         attendant_id = COALESCE($3, attendant_id),
         effective_from = COALESCE($4, effective_from),
         effective_to = COALESCE($5, effective_to)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.driverId ?? null,
        input.attendantId ?? null,
        input.effectiveFrom ?? null,
        input.effectiveTo ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface RouteStopRow {
  id: string;
  routeId: string;
  stopName: string;
  sequenceNo: number;
  latitude: string | null;
  longitude: string | null;
  scheduledTime: string | null;
  geofenceRadiusM: number;
}

export interface CreateRouteStopInput {
  stopName: string;
  sequenceNo: number;
  latitude?: number | null;
  longitude?: number | null;
  scheduledTime?: string | null;
  geofenceRadiusM?: number;
}

export interface UpdateRouteStopInput {
  stopName?: string;
  sequenceNo?: number;
  latitude?: number | null;
  longitude?: number | null;
  scheduledTime?: string | null;
  geofenceRadiusM?: number;
}

const COLUMNS = `id, route_id AS "routeId", stop_name AS "stopName", sequence_no AS "sequenceNo",
  latitude, longitude, scheduled_time AS "scheduledTime", geofence_radius_m AS "geofenceRadiusM"`;

@Injectable()
export class RouteStopRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByRouteId(
    routeId: string,
    executor: Queryable = this.postgres,
  ): Promise<RouteStopRow[]> {
    const { rows } = await executor.query<RouteStopRow>(
      `SELECT ${COLUMNS} FROM route_stop WHERE route_id = $1 ORDER BY sequence_no`,
      [routeId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<RouteStopRow | null> {
    const { rows } = await executor.query<RouteStopRow>(
      `SELECT ${COLUMNS} FROM route_stop WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    routeId: string,
    input: CreateRouteStopInput,
    executor: Queryable = this.postgres,
  ): Promise<RouteStopRow> {
    const { rows } = await executor.query<RouteStopRow>(
      `INSERT INTO route_stop
         (route_id, stop_name, sequence_no, latitude, longitude, scheduled_time, geofence_radius_m)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 150))
       RETURNING ${COLUMNS}`,
      [
        routeId,
        input.stopName,
        input.sequenceNo,
        input.latitude ?? null,
        input.longitude ?? null,
        input.scheduledTime ?? null,
        input.geofenceRadiusM ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateRouteStopInput,
    executor: Queryable = this.postgres,
  ): Promise<RouteStopRow | null> {
    const { rows } = await executor.query<RouteStopRow>(
      `UPDATE route_stop SET
         stop_name = COALESCE($2, stop_name),
         sequence_no = COALESCE($3, sequence_no),
         latitude = COALESCE($4, latitude),
         longitude = COALESCE($5, longitude),
         scheduled_time = COALESCE($6, scheduled_time),
         geofence_radius_m = COALESCE($7, geofence_radius_m)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.stopName ?? null,
        input.sequenceNo ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.scheduledTime ?? null,
        input.geofenceRadiusM ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async delete(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      `DELETE FROM route_stop WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}

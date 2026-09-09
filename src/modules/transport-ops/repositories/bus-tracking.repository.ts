// Read-only: live GPS telemetry + trip lifecycle rows for one vehicle. Neither
// table has any other NestJS code touching it yet (confirmed via a live
// information_schema/pg_constraint check before writing this) -- this is purely
// additive read access to schema that already exists, no new tables.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface LatestTelemetryRow {
  vehicleId: string;
  recordedAt: Date;
  latitude: string;
  longitude: string;
  speedKmph: string | null;
  heading: number | null;
}

export interface TripRow {
  id: string;
  assignmentId: string;
  tripDate: string;
  direction: string;
  state: string;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface LastBoardingStopRow {
  routeStopId: string;
  stopName: string;
  sequenceNo: number;
  recordedAt: Date;
}

export interface NextStopRow {
  routeStopId: string;
  stopName: string;
  sequenceNo: number;
}

@Injectable()
export class BusTrackingRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Most recent GPS ping for this vehicle, across all trips -- never
   * fabricated, null if the vehicle has no telemetry rows at all. */
  async findLatestTelemetry(
    vehicleId: string,
    executor: Queryable = this.postgres,
  ): Promise<LatestTelemetryRow | null> {
    const { rows } = await executor.query<LatestTelemetryRow>(
      `SELECT vehicle_id AS "vehicleId", recorded_at AS "recordedAt", latitude, longitude,
              speed_kmph AS "speedKmph", heading
       FROM telemetry_event
       WHERE vehicle_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [vehicleId],
    );
    return rows[0] ?? null;
  }

  /** One row per vehicle -- its single most recent telemetry ping, for the
   * fleet-wide Live Tracking map/list and the Overview's live-bus-status
   * tiles. DISTINCT ON, not N calls to findLatestTelemetry -- one query
   * regardless of fleet size. Vehicles with zero telemetry rows are simply
   * absent from the result (never a fabricated placeholder). */
  async findLatestForVehicles(
    vehicleIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<LatestTelemetryRow[]> {
    if (vehicleIds.length === 0) return [];
    const { rows } = await executor.query<LatestTelemetryRow>(
      `SELECT DISTINCT ON (vehicle_id) vehicle_id AS "vehicleId", recorded_at AS "recordedAt",
              latitude, longitude, speed_kmph AS "speedKmph", heading
       FROM telemetry_event
       WHERE vehicle_id = ANY($1::uuid[])
       ORDER BY vehicle_id, recorded_at DESC`,
      [vehicleIds],
    );
    return rows;
  }

  /** Every trip (both directions) for this assignment on this exact date --
   * never creates one; a bus/date with no trip yet returns an empty array. */
  async findTripsForAssignmentDate(
    assignmentId: string,
    tripDate: string,
    executor: Queryable = this.postgres,
  ): Promise<TripRow[]> {
    const { rows } = await executor.query<TripRow>(
      `SELECT id, assignment_id AS "assignmentId", trip_date AS "tripDate", direction, state,
              started_at AS "startedAt", completed_at AS "completedAt"
       FROM trip
       WHERE assignment_id = $1 AND trip_date = $2
       ORDER BY (state = ANY (ARRAY['STARTED','IN_PROGRESS'])) DESC, (direction = 'PICKUP') DESC`,
      [assignmentId, tripDate],
    );
    return rows;
  }

  /** Same as findTripsForAssignmentDate, but for every assignment in the fleet
   * at once -- the fleet-wide Live Tracking/Overview screens' one query
   * instead of one per bus. */
  async findTripsForAssignmentsDate(
    assignmentIds: string[],
    tripDate: string,
    executor: Queryable = this.postgres,
  ): Promise<TripRow[]> {
    if (assignmentIds.length === 0) return [];
    const { rows } = await executor.query<TripRow>(
      `SELECT id, assignment_id AS "assignmentId", trip_date AS "tripDate", direction, state,
              started_at AS "startedAt", completed_at AS "completedAt"
       FROM trip
       WHERE assignment_id = ANY($1::uuid[]) AND trip_date = $2
       ORDER BY assignment_id, (state = ANY (ARRAY['STARTED','IN_PROGRESS'])) DESC, (direction = 'PICKUP') DESC`,
      [assignmentIds, tripDate],
    );
    return rows;
  }

  /** The stop of the most recently recorded boarding/alighting event on this
   * trip -- a real fact from an actual event, never a GPS-distance guess. */
  async findLastBoardingStop(
    tripId: string,
    executor: Queryable = this.postgres,
  ): Promise<LastBoardingStopRow | null> {
    const { rows } = await executor.query<LastBoardingStopRow>(
      `SELECT rs.id AS "routeStopId", rs.stop_name AS "stopName", rs.sequence_no AS "sequenceNo",
              bbe.recorded_at AS "recordedAt"
       FROM bus_boarding_event bbe
       JOIN route_stop rs ON rs.id = bbe.route_stop_id
       WHERE bbe.trip_id = $1
       ORDER BY bbe.recorded_at DESC
       LIMIT 1`,
      [tripId],
    );
    return rows[0] ?? null;
  }

  /** The next stop in sequence on this route after the given sequence number --
   * real static route data, not a computed ETA/prediction. */
  async findNextStop(
    routeId: string,
    afterSequenceNo: number,
    executor: Queryable = this.postgres,
  ): Promise<NextStopRow | null> {
    const { rows } = await executor.query<NextStopRow>(
      `SELECT id AS "routeStopId", stop_name AS "stopName", sequence_no AS "sequenceNo"
       FROM route_stop
       WHERE route_id = $1 AND sequence_no > $2
       ORDER BY sequence_no ASC
       LIMIT 1`,
      [routeId, afterSequenceNo],
    );
    return rows[0] ?? null;
  }
}

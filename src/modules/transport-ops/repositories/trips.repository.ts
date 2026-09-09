// Read-only trip list/detail. `trip` has zero other NestJS code touching it
// except bus-tracking/boarding-monitor's own narrow per-vehicle-date lookup
// (findTripsForAssignmentDate) -- this is the first general list/detail view
// over it. No trip creation/lifecycle-write here (that's explicitly out of
// scope for this phase -- see transport-ops.module.ts's own header comment).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface TripListFilter {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  vehicleId?: string;
  routeId?: string;
  driverId?: string;
  state?: string;
  limit: number;
  offset: number;
}

export interface TripListRow {
  id: string;
  tripDate: string;
  direction: string;
  state: string;
  startedAt: Date | null;
  completedAt: Date | null;
  vehicleId: string;
  registrationNo: string;
  routeId: string;
  routeName: string;
  driverId: string | null;
  driverName: string | null;
  expectedCount: string;
  /** Checked in for this trip -- BOARDED or DROPPED (both mean "showed up");
   * the trip detail's own attendance breakdown disambiguates the two. */
  boardedCount: string;
  alertCount: string;
}

export interface TripDetailRow extends TripListRow {
  distanceKm: string | null;
  startedByPersonId: string | null;
}

export interface TripAttendanceCounts {
  expected: string;
  boarded: string;
  dropped: string;
  notBoarded: string;
  absent: string;
}

export interface BoardingTimelineRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  stopId: string | null;
  stopName: string | null;
  direction: string;
  source: string;
  isWrongBus: boolean;
  recordedAt: Date;
}

// Every trip's real vehicle/route/driver via its own assignment -- never a
// second, possibly-stale copy of vehicle_route_assignment's own join.
const TRIP_FROM = `
  FROM trip t
  JOIN vehicle_route_assignment vra ON vra.id = t.assignment_id
  JOIN vehicle v ON v.id = vra.vehicle_id
  JOIN route r ON r.id = vra.route_id
  LEFT JOIN driver d ON d.id = vra.driver_id`;

const TRIP_COLUMNS = `t.id, t.trip_date AS "tripDate", t.direction, t.state,
  t.started_at AS "startedAt", t.completed_at AS "completedAt",
  v.id AS "vehicleId", v.registration_no AS "registrationNo",
  r.id AS "routeId", r.name AS "routeName",
  d.id AS "driverId", d.full_name AS "driverName",
  COALESCE(sts.expected, 0) AS "expectedCount",
  COALESCE(sts.boarded, 0) AS "boardedCount",
  COALESCE(al.alert_count, 0) AS "alertCount"`;

// LATERAL, not a GROUP BY over the whole result set -- keeps the list query a
// single pass per trip row, same shape as this backend's other per-row
// aggregate joins (e.g. student.repository.ts's own COALESCE subqueries).
const TRIP_JOINS = `
  LEFT JOIN LATERAL (
    SELECT count(*) AS expected,
           count(*) FILTER (WHERE status IN ('BOARDED', 'DROPPED')) AS boarded
    FROM student_trip_status WHERE trip_id = t.id
  ) sts ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS alert_count FROM transport_alert WHERE trip_id = t.id
  ) al ON true`;

@Injectable()
export class TripsRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: TripListFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: TripListRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.date) {
      params.push(filter.date);
      conditions.push(`t.trip_date = $${params.length}`);
    }
    if (filter.dateFrom) {
      params.push(filter.dateFrom);
      conditions.push(`t.trip_date >= $${params.length}`);
    }
    if (filter.dateTo) {
      params.push(filter.dateTo);
      conditions.push(`t.trip_date <= $${params.length}`);
    }
    if (filter.vehicleId) {
      params.push(filter.vehicleId);
      conditions.push(`v.id = $${params.length}`);
    }
    if (filter.routeId) {
      params.push(filter.routeId);
      conditions.push(`r.id = $${params.length}`);
    }
    if (filter.driverId) {
      params.push(filter.driverId);
      conditions.push(`d.id = $${params.length}`);
    }
    if (filter.state) {
      params.push(filter.state);
      conditions.push(`t.state = $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await executor.query<{ count: string }>(
      `SELECT count(*) ${TRIP_FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<TripListRow>(
      `SELECT ${TRIP_COLUMNS} ${TRIP_FROM} ${TRIP_JOINS} ${where}
       ORDER BY t.trip_date DESC, t.started_at DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<TripDetailRow | null> {
    const { rows } = await executor.query<TripDetailRow>(
      `SELECT ${TRIP_COLUMNS}, t.distance_km AS "distanceKm", t.started_by AS "startedByPersonId"
       ${TRIP_FROM} ${TRIP_JOINS}
       WHERE t.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findAttendanceCounts(
    tripId: string,
    executor: Queryable = this.postgres,
  ): Promise<TripAttendanceCounts> {
    const { rows } = await executor.query<{
      expected: string;
      boarded: string;
      dropped: string;
      notBoarded: string;
      absent: string;
    }>(
      `SELECT count(*) AS expected,
              count(*) FILTER (WHERE status = 'BOARDED') AS boarded,
              count(*) FILTER (WHERE status = 'DROPPED') AS dropped,
              count(*) FILTER (WHERE status = 'NOT_BOARDED') AS "notBoarded",
              count(*) FILTER (WHERE status = 'ABSENT') AS absent
       FROM student_trip_status WHERE trip_id = $1`,
      [tripId],
    );
    return (
      rows[0] ?? {
        expected: '0',
        boarded: '0',
        dropped: '0',
        notBoarded: '0',
        absent: '0',
      }
    );
  }

  /** Every real boarding/alighting event on this trip, oldest first -- the
   * trip's actual timeline. `source` is always real ('ATTENDANT_MANUAL' or
   * 'CARD_TAP'), never inferred. */
  async findBoardingTimeline(
    tripId: string,
    executor: Queryable = this.postgres,
  ): Promise<BoardingTimelineRow[]> {
    const { rows } = await executor.query<BoardingTimelineRow>(
      `SELECT bbe.id::text AS id, bbe.student_id AS "studentId",
              p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
              rs.id AS "stopId", rs.stop_name AS "stopName",
              bbe.direction, bbe.source, bbe.is_wrong_bus AS "isWrongBus",
              bbe.recorded_at AS "recordedAt"
       FROM bus_boarding_event bbe
       JOIN student s ON s.id = bbe.student_id
       JOIN person p ON p.id = s.person_id
       LEFT JOIN route_stop rs ON rs.id = bbe.route_stop_id
       WHERE bbe.trip_id = $1
       ORDER BY bbe.recorded_at ASC`,
      [tripId],
    );
    return rows;
  }
}

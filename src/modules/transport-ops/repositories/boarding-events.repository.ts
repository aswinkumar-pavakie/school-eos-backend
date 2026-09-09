// Read-only list of every real bus_boarding_event -- the "NFC Attendance"
// screen's data source. `source` is always the real recorded value
// ('ATTENDANT_MANUAL' or 'CARD_TAP', via bbe.card_tap_event_id) -- never
// inferred or relabelled. As of this writing every row in this database is
// ATTENDANT_MANUAL (zero BUS-type terminals / BUS_BOARDING card taps exist
// yet); the query itself is written generically so a real NFC boarding event
// the moment one exists needs no code change here.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface BoardingEventFilter {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  vehicleId?: string;
  routeId?: string;
  tripId?: string;
  gradeId?: string;
  source?: string;
  limit: number;
  offset: number;
}

export interface BoardingEventRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  tripId: string;
  vehicleId: string;
  registrationNo: string;
  routeId: string;
  routeName: string;
  direction: string;
  stopName: string | null;
  source: string;
  cardUid: string | null;
  tapResult: string | null;
  isWrongBus: boolean;
  recordedAt: Date;
}

const CURRENT_ENROLMENT_JOIN = `
  LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
    AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id`;

const FROM = `
  FROM bus_boarding_event bbe
  JOIN trip t ON t.id = bbe.trip_id
  JOIN vehicle_route_assignment vra ON vra.id = t.assignment_id
  JOIN vehicle v ON v.id = vra.vehicle_id
  JOIN route r ON r.id = vra.route_id
  JOIN student s ON s.id = bbe.student_id
  JOIN person p ON p.id = s.person_id
  LEFT JOIN route_stop rs ON rs.id = bbe.route_stop_id
  LEFT JOIN card_tap_event cte ON cte.id = bbe.card_tap_event_id
  ${CURRENT_ENROLMENT_JOIN}`;

const COLUMNS = `bbe.id::text AS id, bbe.student_id AS "studentId",
  p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
  s.admission_no AS "admissionNo", g.name AS "gradeName", sec.name AS "sectionName",
  bbe.trip_id AS "tripId", v.id AS "vehicleId", v.registration_no AS "registrationNo",
  r.id AS "routeId", r.name AS "routeName",
  bbe.direction, rs.stop_name AS "stopName", bbe.source,
  cte.card_uid AS "cardUid", cte.tap_result AS "tapResult",
  bbe.is_wrong_bus AS "isWrongBus", bbe.recorded_at AS "recordedAt"`;

@Injectable()
export class BoardingEventsRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: BoardingEventFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: BoardingEventRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.date) {
      params.push(filter.date);
      conditions.push(`bbe.recorded_at::date = $${params.length}`);
    }
    if (filter.dateFrom) {
      params.push(filter.dateFrom);
      conditions.push(`bbe.recorded_at::date >= $${params.length}`);
    }
    if (filter.dateTo) {
      params.push(filter.dateTo);
      conditions.push(`bbe.recorded_at::date <= $${params.length}`);
    }
    if (filter.vehicleId) {
      params.push(filter.vehicleId);
      conditions.push(`v.id = $${params.length}`);
    }
    if (filter.routeId) {
      params.push(filter.routeId);
      conditions.push(`r.id = $${params.length}`);
    }
    if (filter.tripId) {
      params.push(filter.tripId);
      conditions.push(`bbe.trip_id = $${params.length}`);
    }
    if (filter.gradeId) {
      params.push(filter.gradeId);
      conditions.push(`g.id = $${params.length}`);
    }
    if (filter.source) {
      params.push(filter.source);
      conditions.push(`bbe.source = $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await executor.query<{ count: string }>(
      `SELECT count(*) ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<BoardingEventRow>(
      `SELECT ${COLUMNS} ${FROM} ${where}
       ORDER BY bbe.recorded_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }
}

// Read-only: which students are on a given route, and their real recorded
// boarding/leave state for one trip. student_trip_status/bus_boarding_event/
// student_leave_request have zero other NestJS code touching them yet
// (confirmed live before writing this) -- purely additive read access, no new
// tables, no ingestion, no trip creation.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StudentOnRouteRow {
  studentId: string;
  firstName: string;
  lastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  routeStopId: string;
  stopName: string;
  direction: string;
}

export interface TripStatusRow {
  studentId: string;
  status: string;
  boardedAt: Date | null;
  droppedAt: Date | null;
}

export interface ApprovedLeaveRow {
  studentId: string;
  reason: string;
  fromDate: string;
  toDate: string;
}

// Mirrors people/repositories/student.repository.ts's own CURRENT_ENROLMENT_JOIN
// exactly (current ACTIVE enrolment -> section -> grade) -- same real join, not a
// second, possibly-diverging definition of "the student's current class".
const CURRENT_ENROLMENT_JOIN = `
  LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
    AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id`;

@Injectable()
export class BoardingMonitorRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every ACTIVE student_transport_allocation on this route -- the real
   * "who is assigned to this bus" set, never all school students. */
  async findActiveStudentsForRoute(
    routeId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentOnRouteRow[]> {
    const { rows } = await executor.query<StudentOnRouteRow>(
      `SELECT sta.student_id AS "studentId", p.first_name AS "firstName", p.last_name AS "lastName",
              s.admission_no AS "admissionNo", g.name AS "gradeName", sec.name AS "sectionName",
              sta.route_stop_id AS "routeStopId", rs.stop_name AS "stopName", sta.direction
       FROM student_transport_allocation sta
       JOIN route_stop rs ON rs.id = sta.route_stop_id
       JOIN student s ON s.id = sta.student_id
       JOIN person p ON p.id = s.person_id
       ${CURRENT_ENROLMENT_JOIN}
       WHERE rs.route_id = $1 AND sta.status = 'ACTIVE'
       ORDER BY rs.sequence_no, p.first_name, p.last_name`,
      [routeId],
    );
    return rows;
  }

  async findTripStatusForTrip(
    tripId: string,
    studentIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<TripStatusRow[]> {
    if (studentIds.length === 0) return [];
    const { rows } = await executor.query<TripStatusRow>(
      `SELECT student_id AS "studentId", status, boarded_at AS "boardedAt", dropped_at AS "droppedAt"
       FROM student_trip_status
       WHERE trip_id = $1 AND student_id = ANY($2::uuid[])`,
      [tripId, studentIds],
    );
    return rows;
  }

  /** APPROVED leave requests covering the given date, for the given students --
   * the sole source of the "Absent" derivation, never inferred from a missing
   * NFC tap alone. */
  async findApprovedLeaves(
    studentIds: string[],
    date: string,
    executor: Queryable = this.postgres,
  ): Promise<ApprovedLeaveRow[]> {
    if (studentIds.length === 0) return [];
    const { rows } = await executor.query<ApprovedLeaveRow>(
      `SELECT student_id AS "studentId", reason, from_date AS "fromDate", to_date AS "toDate"
       FROM student_leave_request
       WHERE student_id = ANY($1::uuid[]) AND state = 'APPROVED'
         AND from_date <= $2 AND to_date >= $2`,
      [studentIds, date],
    );
    return rows;
  }
}

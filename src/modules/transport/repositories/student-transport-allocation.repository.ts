import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StudentTransportAllocationRow {
  id: string;
  studentId: string;
  routeStopId: string;
  academicYearId: string;
  direction: string;
  feeSlab: string | null;
  validFrom: string;
  validTo: string | null;
  status: string;
}

export interface CreateStudentTransportAllocationInput {
  studentId: string;
  routeStopId: string;
  academicYearId: string;
  direction: string;
  feeSlab?: string | null;
  validFrom?: string;
}

export interface UpdateStudentTransportAllocationInput {
  routeStopId?: string;
  direction?: string;
  feeSlab?: string | null;
  validTo?: string | null;
}

export interface StudentTransportAllocationFilter {
  studentId?: string;
  academicYearId?: string;
  routeStopId?: string;
  status?: string;
}

export interface StudentTransportSummaryRow {
  id: string;
  direction: string;
  feeSlab: string | null;
  validFrom: string;
  status: string;
  stopName: string;
  routeName: string;
  vehicleRegistrationNo: string | null;
  driverName: string | null;
}

export interface RouteAssignedStudentRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  admissionNo: string;
  routeStopId: string;
  stopName: string;
  direction: string;
  feeSlab: string | null;
  validFrom: string;
  status: string;
}

const COLUMNS = `id, student_id AS "studentId", route_stop_id AS "routeStopId",
  academic_year_id AS "academicYearId", direction, fee_slab AS "feeSlab",
  valid_from AS "validFrom", valid_to AS "validTo", status`;

@Injectable()
export class StudentTransportAllocationRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: StudentTransportAllocationFilter,
    executor: Queryable = this.postgres,
  ): Promise<StudentTransportAllocationRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.studentId) {
      params.push(filter.studentId);
      conditions.push(`student_id = $${params.length}`);
    }
    if (filter.academicYearId) {
      params.push(filter.academicYearId);
      conditions.push(`academic_year_id = $${params.length}`);
    }
    if (filter.routeStopId) {
      params.push(filter.routeStopId);
      conditions.push(`route_stop_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<StudentTransportAllocationRow>(
      `SELECT ${COLUMNS} FROM student_transport_allocation ${where} ORDER BY valid_from DESC`,
      params,
    );
    return rows;
  }

  /** One clean row per active-or-recent allocation, resolving the stop/route name
   * and whichever vehicle+driver currently serves that route (if any assignment is
   * in effect) -- built for the student profile's Transport section, so it never
   * needs its own N+1 lookups on the frontend. */
  async findSummaryForStudent(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentTransportSummaryRow[]> {
    const { rows } = await executor.query<StudentTransportSummaryRow>(
      `SELECT sta.id, sta.direction, sta.fee_slab AS "feeSlab", sta.valid_from AS "validFrom",
              sta.status, rs.stop_name AS "stopName", r.name AS "routeName",
              v.registration_no AS "vehicleRegistrationNo", d.full_name AS "driverName"
       FROM student_transport_allocation sta
       JOIN route_stop rs ON rs.id = sta.route_stop_id
       JOIN route r ON r.id = rs.route_id
       LEFT JOIN vehicle_route_assignment vra ON vra.route_id = r.id
         AND vra.effective_from <= CURRENT_DATE
         AND (vra.effective_to IS NULL OR vra.effective_to >= CURRENT_DATE)
       LEFT JOIN vehicle v ON v.id = vra.vehicle_id
       LEFT JOIN driver d ON d.id = vra.driver_id
       WHERE sta.student_id = $1
       ORDER BY sta.status = 'ACTIVE' DESC, sta.valid_from DESC`,
      [studentId],
    );
    return rows;
  }

  /** One row per student currently (or recently) riding a given route -- backs the
   * Route detail page's "Assigned students" list, so it never needs its own N+1
   * lookups on the frontend. Mirrors findSummaryForStudent's shape/intent, just
   * from the other direction. */
  async findAssignedForRoute(
    routeId: string,
    executor: Queryable = this.postgres,
  ): Promise<RouteAssignedStudentRow[]> {
    const { rows } = await executor.query<RouteAssignedStudentRow>(
      `SELECT sta.id, sta.student_id AS "studentId", p.first_name AS "studentFirstName",
              p.last_name AS "studentLastName", s.admission_no AS "admissionNo",
              sta.route_stop_id AS "routeStopId", rs.stop_name AS "stopName",
              sta.direction, sta.fee_slab AS "feeSlab", sta.valid_from AS "validFrom", sta.status
       FROM student_transport_allocation sta
       JOIN route_stop rs ON rs.id = sta.route_stop_id
       JOIN student s ON s.id = sta.student_id
       JOIN person p ON p.id = s.person_id
       WHERE rs.route_id = $1
       ORDER BY sta.status = 'ACTIVE' DESC, rs.sequence_no, p.first_name, p.last_name`,
      [routeId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentTransportAllocationRow | null> {
    const { rows } = await executor.query<StudentTransportAllocationRow>(
      `SELECT ${COLUMNS} FROM student_transport_allocation WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateStudentTransportAllocationInput,
    executor: Queryable = this.postgres,
  ): Promise<StudentTransportAllocationRow> {
    const params: unknown[] = [
      input.studentId,
      input.routeStopId,
      input.academicYearId,
      input.direction,
      input.feeSlab ?? null,
    ];
    const validFromClause = input.validFrom
      ? `$${params.length + 1}`
      : 'CURRENT_DATE';
    if (input.validFrom) params.push(input.validFrom);

    const { rows } = await executor.query<StudentTransportAllocationRow>(
      `INSERT INTO student_transport_allocation
         (student_id, route_stop_id, academic_year_id, direction, fee_slab, valid_from)
       VALUES ($1, $2, $3, $4, $5, ${validFromClause})
       RETURNING ${COLUMNS}`,
      params,
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateStudentTransportAllocationInput,
    executor: Queryable = this.postgres,
  ): Promise<StudentTransportAllocationRow | null> {
    const { rows } = await executor.query<StudentTransportAllocationRow>(
      `UPDATE student_transport_allocation SET
         route_stop_id = COALESCE($2, route_stop_id),
         direction = COALESCE($3, direction),
         fee_slab = COALESCE($4, fee_slab),
         valid_to = COALESCE($5, valid_to)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.routeStopId ?? null,
        input.direction ?? null,
        input.feeSlab ?? null,
        input.validTo ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async cancel(
    id: string,
    validTo: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentTransportAllocationRow | null> {
    const { rows } = await executor.query<StudentTransportAllocationRow>(
      `UPDATE student_transport_allocation SET status = 'CANCELLED', valid_to = $2
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, validTo],
    );
    return rows[0] ?? null;
  }
}

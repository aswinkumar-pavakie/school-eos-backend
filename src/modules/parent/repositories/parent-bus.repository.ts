// Real transport tables (student_transport_allocation -> route_stop -> route
// -> vehicle_route_assignment -> vehicle/driver/attendant), same tables
// Faculty's own StaffBusRepository reads (see
// ../../faculty/repositories/staff-bus.repository.ts), just scoped by student
// allocation instead of staff driver/attendant duty. Display only -- no GPS
// live location, matching the user's own explicit instruction.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface StudentBusAllocation {
  direction: string;
  stopName: string;
  scheduledTime: string | null;
  routeId: string;
  routeName: string;
  routeCode: string | null;
  vehicleId: string | null;
  registrationNo: string | null;
  model: string | null;
  driverName: string | null;
  driverPhone: string | null;
  attendantName: string | null;
  attendantPhone: string | null;
  stops: { stopName: string; sequenceNo: number; scheduledTime: string | null }[];
}

@Injectable()
export class ParentBusRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findAllocationForStudent(studentId: string, executor: Queryable = this.postgres): Promise<StudentBusAllocation | null> {
    const { rows } = await executor.query(
      `SELECT sta.direction, rs.stop_name, rs.scheduled_time, r.id AS route_id, r.name AS route_name, r.code AS route_code
       FROM student_transport_allocation sta
       JOIN route_stop rs ON rs.id = sta.route_stop_id
       JOIN route r ON r.id = rs.route_id
       WHERE sta.student_id = $1 AND sta.status = 'ACTIVE'
         AND sta.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       LIMIT 1`,
      [studentId],
    );
    if (!rows.length) return null;
    const alloc = rows[0];

    const { rows: vraRows } = await executor.query(
      `SELECT v.id AS vehicle_id, v.registration_no, v.model,
              (d.full_name) AS driver_name, d.phone AS driver_phone,
              (a.full_name) AS attendant_name, a.phone AS attendant_phone
       FROM vehicle_route_assignment vra
       JOIN vehicle v ON v.id = vra.vehicle_id
       LEFT JOIN driver d ON d.id = vra.driver_id
       LEFT JOIN attendant a ON a.id = vra.attendant_id
       WHERE vra.route_id = $1
         AND vra.effective_from <= CURRENT_DATE AND (vra.effective_to IS NULL OR vra.effective_to >= CURRENT_DATE)
       ORDER BY vra.effective_from DESC
       LIMIT 1`,
      [alloc.route_id],
    );

    const { rows: stopRows } = await executor.query(
      `SELECT stop_name, sequence_no, scheduled_time FROM route_stop WHERE route_id = $1 ORDER BY sequence_no`,
      [alloc.route_id],
    );

    const vra = vraRows[0];
    return {
      direction: alloc.direction,
      stopName: alloc.stop_name,
      scheduledTime: alloc.scheduled_time,
      routeId: alloc.route_id,
      routeName: alloc.route_name,
      routeCode: alloc.route_code,
      vehicleId: vra?.vehicle_id ?? null,
      registrationNo: vra?.registration_no ?? null,
      model: vra?.model ?? null,
      driverName: vra?.driver_name ?? null,
      driverPhone: vra?.driver_phone ?? null,
      attendantName: vra?.attendant_name ?? null,
      attendantPhone: vra?.attendant_phone ?? null,
      stops: stopRows.map((s: any) => ({ stopName: s.stop_name, sequenceNo: s.sequence_no, scheduledTime: s.scheduled_time })),
    };
  }
}

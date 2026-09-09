// Real transport tables (vehicle/route/route_stop/vehicle_route_assignment,
// already seeded) -- both `driver` and `attendant` carry their own
// person_id, so a real Faculty person CAN also hold one of those real
// records (a duty on top of teaching, same person). No new schema needed;
// this only reads. Display only -- no GPS/live location, matching the
// user's own explicit instruction.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StaffBusAssignment {
  role: 'DRIVER' | 'ATTENDANT';
  vehicleId: string;
  registrationNo: string;
  model: string | null;
  capacity: number;
  routeId: string;
  routeName: string;
  routeCode: string | null;
  direction: string;
  stops: {
    stopName: string;
    sequenceNo: number;
    scheduledTime: string | null;
  }[];
}

@Injectable()
export class StaffBusRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Whichever real, currently-effective vehicle_route_assignment has this
   * person as its driver or attendant -- null (an honest "not assigned",
   * never fabricated) if neither table has a row for them, or nothing is
   * currently effective. */
  async findAssignmentForPerson(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<StaffBusAssignment | null> {
    const { rows } = await executor.query(
      `SELECT
         CASE WHEN d.id IS NOT NULL THEN 'DRIVER' ELSE 'ATTENDANT' END AS role,
         v.id AS vehicle_id, v.registration_no, v.model, v.capacity,
         r.id AS route_id, r.name AS route_name, r.code AS route_code, r.direction
       FROM vehicle_route_assignment vra
       JOIN vehicle v ON v.id = vra.vehicle_id
       JOIN route r ON r.id = vra.route_id
       LEFT JOIN driver d ON d.id = vra.driver_id AND d.person_id = $1
       LEFT JOIN attendant a ON a.id = vra.attendant_id AND a.person_id = $1
       WHERE (d.id IS NOT NULL OR a.id IS NOT NULL)
         AND vra.effective_from <= CURRENT_DATE AND (vra.effective_to IS NULL OR vra.effective_to >= CURRENT_DATE)
       ORDER BY vra.effective_from DESC
       LIMIT 1`,
      [personId],
    );
    if (!rows.length) return null;
    const row = rows[0];
    const { rows: stopRows } = await executor.query(
      `SELECT stop_name, sequence_no, scheduled_time FROM route_stop WHERE route_id = $1 ORDER BY sequence_no`,
      [row.route_id],
    );
    return {
      role: row.role,
      vehicleId: row.vehicle_id,
      registrationNo: row.registration_no,
      model: row.model,
      capacity: row.capacity,
      routeId: row.route_id,
      routeName: row.route_name,
      routeCode: row.route_code,
      direction: row.direction,
      stops: stopRows.map((s: any) => ({
        stopName: s.stop_name,
        sequenceNo: s.sequence_no,
        scheduledTime: s.scheduled_time,
      })),
    };
  }
}

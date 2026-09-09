// Resolves the two real scoping facts every Hostel request feature needs:
// "which hostel(s) does this warden run" (hostel.warden_staff_id) and "which
// hostel is this student currently boarding in" (their own ACTIVE
// hostel_allocation, resolved through the real bed->room->floor->block->hostel
// chain -- same chain HostelAllocationRepository already joins through for
// the Admin-only room-allocation board).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

@Injectable()
export class HostelScopeRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getStaffId(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query(
      `SELECT id FROM staff WHERE person_id = $1 AND status = 'ACTIVE'`,
      [personId],
    );
    return rows.length ? rows[0].id : null;
  }

  /** Every hostel this staff member is the assigned warden of. */
  async getWardenHostelIds(
    staffId: string,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const { rows } = await executor.query(
      `SELECT id FROM hostel WHERE warden_staff_id = $1 AND status = 'ACTIVE'`,
      [staffId],
    );
    return rows.map((r: any) => r.id);
  }

  /** The student's own currently-ACTIVE hostel_allocation, resolved to the
   * real hostel they're boarding in -- null (an honest "not a boarder right
   * now") if none exists. */
  async getActiveHostelForStudent(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ allocationId: string; hostelId: string } | null> {
    const { rows } = await executor.query(
      `SELECT a.id AS allocation_id, h.id AS hostel_id
       FROM hostel_allocation a
       JOIN hostel_bed bed ON bed.id = a.bed_id
       JOIN hostel_room r ON r.id = bed.room_id
       JOIN hostel_floor f ON f.id = r.floor_id
       JOIN hostel_block bl ON bl.id = f.block_id
       JOIN hostel h ON h.id = bl.hostel_id
       WHERE a.student_id = $1 AND a.status = 'ACTIVE'
       LIMIT 1`,
      [studentId],
    );
    return rows.length
      ? { allocationId: rows[0].allocation_id, hostelId: rows[0].hostel_id }
      : null;
  }
}

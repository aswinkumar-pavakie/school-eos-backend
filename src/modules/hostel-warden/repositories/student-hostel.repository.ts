// Shared "which hostel is this student currently allocated to" derivation --
// hostel_visitor, outing_request, and hostel_call_request all key off student_id
// alone (no hostel_id column of their own), so every feature that needs to check
// "does this student belong to one of the Warden's hostels" walks the same
// hostel_allocation -> hostel_bed -> hostel_room -> hostel_floor -> hostel_block
// -> hostel chain, exactly like HostelAllocationRepository/HostelBedRepository
// already do in the Admin-side hostel module.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

@Injectable()
export class StudentHostelRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** The hostel this student is currently (ACTIVE allocation) living in, if it's one
   * of the given hostelIds -- null otherwise (no active allocation at all, or it's in
   * a different hostel the caller has no business touching). */
  async findActiveHostelIdForStudent(
    studentId: string,
    hostelIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query<{ hostelId: string }>(
      `SELECT bl.hostel_id AS "hostelId"
       FROM hostel_allocation a
       JOIN hostel_bed bed ON bed.id = a.bed_id
       JOIN hostel_room r ON r.id = bed.room_id
       JOIN hostel_floor f ON f.id = r.floor_id
       JOIN hostel_block bl ON bl.id = f.block_id
       WHERE a.student_id = $1 AND a.status = 'ACTIVE' AND bl.hostel_id = ANY($2)
       LIMIT 1`,
      [studentId, hostelIds],
    );
    return rows[0]?.hostelId ?? null;
  }

  /** The hostel this student is currently (ACTIVE allocation) living in, with no
   * restriction to any particular caller's hostel set -- used by the Parent-initiated
   * request flows (Gate Pass / Emergency Exit / Call Request) to derive which hostel
   * (and therefore which Warden) a brand-new request belongs to. Null if the student
   * has no ACTIVE hostel_allocation at all (not a boarder, or no bed currently
   * assigned) -- callers should reject the request in that case rather than create
   * an unroutable one. */
  async findCurrentHostelIdForStudent(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query<{ hostelId: string }>(
      `SELECT bl.hostel_id AS "hostelId"
       FROM hostel_allocation a
       JOIN hostel_bed bed ON bed.id = a.bed_id
       JOIN hostel_room r ON r.id = bed.room_id
       JOIN hostel_floor f ON f.id = r.floor_id
       JOIN hostel_block bl ON bl.id = f.block_id
       WHERE a.student_id = $1 AND a.status = 'ACTIVE'
       LIMIT 1`,
      [studentId],
    );
    return rows[0]?.hostelId ?? null;
  }
}

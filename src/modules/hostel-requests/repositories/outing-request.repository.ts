// outing_request is a REAL, ALREADY-EXISTING table (confirmed via
// prisma/schema.prisma) -- it already backs both Gate Pass and Emergency
// Exit conceptually, just without a column to tell them apart yet; that's
// the one thing database/migrations/0012_hostel_outing_call_requests.sql
// actually ALTERs onto it (request_type + decided_by/decided_at/decision_note),
// not run yet. Row shape matches src/lib/hostel-warden-api.ts's own
// OutingRequestRow exactly (school-eos-mobile, already built against this
// shape). The table's own real `requested_at` column is what "requestedAt"
// maps to (there is no created_at on this table). approvalRequestId is
// always null here -- decisions go through this feature's own bespoke
// approve/reject routes and this migration's own new columns, never the
// generic approval_request engine the real column of the same name points
// at (that FK is left unused by this feature, same as the real, separate
// gate_pass table this migration also never touches).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export type OutingRequestType = 'GATE_PASS' | 'EMERGENCY_EXIT';

export interface OutingRequestRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  requestedBy: string | null;
  requestedAt: string;
  outFrom: string;
  expectedReturn: string;
  isOvernight: boolean;
  reason: string;
  destination: string | null;
  approvalRequestId: string | null;
  state: string;
  requestType: string | null;
}

function mapRow(row: any): OutingRequestRow {
  return {
    id: row.id,
    studentId: row.student_id,
    studentFirstName: row.first_name,
    studentLastName: row.last_name,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    outFrom: row.out_from,
    expectedReturn: row.expected_return,
    isOvernight: row.is_overnight,
    reason: row.reason,
    destination: row.destination,
    approvalRequestId: null,
    state: row.state,
    requestType: row.request_type,
  };
}

const COLUMNS = `o.id, o.student_id, o.requested_by, o.out_from, o.expected_return, o.is_overnight,
  o.reason, o.destination, o.state, o.request_type, o.requested_at,
  p.first_name, p.last_name`;
const FROM = `outing_request o
  JOIN student s ON s.id = o.student_id
  JOIN person p ON p.id = s.person_id`;

@Injectable()
export class OutingRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** The hostel warden's own inbox for one request type, scoped to whichever
   * hostel(s) they run -- resolved via each request's student's own CURRENT
   * hostel_allocation (a student who has since moved hostels or checked out
   * no longer surfaces in a warden's list who isn't theirs any more). */
  async findForWardenHostels(hostelIds: string[], requestType: OutingRequestType, executor: Queryable = this.postgres): Promise<OutingRequestRow[]> {
    if (hostelIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} FROM ${FROM}
       WHERE o.request_type = $1
         AND EXISTS (
           SELECT 1 FROM hostel_allocation a
           JOIN hostel_bed bed ON bed.id = a.bed_id
           JOIN hostel_room r ON r.id = bed.room_id
           JOIN hostel_floor f ON f.id = r.floor_id
           JOIN hostel_block bl ON bl.id = f.block_id
           WHERE a.student_id = o.student_id AND a.status = 'ACTIVE' AND bl.hostel_id = ANY($2)
         )
       ORDER BY o.requested_at DESC`,
      [requestType, hostelIds],
    );
    return rows.map(mapRow);
  }

  async findById(id: string, requestType: OutingRequestType, executor: Queryable = this.postgres): Promise<OutingRequestRow | null> {
    const { rows } = await executor.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE o.id = $1 AND o.request_type = $2`, [id, requestType]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByStudent(studentId: string, requestType: OutingRequestType, executor: Queryable = this.postgres): Promise<OutingRequestRow[]> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE o.student_id = $1 AND o.request_type = $2 ORDER BY o.requested_at DESC`,
      [studentId, requestType],
    );
    return rows.map(mapRow);
  }

  /** Every request this parent has themselves raised (across every one of
   * their linked children) -- school-eos-mobile's own listMyGatePassRequests()
   * takes no studentId at all, so this is "my own requests", not scoped to
   * whichever child happens to be selected in the app right now. */
  async findByRequestedBy(personId: string, requestType: OutingRequestType, executor: Queryable = this.postgres): Promise<OutingRequestRow[]> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE o.requested_by = $1 AND o.request_type = $2 ORDER BY o.requested_at DESC`,
      [personId, requestType],
    );
    return rows.map(mapRow);
  }

  async create(
    input: {
      studentId: string;
      requestedBy: string;
      requestType: OutingRequestType;
      outFrom: string;
      expectedReturn: string;
      isOvernight: boolean;
      reason: string;
      destination: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO outing_request (student_id, requested_by, request_type, out_from, expected_return, is_overnight, reason, destination)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        input.studentId,
        input.requestedBy,
        input.requestType,
        input.outFrom,
        input.expectedReturn,
        input.isOvernight,
        input.reason,
        input.destination,
      ],
    );
    return rows[0].id;
  }

  async decide(id: string, state: 'APPROVED' | 'REJECTED', decidedBy: string, note: string | null, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(
      `UPDATE outing_request SET state = $2, decided_by = $3, decision_note = $4, decided_at = now()
       WHERE id = $1 AND state = 'REQUESTED'`,
      [id, state, decidedBy, note],
    );
  }
}

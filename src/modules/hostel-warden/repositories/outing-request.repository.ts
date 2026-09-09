// Backs BOTH Gate Pass and Emergency Exit -- the real, live `outing_request` table
// already has exactly the shape both features need (student_id, requested_by, reason,
// out_from, expected_return, approval_request_id -> the generic approvals engine,
// state), and was already completely unused. The two features are distinguished
// purely at the domain/API layer: the `approval_request.request_type` string this
// request's linked approval_request carries is either 'HOSTEL_GATE_PASS_REQUEST' or
// 'HOSTEL_EMERGENCY_EXIT_REQUEST' -- see hostel-warden-approval-handlers.service.ts.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export const GATE_PASS_REQUEST_TYPE = 'HOSTEL_GATE_PASS_REQUEST';
export const EMERGENCY_EXIT_REQUEST_TYPE = 'HOSTEL_EMERGENCY_EXIT_REQUEST';

export interface OutingRequestRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  requestedBy: string | null;
  requestedAt: Date;
  outFrom: Date;
  expectedReturn: Date;
  isOvernight: boolean;
  reason: string;
  destination: string | null;
  approvalRequestId: string | null;
  state: string;
  requestType: string | null;
}

export interface CreateOutingRequestInput {
  studentId: string;
  requestedBy: string;
  outFrom: Date;
  expectedReturn: Date;
  isOvernight?: boolean;
  reason: string;
  destination?: string | null;
}

const COLUMNS = `outr.id, outr.student_id AS "studentId", p.first_name AS "studentFirstName",
  p.last_name AS "studentLastName", outr.requested_by AS "requestedBy",
  outr.requested_at AS "requestedAt", outr.out_from AS "outFrom",
  outr.expected_return AS "expectedReturn", outr.is_overnight AS "isOvernight",
  outr.reason, outr.destination, outr.approval_request_id AS "approvalRequestId",
  outr.state, ar.request_type AS "requestType"`;

const FROM = `outing_request outr
  JOIN student s ON s.id = outr.student_id
  JOIN person p ON p.id = s.person_id
  LEFT JOIN approval_request ar ON ar.id = outr.approval_request_id`;

@Injectable()
export class OutingRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: CreateOutingRequestInput,
    executor: Queryable,
  ): Promise<OutingRequestRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO outing_request (student_id, requested_by, out_from, expected_return, is_overnight, reason, destination)
       VALUES ($1, $2, $3, $4, COALESCE($5, false), $6, $7)
       RETURNING id`,
      [
        input.studentId,
        input.requestedBy,
        input.outFrom,
        input.expectedReturn,
        input.isOvernight ?? null,
        input.reason,
        input.destination ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async attachApprovalRequest(
    id: string,
    approvalRequestId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE outing_request SET approval_request_id = $2 WHERE id = $1`,
      [id, approvalRequestId],
    );
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<OutingRequestRow | null> {
    const { rows } = await executor.query<OutingRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE outr.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByApprovalRequestId(
    approvalRequestId: string,
    executor: Queryable = this.postgres,
  ): Promise<OutingRequestRow | null> {
    const { rows } = await executor.query<OutingRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE outr.approval_request_id = $1`,
      [approvalRequestId],
    );
    return rows[0] ?? null;
  }

  /** Every outing_request of the given type for a student currently allocated to one of
   * the Warden's hostels -- scoped via the same hostel_allocation join used everywhere
   * else in this module, since outing_request itself carries no hostel_id. */
  async findManyForHostels(
    hostelIds: string[],
    requestType: string,
    executor: Queryable = this.postgres,
  ): Promise<OutingRequestRow[]> {
    const { rows } = await executor.query<OutingRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM}
       JOIN hostel_allocation a ON a.student_id = outr.student_id AND a.status = 'ACTIVE'
       JOIN hostel_bed bed ON bed.id = a.bed_id
       JOIN hostel_room r ON r.id = bed.room_id
       JOIN hostel_floor f ON f.id = r.floor_id
       JOIN hostel_block bl ON bl.id = f.block_id
       WHERE bl.hostel_id = ANY($1) AND ar.request_type = $2
       ORDER BY outr.requested_at DESC`,
      [hostelIds, requestType],
    );
    return rows;
  }

  /** A parent's own request history for one request type -- scoped by requestedBy,
   * not hostel (the parent-side equivalent of findManyForHostels). */
  async findManyForRequester(
    requestedBy: string,
    requestType: string,
    executor: Queryable = this.postgres,
  ): Promise<OutingRequestRow[]> {
    const { rows } = await executor.query<OutingRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM}
       WHERE outr.requested_by = $1 AND ar.request_type = $2
       ORDER BY outr.requested_at DESC`,
      [requestedBy, requestType],
    );
    return rows;
  }

  async markState(
    id: string,
    state: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(`UPDATE outing_request SET state = $2 WHERE id = $1`, [
      id,
      state,
    ]);
  }
}

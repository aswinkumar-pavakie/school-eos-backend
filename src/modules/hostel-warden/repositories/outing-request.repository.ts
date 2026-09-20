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

// Real, distinct CHECK constraint values (see migration
// 0021_outing_request_movement_log_fields.sql) -- only ever set on a
// Warden-authored Movement Log entry (createDirect below), never on a
// parent-app-submitted Gate Pass/Emergency Exit request, so
// `purpose_category IS NOT NULL` is the real, non-fabricated discriminator
// findDirectEntriesForHostels filters on.
export const MOVEMENT_LOG_PURPOSES = [
  'HOME_LEAVE',
  'LOCAL_OUTING',
  'MEDICAL',
  'SCHOOL_EVENT',
  'OTHER',
] as const;
export type MovementLogPurpose = (typeof MOVEMENT_LOG_PURPOSES)[number];

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
  decidedAt: Date | null;
  calledByName: string | null;
  calledByPhone: string | null;
  purposeCategory: MovementLogPurpose | null;
  actualReturnAt: Date | null;
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

export interface CreateDirectMovementLogInput {
  studentId: string;
  recordedByPersonId: string;
  outFrom: Date;
  expectedReturn: Date;
  isOvernight?: boolean;
  reason: string;
  purposeCategory: MovementLogPurpose;
  calledByName: string;
  calledByPhone: string;
}

const COLUMNS = `outr.id, outr.student_id AS "studentId", p.first_name AS "studentFirstName",
  p.last_name AS "studentLastName", outr.requested_by AS "requestedBy",
  outr.requested_at AS "requestedAt", outr.out_from AS "outFrom",
  outr.expected_return AS "expectedReturn", outr.is_overnight AS "isOvernight",
  outr.reason, outr.destination, outr.approval_request_id AS "approvalRequestId",
  outr.state, ar.request_type AS "requestType", ar.decided_at AS "decidedAt",
  outr.called_by_name AS "calledByName", outr.called_by_phone AS "calledByPhone",
  outr.purpose_category AS "purposeCategory", outr.actual_return_at AS "actualReturnAt"`;

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

  /** School-wide, not hostel-scoped -- backs Principal/Vice Principal/Admin's real
   * Hostel "Out of the hostel now" KPI + "Students out of the hostel" list
   * (design-reframe addition), covering both Gate Pass and Emergency Exit as one
   * "out of hostel" concept, same as the mockup does. The real outing_request state
   * machine has no explicit "returned" flag -- "still out" vs "overdue" is inferred
   * purely from out_from/expected_return against now(), so the window is capped to
   * expected_return >= now() - 7 days to keep a long-forgotten APPROVED test row from
   * showing as "overdue" forever. */
  async findActiveOversight(
    executor: Queryable = this.postgres,
  ): Promise<OutingRequestRow[]> {
    const { rows } = await executor.query<OutingRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM}
       WHERE outr.state = 'APPROVED'
         AND ar.request_type IN ($1, $2)
         AND outr.out_from <= now()
         AND outr.expected_return >= now() - interval '7 days'
       ORDER BY outr.expected_return ASC`,
      [GATE_PASS_REQUEST_TYPE, EMERGENCY_EXIT_REQUEST_TYPE],
    );
    return rows;
  }

  /** School-wide, not hostel-scoped -- backs Principal/Vice Principal/Admin's real
   * Hostel "Gate log" card (design-reframe addition). The real schema has no separate
   * gate-event log table (no distinct check-in/checked-out timestamp rows) -- this
   * surfaces the real, live decision each Gate Pass/Emergency Exit request already
   * carries via its approval_request (decided_at -- outing_request's OWN decided_at
   * column is never written by ApprovalsService, verified live; approval_request's is),
   * which is the closest honest real substitute for an exit/entry feed. */
  async findRecentDecisions(
    limit: number,
    executor: Queryable = this.postgres,
  ): Promise<OutingRequestRow[]> {
    const { rows } = await executor.query<OutingRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM}
       WHERE ar.decided_at IS NOT NULL
         AND ar.request_type IN ($1, $2)
       ORDER BY ar.decided_at DESC
       LIMIT $3`,
      [GATE_PASS_REQUEST_TYPE, EMERGENCY_EXIT_REQUEST_TYPE, limit],
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

  /** Warden-authored Movement Log entry -- the design's own "Record an
   * exit" form: the Warden takes the parent's call and logs the exit
   * directly, with no separate approval step (they ARE the authority
   * making the call in real life). No approval_request row at all --
   * state is set straight to APPROVED, decided_by/decided_at point at the
   * Warden themself, matching what an instantly-self-decided record
   * actually means. */
  async createDirect(
    input: CreateDirectMovementLogInput,
    executor: Queryable,
  ): Promise<OutingRequestRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO outing_request (
         student_id, requested_by, out_from, expected_return, is_overnight,
         reason, state, decided_by, decided_at, called_by_name, called_by_phone,
         purpose_category
       )
       VALUES ($1, $2, $3, $4, COALESCE($5, false), $6, 'APPROVED', $2, now(), $7, $8, $9)
       RETURNING id`,
      [
        input.studentId,
        input.recordedByPersonId,
        input.outFrom,
        input.expectedReturn,
        input.isOvernight ?? null,
        input.reason,
        input.calledByName,
        input.calledByPhone,
        input.purposeCategory,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  /** Every Warden-authored direct Movement Log entry for the Warden's own
   * hostel(s) -- same hostel-scoping join as findManyForHostels, but no
   * approval_request join is meaningful here (there isn't one), so this
   * discriminates on purpose_category instead (see MOVEMENT_LOG_PURPOSES'
   * own comment: only ever set on a direct entry). */
  async findDirectEntriesForHostels(
    hostelIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<OutingRequestRow[]> {
    const { rows } = await executor.query<OutingRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM}
       JOIN hostel_allocation a ON a.student_id = outr.student_id AND a.status = 'ACTIVE'
       JOIN hostel_bed bed ON bed.id = a.bed_id
       JOIN hostel_room r ON r.id = bed.room_id
       JOIN hostel_floor f ON f.id = r.floor_id
       JOIN hostel_block bl ON bl.id = f.block_id
       WHERE bl.hostel_id = ANY($1) AND outr.purpose_category IS NOT NULL
       ORDER BY outr.out_from DESC`,
      [hostelIds],
    );
    return rows;
  }

  /** Records the real moment a Warden-logged exit actually returned --
   * the "Record return" action. Only ever meaningful for a direct entry
   * (purpose_category IS NOT NULL); enforced by the service layer's own
   * ownership check, not here. */
  async recordReturn(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE outing_request SET actual_return_at = now() WHERE id = $1`,
      [id],
    );
  }

  /** "Amend" -- lets the Warden correct their own direct entry (expected
   * return time, or the reason/purpose they logged) before or after the
   * student returns. Never touches student_id/out_from/who-recorded-it. */
  async amendDirect(
    id: string,
    patch: { expectedReturn?: Date; reason?: string; calledByName?: string; calledByPhone?: string },
    executor: Queryable,
  ): Promise<OutingRequestRow> {
    await executor.query(
      `UPDATE outing_request SET
         expected_return = COALESCE($2, expected_return),
         reason = COALESCE($3, reason),
         called_by_name = COALESCE($4, called_by_name),
         called_by_phone = COALESCE($5, called_by_phone)
       WHERE id = $1`,
      [id, patch.expectedReturn ?? null, patch.reason ?? null, patch.calledByName ?? null, patch.calledByPhone ?? null],
    );
    return (await this.findById(id, executor))!;
  }
}

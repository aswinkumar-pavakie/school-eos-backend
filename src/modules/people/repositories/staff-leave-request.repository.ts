import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

// The real, already-live staff_leave_request table -- this repository (and
// the rest of this feature's application layer) was missing from the
// current codebase despite the table already holding real, correctly-
// decided historical rows (verified live: existing PENDING/APPROVED/
// REJECTED rows already correctly cross-referenced to their own real
// approval_request rows via subject_object_type='staff_leave_request'). No
// migration was needed -- restoring the missing controller/service/handler
// layer over this already-real, already-populated table and its already-
// configured STAFF_LEAVE_REQUEST approval_policy (single step, PRINCIPAL).
export interface StaffLeaveRequestRow {
  id: string;
  staffId: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
  attachmentObjectKey: string | null;
  attachmentFileName: string | null;
  state: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  approvalRequestId: string | null;
  approvalState: string | null;
}

export interface CreateStaffLeaveInput {
  staffId: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
}

const COLUMNS = `slr.id, slr.staff_id AS "staffId", slr.leave_type AS "leaveType",
  slr.from_date AS "fromDate", slr.to_date AS "toDate", slr.reason,
  slr.attachment_object_key AS "attachmentObjectKey", slr.attachment_file_name AS "attachmentFileName",
  slr.state, slr.decided_by AS "decidedBy", slr.decided_at AS "decidedAt",
  slr.created_at AS "createdAt", slr.updated_at AS "updatedAt",
  ar.id AS "approvalRequestId", ar.state AS "approvalState"`;

const FROM_JOIN = `staff_leave_request slr
  LEFT JOIN approval_request ar
    ON ar.subject_object_type = 'staff_leave_request' AND ar.subject_object_id = slr.id::text`;

@Injectable()
export class StaffLeaveRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** The real, current approval status -- prefers the approval_request's own
   * state (which includes CANCELLED, a state staff_leave_request.state's own
   * CHECK constraint doesn't have room for) over the leave row's own stale
   * PENDING after a withdrawal. */
  async findByStaffId(staffId: string, executor: Queryable = this.postgres): Promise<StaffLeaveRequestRow[]> {
    const { rows } = await executor.query<StaffLeaveRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM_JOIN} WHERE slr.staff_id = $1 ORDER BY slr.created_at DESC`,
      [staffId],
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<StaffLeaveRequestRow | null> {
    const { rows } = await executor.query<StaffLeaveRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM_JOIN} WHERE slr.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(input: CreateStaffLeaveInput, executor: Queryable = this.postgres): Promise<{ id: string }> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO staff_leave_request (staff_id, leave_type, from_date, to_date, reason, state)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')
       RETURNING id`,
      [input.staffId, input.leaveType, input.fromDate, input.toDate, input.reason],
    );
    return rows[0];
  }
}

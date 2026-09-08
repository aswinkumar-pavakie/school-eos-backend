// staff_leave_request -- Faculty's own leave/on-duty request. OD is modeled
// as leave_type='ON_DUTY' on this same table (one real, already-seeded
// STAFF_LEAVE_REQUEST approval_policy row covers both -- PRINCIPAL, single
// step, no separate OD policy exists to justify a second table). Creating a
// request is the Faculty's own real action here (unlike student leave, this
// is not a Parent-app concern) -- deciding still happens through the
// existing generic /approvals/:id/approve|reject endpoints.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

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
  approvalRequestId: string | null;
}

const COLUMNS = `slr.id, slr.staff_id, slr.leave_type, slr.from_date, slr.to_date, slr.reason,
  slr.attachment_object_key, slr.attachment_file_name, slr.state, slr.decided_by, slr.decided_at, slr.created_at,
  ar.id AS approval_request_id`;

const FROM = `
  FROM staff_leave_request slr
  LEFT JOIN approval_request ar ON ar.subject_object_type = 'staff_leave_request' AND ar.subject_object_id = slr.id::text`;

function mapRow(row: any): StaffLeaveRequestRow {
  return {
    id: row.id,
    staffId: row.staff_id,
    leaveType: row.leave_type,
    fromDate: row.from_date,
    toDate: row.to_date,
    reason: row.reason,
    attachmentObjectKey: row.attachment_object_key,
    attachmentFileName: row.attachment_file_name,
    state: row.state,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    approvalRequestId: row.approval_request_id,
  };
}

@Injectable()
export class StaffLeaveRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByStaffId(staffId: string, executor: Queryable = this.postgres): Promise<StaffLeaveRequestRow[]> {
    const { rows } = await executor.query(`SELECT ${COLUMNS} ${FROM} WHERE slr.staff_id = $1 ORDER BY slr.created_at DESC`, [staffId]);
    return rows.map(mapRow);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<StaffLeaveRequestRow | null> {
    const { rows } = await executor.query(`SELECT ${COLUMNS} ${FROM} WHERE slr.id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async create(
    input: {
      staffId: string;
      leaveType: string;
      fromDate: string;
      toDate: string;
      reason: string;
      attachmentObjectKey: string | null;
      attachmentFileName: string | null;
    },
    executor: Queryable,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO staff_leave_request (staff_id, leave_type, from_date, to_date, reason, attachment_object_key, attachment_file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.staffId, input.leaveType, input.fromDate, input.toDate, input.reason, input.attachmentObjectKey, input.attachmentFileName],
    );
    return rows[0].id;
  }

  async setDecision(id: string, state: 'APPROVED' | 'REJECTED', decidedBy: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE staff_leave_request SET state = $2, decided_by = $3, decided_at = now(), updated_at = now() WHERE id = $1`,
      [id, state, decidedBy],
    );
  }
}

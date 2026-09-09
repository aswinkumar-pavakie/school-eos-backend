// staff_hr_request -- a Faculty member's own HR query (salary query, PF/ESI,
// income-tax declaration, increment/arrears, bank account change, service
// certificate). Two-step approval (Principal, then Finance -- both already
// seeded in approval_policy) via the generic engine; onApproved only ever
// fires once Finance's own final step decides, matching the user's own
// requirement that the request only becomes visible/actionable after Finance
// approval, not Principal's first step alone.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface StaffHrRequestRow {
  id: string;
  staffId: string;
  category: string;
  subject: string;
  description: string | null;
  attachmentObjectKey: string | null;
  attachmentFileName: string | null;
  state: string;
  approvalRequestId: string | null;
  createdAt: Date;
}

const COLUMNS = `id, staff_id, category, subject, description, attachment_object_key, attachment_file_name,
  state, approval_request_id, created_at`;

function mapRow(row: any): StaffHrRequestRow {
  return {
    id: row.id,
    staffId: row.staff_id,
    category: row.category,
    subject: row.subject,
    description: row.description,
    attachmentObjectKey: row.attachment_object_key,
    attachmentFileName: row.attachment_file_name,
    state: row.state,
    approvalRequestId: row.approval_request_id,
    createdAt: row.created_at,
  };
}

@Injectable()
export class StaffHrRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByStaffId(staffId: string, executor: Queryable = this.postgres): Promise<StaffHrRequestRow[]> {
    const { rows } = await executor.query(`SELECT ${COLUMNS} FROM staff_hr_request WHERE staff_id = $1 ORDER BY created_at DESC`, [staffId]);
    return rows.map(mapRow);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<StaffHrRequestRow | null> {
    const { rows } = await executor.query(`SELECT ${COLUMNS} FROM staff_hr_request WHERE id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** Every request of one category for this staff member, most recent first
   * -- Payslip's own gate reads this for category='PAYSLIP_REQUEST' (has
   * any of them ever reached Finance's final APPROVED?). */
  async findByStaffAndCategory(staffId: string, category: string, executor: Queryable = this.postgres): Promise<StaffHrRequestRow[]> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} FROM staff_hr_request WHERE staff_id = $1 AND category = $2 ORDER BY created_at DESC`,
      [staffId, category],
    );
    return rows.map(mapRow);
  }

  async create(
    input: {
      staffId: string;
      category: string;
      subject: string;
      description: string | null;
      attachmentObjectKey: string | null;
      attachmentFileName: string | null;
    },
    executor: Queryable,
  ): Promise<StaffHrRequestRow> {
    const { rows } = await executor.query(
      `INSERT INTO staff_hr_request (staff_id, category, subject, description, attachment_object_key, attachment_file_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.staffId, input.category, input.subject, input.description, input.attachmentObjectKey, input.attachmentFileName],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async linkApprovalRequest(id: string, approvalRequestId: string, executor: Queryable): Promise<void> {
    await executor.query(`UPDATE staff_hr_request SET approval_request_id = $2, updated_at = now() WHERE id = $1`, [id, approvalRequestId]);
  }

  // Deciding is handled by the generic approvals engine directly (see
  // FacultyApprovalHandlers' registered simpleStateColumnHandler) -- no
  // bespoke state-transition method needed here.
}

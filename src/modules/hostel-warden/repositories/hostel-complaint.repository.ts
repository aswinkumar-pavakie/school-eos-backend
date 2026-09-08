// PENDING FEATURE -- Hostel Complaints. Reuses the real, live generic `complaint` /
// `complaint_update` tables (category, subject, description, severity, assigned_to,
// state machine, SLA -- already fully modeled) plus 3 new nullable columns that do NOT
// exist yet: hostel_id, block_id, room_id (documented in query.md). Nullable so any
// non-hostel complaint elsewhere is completely unaffected.
//
// state values reused as-is from the existing complaint table: OPEN, IN_PROGRESS,
// RESOLVED, CLOSED (its own CHECK constraint; see the query.md entry for the exact
// list) -- no new status vocabulary invented for this feature.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface HostelComplaintRow {
  id: string;
  hostelId: string;
  blockId: string | null;
  roomId: string | null;
  issueType: string;
  subject: string;
  description: string;
  raisedByPersonId: string | null;
  assignedTo: string | null;
  state: string;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateHostelComplaintInput {
  hostelId: string;
  blockId?: string | null;
  roomId?: string | null;
  issueType: string;
  subject: string;
  description: string;
  raisedByPersonId: string;
}

// complaint.category has a real, live CHECK constraint (verified against the actual
// DB) that does not include per-issue values like 'ELECTRICAL' -- every row this
// feature creates uses category='HOSTEL' (already one of the constraint's allowed
// values), fixed server-side, never client-supplied. The finer-grained type of issue
// goes in the new `issue_type` column (documented in query.md).
const FIXED_CATEGORY = 'HOSTEL';

const COLUMNS = `id, hostel_id AS "hostelId", block_id AS "blockId", room_id AS "roomId",
  issue_type AS "issueType", subject, description, raised_by_person_id AS "raisedByPersonId",
  assigned_to AS "assignedTo", state, resolved_at AS "resolvedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class HostelComplaintRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: CreateHostelComplaintInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelComplaintRow> {
    const { rows } = await executor.query<HostelComplaintRow>(
      `INSERT INTO complaint (hostel_id, block_id, room_id, issue_type, category, subject, description, raised_by_person_id)
       VALUES ($1, $2, $3, $4, '${FIXED_CATEGORY}', $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        input.hostelId,
        input.blockId ?? null,
        input.roomId ?? null,
        input.issueType,
        input.subject,
        input.description,
        input.raisedByPersonId,
      ],
    );
    return rows[0];
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelComplaintRow | null> {
    const { rows } = await executor.query<HostelComplaintRow>(
      `SELECT ${COLUMNS} FROM complaint WHERE id = $1 AND hostel_id IS NOT NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findManyForHostels(
    hostelIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<HostelComplaintRow[]> {
    const { rows } = await executor.query<HostelComplaintRow>(
      `SELECT ${COLUMNS} FROM complaint WHERE hostel_id = ANY($1) ORDER BY created_at DESC`,
      [hostelIds],
    );
    return rows;
  }

  /** Status/tracking edit only -- category/subject/description/hostel scope are
   * fixed at creation. assigned_to is deliberately not settable here (Admin/
   * maintenance-assignment rules own that, per the module plan). */
  async updateState(
    id: string,
    state: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelComplaintRow | null> {
    const resolvedClause =
      state === 'RESOLVED' || state === 'CLOSED' ? 'now()' : 'resolved_at';
    const { rows } = await executor.query<HostelComplaintRow>(
      `UPDATE complaint SET state = $2, resolved_at = ${resolvedClause}, updated_at = now()
       WHERE id = $1 AND hostel_id IS NOT NULL
       RETURNING ${COLUMNS}`,
      [id, state],
    );
    return rows[0] ?? null;
  }
}

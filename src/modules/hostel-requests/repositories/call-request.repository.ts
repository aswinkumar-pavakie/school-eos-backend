// Real call_request table (see database/migrations/0012_hostel_outing_call_requests.sql,
// not yet run). Row shape matches src/lib/hostel-warden-api.ts's own
// CallRequestRow exactly (school-eos-mobile, already built against this shape).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface CallRequestRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  parentPersonId: string;
  hostelId: string;
  requestedFrom: string;
  requestedTo: string;
  status: string;
  approvedFrom: string | null;
  approvedTo: string | null;
  decidedByPersonId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: any): CallRequestRow {
  return {
    id: row.id,
    studentId: row.student_id,
    studentFirstName: row.first_name,
    studentLastName: row.last_name,
    parentPersonId: row.parent_person_id,
    hostelId: row.hostel_id,
    requestedFrom: row.requested_from,
    requestedTo: row.requested_to,
    status: row.status,
    approvedFrom: row.approved_from,
    approvedTo: row.approved_to,
    decidedByPersonId: row.decided_by_person_id,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = `c.id, c.student_id, c.parent_person_id, c.hostel_id, c.requested_from, c.requested_to,
  c.status, c.approved_from, c.approved_to, c.decided_by_person_id, c.decided_at, c.created_at, c.updated_at,
  p.first_name, p.last_name`;
const FROM = `call_request c
  JOIN student s ON s.id = c.student_id
  JOIN person p ON p.id = s.person_id`;

@Injectable()
export class CallRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findForHostels(hostelIds: string[], executor: Queryable = this.postgres): Promise<CallRequestRow[]> {
    if (hostelIds.length === 0) return [];
    const { rows } = await executor.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE c.hostel_id = ANY($1) ORDER BY c.created_at DESC`, [hostelIds]);
    return rows.map(mapRow);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<CallRequestRow | null> {
    const { rows } = await executor.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE c.id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByStudent(studentId: string, executor: Queryable = this.postgres): Promise<CallRequestRow[]> {
    const { rows } = await executor.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE c.student_id = $1 ORDER BY c.created_at DESC`, [studentId]);
    return rows.map(mapRow);
  }

  /** Every call request this parent has themselves raised (across every one
   * of their linked children) -- school-eos-mobile's own listCallRequests()
   * takes no studentId at all. */
  async findByParent(parentPersonId: string, executor: Queryable = this.postgres): Promise<CallRequestRow[]> {
    const { rows } = await executor.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE c.parent_person_id = $1 ORDER BY c.created_at DESC`, [parentPersonId]);
    return rows.map(mapRow);
  }

  async create(
    input: { studentId: string; parentPersonId: string; hostelId: string; requestedFrom: string; requestedTo: string },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO call_request (student_id, parent_person_id, hostel_id, requested_from, requested_to)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.studentId, input.parentPersonId, input.hostelId, input.requestedFrom, input.requestedTo],
    );
    return rows[0].id;
  }

  async decide(
    id: string,
    input: { status: 'APPROVED' | 'REJECTED'; decidedBy: string; approvedFrom?: string; approvedTo?: string },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE call_request
       SET status = $2, decided_by_person_id = $3, approved_from = $4, approved_to = $5, decided_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'PENDING'`,
      [id, input.status, input.decidedBy, input.approvedFrom ?? null, input.approvedTo ?? null],
    );
  }
}

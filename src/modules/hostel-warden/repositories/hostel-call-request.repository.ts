// PENDING FEATURE -- Parent Call Request. Backed by a new `hostel_call_request` table
// that does NOT exist yet (documented in query.md). A single-approver decision
// (PENDING -> APPROVED|REJECTED) -- deliberately NOT routed through the generic
// approvals engine (that engine is built for multi-step chains; one Warden's own
// yes/no doesn't need it, matching how staff-attendance and other simple domains
// skip the engine too).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface HostelCallRequestRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  parentPersonId: string;
  hostelId: string;
  requestedFrom: Date;
  requestedTo: Date;
  status: string;
  approvedFrom: Date | null;
  approvedTo: Date | null;
  decidedByPersonId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateHostelCallRequestInput {
  studentId: string;
  parentPersonId: string;
  hostelId: string;
  requestedFrom: Date;
  requestedTo: Date;
}

const COLUMNS = `cr.id, cr.student_id AS "studentId", p.first_name AS "studentFirstName",
  p.last_name AS "studentLastName", cr.parent_person_id AS "parentPersonId", cr.hostel_id AS "hostelId",
  cr.requested_from AS "requestedFrom", cr.requested_to AS "requestedTo", cr.status,
  cr.approved_from AS "approvedFrom", cr.approved_to AS "approvedTo",
  cr.decided_by_person_id AS "decidedByPersonId", cr.decided_at AS "decidedAt",
  cr.created_at AS "createdAt", cr.updated_at AS "updatedAt"`;

const FROM = `hostel_call_request cr JOIN student s ON s.id = cr.student_id JOIN person p ON p.id = s.person_id`;

@Injectable()
export class HostelCallRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: CreateHostelCallRequestInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelCallRequestRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO hostel_call_request (student_id, parent_person_id, hostel_id, requested_from, requested_to)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.studentId,
        input.parentPersonId,
        input.hostelId,
        input.requestedFrom,
        input.requestedTo,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelCallRequestRow | null> {
    const { rows } = await executor.query<HostelCallRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE cr.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<HostelCallRequestRow | null> {
    const { rows } = await executor.query<HostelCallRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE cr.id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findManyForHostels(
    hostelIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<HostelCallRequestRow[]> {
    const { rows } = await executor.query<HostelCallRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE cr.hostel_id = ANY($1) ORDER BY cr.created_at DESC`,
      [hostelIds],
    );
    return rows;
  }

  async findManyForParent(
    parentPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelCallRequestRow[]> {
    const { rows } = await executor.query<HostelCallRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE cr.parent_person_id = $1 ORDER BY cr.created_at DESC`,
      [parentPersonId],
    );
    return rows;
  }

  async decide(
    id: string,
    input: {
      status: 'APPROVED' | 'REJECTED';
      approvedFrom?: Date | null;
      approvedTo?: Date | null;
      decidedByPersonId: string;
    },
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE hostel_call_request
       SET status = $2, approved_from = $3, approved_to = $4, decided_by_person_id = $5, decided_at = now(), updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.status,
        input.approvedFrom ?? null,
        input.approvedTo ?? null,
        input.decidedByPersonId,
      ],
    );
  }
}

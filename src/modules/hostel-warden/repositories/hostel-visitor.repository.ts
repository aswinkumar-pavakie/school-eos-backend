// Visitor Log -- backed by the real, live `hostel_visitor` table (student_id,
// visitor_name, relationship, id_proof_ref, phone, entered_at, exited_at, recorded_by),
// already in the schema and completely unused by any module until now. The table has
// no hostel_id column of its own -- Warden scoping is derived by joining through the
// student's current ACTIVE hostel_allocation (same derivation as Night Attendance's
// findActiveHostelIdForStudent), not a new column.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface HostelVisitorRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  visitorName: string;
  relationship: string | null;
  idProofRef: string | null;
  phone: string | null;
  enteredAt: Date;
  exitedAt: Date | null;
  recordedBy: string | null;
}

export interface CreateHostelVisitorInput {
  studentId: string;
  visitorName: string;
  relationship?: string | null;
  idProofRef?: string | null;
  phone?: string | null;
  recordedBy: string;
}

const COLUMNS = `hv.id, hv.student_id AS "studentId", p.first_name AS "studentFirstName",
  p.last_name AS "studentLastName", hv.visitor_name AS "visitorName", hv.relationship,
  hv.id_proof_ref AS "idProofRef", hv.phone, hv.entered_at AS "enteredAt",
  hv.exited_at AS "exitedAt", hv.recorded_by AS "recordedBy"`;

const FROM = `hostel_visitor hv JOIN student s ON s.id = hv.student_id JOIN person p ON p.id = s.person_id`;

@Injectable()
export class HostelVisitorRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Visitor log for every student currently allocated to one of the Warden's
   * hostels -- open visits (exited_at IS NULL) first, then most recent. */
  async findMany(
    hostelIds: string[],
    filter: { openOnly?: boolean } = {},
    executor: Queryable = this.postgres,
  ): Promise<HostelVisitorRow[]> {
    const openCondition = filter.openOnly ? 'AND hv.exited_at IS NULL' : '';
    const { rows } = await executor.query<HostelVisitorRow>(
      `SELECT ${COLUMNS} FROM ${FROM}
       JOIN hostel_allocation a ON a.student_id = hv.student_id AND a.status = 'ACTIVE'
       JOIN hostel_bed bed ON bed.id = a.bed_id
       JOIN hostel_room r ON r.id = bed.room_id
       JOIN hostel_floor f ON f.id = r.floor_id
       JOIN hostel_block bl ON bl.id = f.block_id
       WHERE bl.hostel_id = ANY($1) ${openCondition}
       ORDER BY hv.exited_at IS NULL DESC, hv.entered_at DESC`,
      [hostelIds],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelVisitorRow | null> {
    const { rows } = await executor.query<HostelVisitorRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE hv.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateHostelVisitorInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelVisitorRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO hostel_visitor (student_id, visitor_name, relationship, id_proof_ref, phone, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.studentId,
        input.visitorName,
        input.relationship ?? null,
        input.idProofRef ?? null,
        input.phone ?? null,
        input.recordedBy,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  /** Conditional UPDATE ... WHERE exited_at IS NULL -- 0 rows updated means this
   * visit was already marked exited (safe duplicate-exit handling: the service
   * returns the existing record instead of erroring, same idiom as
   * attendance_session's lock()). */
  async markExited(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE hostel_visitor SET exited_at = now() WHERE id = $1 AND exited_at IS NULL RETURNING id`,
      [id],
    );
    return rows.length > 0;
  }
}

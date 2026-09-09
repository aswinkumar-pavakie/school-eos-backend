// PENDING FEATURE -- Study Attendance. Backed by a new `hostel_study_session` table
// that does NOT exist yet (documented in query.md for a later migration) -- mirrors
// attendance_session's shape (hostel_id, session_date, marked/locked bookkeeping) plus
// real start_time/end_time (like camp_session), since a hostel study slot is a real
// configured time window, not just a calendar date.
//
// This repository is written against the real intended schema so the service layer
// and its tests are ready the moment the migration runs -- see HostelWardenPendingModule
// for why this whole feature stays out of AppModule until then.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface HostelStudySessionRow {
  id: string;
  hostelId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  createdByStaffId: string | null;
  isLocked: boolean;
  createdAt: Date;
}

const COLUMNS = `id, hostel_id AS "hostelId", session_date AS "sessionDate", start_time AS "startTime",
  end_time AS "endTime", created_by_staff_id AS "createdByStaffId", is_locked AS "isLocked",
  created_at AS "createdAt"`;

@Injectable()
export class HostelStudySessionRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      hostelId: string;
      sessionDate: string;
      startTime: string;
      endTime: string;
      createdByStaffId: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<HostelStudySessionRow> {
    const { rows } = await executor.query<HostelStudySessionRow>(
      `INSERT INTO hostel_study_session (hostel_id, session_date, start_time, end_time, created_by_staff_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [
        input.hostelId,
        input.sessionDate,
        input.startTime,
        input.endTime,
        input.createdByStaffId,
      ],
    );
    return rows[0];
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelStudySessionRow | null> {
    const { rows } = await executor.query<HostelStudySessionRow>(
      `SELECT ${COLUMNS} FROM hostel_study_session WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findMany(
    hostelIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<HostelStudySessionRow[]> {
    const { rows } = await executor.query<HostelStudySessionRow>(
      `SELECT ${COLUMNS} FROM hostel_study_session WHERE hostel_id = ANY($1)
       ORDER BY session_date DESC, start_time DESC`,
      [hostelIds],
    );
    return rows;
  }

  async lock(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelStudySessionRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE hostel_study_session SET is_locked = true WHERE id = $1 AND is_locked = false RETURNING id`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }
}

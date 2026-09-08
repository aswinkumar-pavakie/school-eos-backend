import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface AttendanceSessionRow {
  id: string;
  sectionId: string;
  sessionDate: string;
  sessionType: string;
  markedBy: string | null;
  markedAt: Date | null;
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id, section_id AS "sectionId", session_date AS "sessionDate", session_type AS "sessionType",
  marked_by AS "markedBy", marked_at AS "markedAt", is_locked AS "isLocked",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class AttendanceSessionRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Always DAILY -- subject_offering_id/period_id/device_sync_key stay null. PERIOD-mode
   * needs Timetable & Teaching Assignments, which don't exist yet. */
  async create(
    sectionId: string,
    sessionDate: string,
    executor: Queryable = this.postgres,
  ): Promise<AttendanceSessionRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO attendance_session (section_id, session_date, session_type)
       VALUES ($1, $2, 'DAILY')
       RETURNING id`,
      [sectionId, sessionDate],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<AttendanceSessionRow | null> {
    const { rows } = await executor.query<AttendanceSessionRow>(
      `SELECT ${COLUMNS} FROM attendance_session WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findMany(
    filter: {
      sectionId?: string;
      dateFrom?: string;
      dateTo?: string;
      limit: number;
      offset: number;
    },
    executor: Queryable = this.postgres,
  ): Promise<{ rows: AttendanceSessionRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.sectionId) {
      params.push(filter.sectionId);
      conditions.push(`section_id = $${params.length}`);
    }
    if (filter.dateFrom) {
      params.push(filter.dateFrom);
      conditions.push(`session_date >= $${params.length}`);
    }
    if (filter.dateTo) {
      params.push(filter.dateTo);
      conditions.push(`session_date <= $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM attendance_session ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<AttendanceSessionRow>(
      `SELECT ${COLUMNS} FROM attendance_session ${where}
       ORDER BY session_date DESC, created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  /** Active-enrolment roster for a section -- what a newly-created DAILY session
   * seeds attendance_record rows from. */
  async findActiveEnrolledStudentIds(
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const { rows } = await executor.query<{ studentId: string }>(
      `SELECT student_id AS "studentId" FROM student_enrolment WHERE section_id = $1 AND status = 'ACTIVE'`,
      [sectionId],
    );
    return rows.map((r) => r.studentId);
  }

  /** Only succeeds from an unlocked state -- the service checks isLocked itself first
   * and treats "no row updated" as impossible-not-a-race here since this always runs
   * right after a fresh findById in the same request. */
  async lock(
    id: string,
    markedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<AttendanceSessionRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE attendance_session SET is_locked = true, marked_by = $2, marked_at = now(), updated_at = now()
       WHERE id = $1 AND is_locked = false
       RETURNING id`,
      [id, markedBy],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }
}

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface AttendanceCorrectionRow {
  // bigint column -- node-pg returns this as a string to avoid precision loss.
  id: string;
  attendanceRecordId: string;
  oldStatus: string;
  newStatus: string;
  reason: string;
  correctedBy: string;
  correctedAt: Date;
}

const COLUMNS = `id, attendance_record_id AS "attendanceRecordId", old_status AS "oldStatus",
  new_status AS "newStatus", reason, corrected_by AS "correctedBy", corrected_at AS "correctedAt"`;

@Injectable()
export class AttendanceCorrectionRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Pure audit-log insert -- never updated or deleted, only ever created alongside
   * the attendance_record status write it explains, in the same transaction. */
  async create(
    input: {
      attendanceRecordId: string;
      oldStatus: string;
      newStatus: string;
      reason: string;
      correctedBy: string;
    },
    executor: Queryable,
  ): Promise<AttendanceCorrectionRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO attendance_correction (attendance_record_id, old_status, new_status, reason, corrected_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.attendanceRecordId, input.oldStatus, input.newStatus, input.reason, input.correctedBy],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<AttendanceCorrectionRow | null> {
    const { rows } = await executor.query<AttendanceCorrectionRow>(
      `SELECT ${COLUMNS} FROM attendance_correction WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByRecordId(
    attendanceRecordId: string,
    executor: Queryable = this.postgres,
  ): Promise<AttendanceCorrectionRow[]> {
    const { rows } = await executor.query<AttendanceCorrectionRow>(
      `SELECT ${COLUMNS} FROM attendance_correction WHERE attendance_record_id = $1 ORDER BY corrected_at DESC`,
      [attendanceRecordId],
    );
    return rows;
  }
}

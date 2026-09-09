import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface TrainingAttendanceRow {
  id: string;
  trainingSessionId: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  status: string;
  recordedBy: string | null;
}

const COLUMNS = `ta.id, ta.training_session_id AS "trainingSessionId", ta.student_id AS "studentId",
  p.first_name AS "studentFirstName", p.last_name AS "studentLastName", ta.status, ta.recorded_by AS "recordedBy"`;

const FROM = `FROM training_attendance ta JOIN student s ON s.id = ta.student_id JOIN person p ON p.id = s.person_id`;

@Injectable()
export class TrainingAttendanceRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** One INSERT..ON CONFLICT per student, in one round trip per call — same
   * "bulk save, re-save is idempotent" shape as the class-attendance module's
   * own bulk save. uq_training_attendance backs the upsert. */
  async recordMany(
    trainingSessionId: string,
    entries: { studentId: string; status: string }[],
    recordedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<TrainingAttendanceRow[]> {
    if (entries.length === 0) return [];
    const values = entries
      .map(
        (_, i) =>
          `($1, $${i * 2 + 2}, $${i * 2 + 3}, $${entries.length * 2 + 2})`,
      )
      .join(', ');
    const params: unknown[] = [trainingSessionId];
    for (const e of entries) params.push(e.studentId, e.status);
    params.push(recordedBy);
    await executor.query(
      `INSERT INTO training_attendance (training_session_id, student_id, status, recorded_by)
       VALUES ${values}
       ON CONFLICT (training_session_id, student_id) DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by`,
      params,
    );
    return this.findBySession(trainingSessionId, executor);
  }

  async findBySession(
    trainingSessionId: string,
    executor: Queryable = this.postgres,
  ): Promise<TrainingAttendanceRow[]> {
    const { rows } = await executor.query<TrainingAttendanceRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE ta.training_session_id = $1 ORDER BY p.first_name, p.last_name`,
      [trainingSessionId],
    );
    return rows;
  }
}

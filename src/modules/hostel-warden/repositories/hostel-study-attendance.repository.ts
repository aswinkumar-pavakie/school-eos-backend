// PENDING FEATURE -- Study Attendance roster rows. Backed by a new
// `hostel_study_attendance` table that does NOT exist yet (documented in query.md),
// mirroring attendance_record's (session_id, student_id) unique-roster idiom. No
// image/photo column -- MVP is Warden-confirmed presence only; a future camera-capture
// flow would attach a photo via the existing generic `document` polymorphic table
// (owner_object_type='hostel_study_attendance'), not a new column here.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StudyAttendanceRosterRow {
  studentId: string;
  firstName: string;
  lastName: string | null;
  admissionNo: string;
  attendanceId: string | null;
  status: string | null;
  recordedAt: Date | null;
}

const ROSTER_COLUMNS = `s.id AS "studentId", p.first_name AS "firstName", p.last_name AS "lastName",
  s.admission_no AS "admissionNo", sa.id AS "attendanceId", sa.status, sa.recorded_at AS "recordedAt"`;

@Injectable()
export class HostelStudyAttendanceRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Roster = every student with an ACTIVE hostel_allocation in the session's hostel,
   * left-joined to this session's roster row (null status = not yet marked). */
  async findRoster(
    sessionId: string,
    hostelId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudyAttendanceRosterRow[]> {
    const { rows } = await executor.query<StudyAttendanceRosterRow>(
      `SELECT ${ROSTER_COLUMNS}
       FROM hostel_allocation a
       JOIN student s ON s.id = a.student_id
       JOIN person p ON p.id = s.person_id
       JOIN hostel_bed bed ON bed.id = a.bed_id
       JOIN hostel_room r ON r.id = bed.room_id
       JOIN hostel_floor f ON f.id = r.floor_id
       JOIN hostel_block bl ON bl.id = f.block_id
       LEFT JOIN hostel_study_attendance sa ON sa.student_id = a.student_id AND sa.session_id = $1
       WHERE bl.hostel_id = $2 AND a.status = 'ACTIVE'
       ORDER BY p.first_name, p.last_name`,
      [sessionId, hostelId],
    );
    return rows;
  }

  async upsert(
    input: {
      sessionId: string;
      studentId: string;
      status: string;
      recordedBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO hostel_study_attendance (session_id, student_id, status, recorded_by, recorded_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (session_id, student_id)
       DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
      [input.sessionId, input.studentId, input.status, input.recordedBy],
    );
  }
}

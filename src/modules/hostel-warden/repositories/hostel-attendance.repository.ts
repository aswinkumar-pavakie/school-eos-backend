// Night Attendance -- backed by the real, live `hostel_attendance` table (student_id,
// hostel_id, roll_call_date, session, status, recorded_by, recorded_at), already in the
// schema and completely unused by any module until now. `session` is stored as 'NIGHT'
// for this feature -- the same table's free-text `session` column leaves room for other
// roll-call sessions (e.g. a morning count) later without a new table.
//
// Deliberately separate from `attendance_record`/`attendance_session` (academic/class
// attendance) -- never touches those tables.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export const NIGHT_SESSION = 'NIGHT';

export interface NightAttendanceRosterRow {
  studentId: string;
  firstName: string;
  lastName: string | null;
  admissionNo: string;
  roomNo: string | null;
  bedNo: string | null;
  attendanceId: string | null;
  status: string | null;
  recordedAt: Date | null;
}

export interface MarkNightAttendanceEntry {
  studentId: string;
  status: string;
}

const ROSTER_COLUMNS = `s.id AS "studentId", p.first_name AS "firstName", p.last_name AS "lastName",
  s.admission_no AS "admissionNo", r.room_no AS "roomNo", bed.bed_no AS "bedNo",
  ha.id AS "attendanceId", ha.status, ha.recorded_at AS "recordedAt"`;

@Injectable()
export class HostelAttendanceRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Roster = every student with an ACTIVE hostel_allocation in one of the Warden's
   * hostels, left-joined to that date's hostel_attendance row (null status = not yet
   * marked, never defaulted to absent). */
  async findRoster(
    hostelIds: string[],
    date: string,
    executor: Queryable = this.postgres,
  ): Promise<NightAttendanceRosterRow[]> {
    const { rows } = await executor.query<NightAttendanceRosterRow>(
      `SELECT ${ROSTER_COLUMNS}
       FROM hostel_allocation a
       JOIN student s ON s.id = a.student_id
       JOIN person p ON p.id = s.person_id
       JOIN hostel_bed bed ON bed.id = a.bed_id
       JOIN hostel_room r ON r.id = bed.room_id
       JOIN hostel_floor f ON f.id = r.floor_id
       JOIN hostel_block bl ON bl.id = f.block_id
       LEFT JOIN hostel_attendance ha
         ON ha.student_id = a.student_id AND ha.roll_call_date = $2 AND ha.session = '${NIGHT_SESSION}'
       WHERE bl.hostel_id = ANY($1) AND a.status = 'ACTIVE'
       ORDER BY p.first_name, p.last_name`,
      [hostelIds, date],
    );
    return rows;
  }

  /** Safe-repeat-submission via the table's own unique constraint
   * (student_id, roll_call_date, session) -- ON CONFLICT DO UPDATE means re-marking the
   * same student/date/session just overwrites the prior status, never a duplicate row
   * or a 500. */
  async upsert(
    input: {
      studentId: string;
      hostelId: string;
      date: string;
      status: string;
      recordedBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO hostel_attendance (student_id, hostel_id, roll_call_date, session, status, recorded_by, recorded_at)
       VALUES ($1, $2, $3, '${NIGHT_SESSION}', $4, $5, now())
       ON CONFLICT (student_id, roll_call_date, session)
       DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
      [
        input.studentId,
        input.hostelId,
        input.date,
        input.status,
        input.recordedBy,
      ],
    );
  }
}

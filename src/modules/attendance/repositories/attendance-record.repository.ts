import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface AttendanceRecordRow {
  id: string;
  sessionId: string;
  studentId: string;
  // Effective status: the latest attendance_correction's new_status once the
  // session is locked and at least one correction exists, else the base row's own
  // status. See the class doc comment for why this is derived, not stored.
  status: string;
  reason: string | null;
  createdAt: Date;
}

export interface AttendanceRecordWithStudent extends AttendanceRecordRow {
  firstName: string;
  lastName: string | null;
  rollNo: number | null;
}

// A DB trigger (guard_locked_attendance, BEFORE UPDATE on attendance_record) raises
// an exception on ANY status change once the row's session is locked -- it does not
// make an exception for updates paired with an attendance_correction insert in the
// same transaction. So once locked, attendance_record.status/reason are permanently
// frozen at whatever they were at lock time; a "correction" only ever inserts into
// attendance_correction, and the *effective* status shown everywhere is derived here
// via a LATERAL join to that table's most recent row, falling back to the frozen
// base value when there's no correction yet.
const COLUMNS = `ar.id, ar.session_id AS "sessionId", ar.student_id AS "studentId",
  COALESCE(latest_correction.new_status, ar.status) AS status, ar.reason, ar.created_at AS "createdAt"`;

const LATEST_CORRECTION_JOIN = `LEFT JOIN LATERAL (
    SELECT new_status FROM attendance_correction
    WHERE attendance_record_id = ar.id
    ORDER BY corrected_at DESC
    LIMIT 1
  ) latest_correction ON true`;

@Injectable()
export class AttendanceRecordRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** One PRESENT row per active-enrolled student, seeded atomically at session
   * creation -- "mark all present, then correct the exceptions". Bulk single-statement
   * insert via unnest so it's one round trip regardless of roster size. */
  async createManyPresent(
    sessionId: string,
    studentIds: string[],
    executor: Queryable,
  ): Promise<void> {
    if (studentIds.length === 0) return;
    await executor.query(
      `INSERT INTO attendance_record (session_id, student_id, status)
       SELECT $1, unnest($2::uuid[]), 'PRESENT'`,
      [sessionId, studentIds],
    );
  }

  /** One-off insert for a single student into an already-existing session --
   * the rare case where a session was created before this student's own
   * enrolment (so createManyPresent's original seed never covered them). */
  async createOne(
    sessionId: string,
    studentId: string,
    status: string,
    reason: string | null,
    executor: Queryable,
  ): Promise<AttendanceRecordRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO attendance_record (session_id, student_id, status, reason) VALUES ($1, $2, $3, $4) RETURNING id`,
      [sessionId, studentId, status, reason],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<AttendanceRecordRow | null> {
    const { rows } = await executor.query<AttendanceRecordRow>(
      `SELECT ${COLUMNS} FROM attendance_record ar ${LATEST_CORRECTION_JOIN} WHERE ar.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** This exact student's own row within one session -- used by the
   * student-leave auto-mark-absent rule (one student, one already-known
   * session) rather than pulling the whole roster just to find one row. */
  async findBySessionAndStudent(
    sessionId: string,
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<AttendanceRecordRow | null> {
    const { rows } = await executor.query<AttendanceRecordRow>(
      `SELECT ${COLUMNS} FROM attendance_record ar ${LATEST_CORRECTION_JOIN} WHERE ar.session_id = $1 AND ar.student_id = $2`,
      [sessionId, studentId],
    );
    return rows[0] ?? null;
  }

  /** Roster view for one session: student name + roll number scoped to the
   * session's own section (a student can hold enrolments in other sections/years
   * too, so the join is qualified by sectionId, not just studentId). */
  async findBySessionId(
    sessionId: string,
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<AttendanceRecordWithStudent[]> {
    const { rows } = await executor.query<AttendanceRecordWithStudent>(
      `SELECT ${COLUMNS}, p.first_name AS "firstName", p.last_name AS "lastName", se.roll_no AS "rollNo"
       FROM attendance_record ar
       ${LATEST_CORRECTION_JOIN}
       JOIN student s ON s.id = ar.student_id
       JOIN person p ON p.id = s.person_id
       LEFT JOIN student_enrolment se
         ON se.student_id = ar.student_id AND se.section_id = $2 AND se.status = 'ACTIVE'
       WHERE ar.session_id = $1
       ORDER BY se.roll_no NULLS LAST, p.first_name, p.last_name`,
      [sessionId, sectionId],
    );
    return rows;
  }

  /** Present-ish (PRESENT/LATE/HALF_DAY) vs total marked days, across every
   * session this student has an attendance_record for -- backs the profile
   * header's "Attendance" stat. Uses the same effective-status derivation
   * (post-correction) as everywhere else this table is read. */
  async getAttendanceSummaryForStudent(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ presentCount: number; totalCount: number }> {
    const { rows } = await executor.query<{
      present_count: string;
      total_count: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE COALESCE(latest_correction.new_status, ar.status) IN ('PRESENT', 'LATE', 'HALF_DAY')) AS present_count,
         count(*) AS total_count
       FROM attendance_record ar
       ${LATEST_CORRECTION_JOIN}
       WHERE ar.student_id = $1`,
      [studentId],
    );
    return {
      presentCount: parseInt(rows[0].present_count, 10),
      totalCount: parseInt(rows[0].total_count, 10),
    };
  }

  /** Correspondent Phase 9 addition -- real, school-wide attendance ranked
   * lowest-first over a date window, for active students currently enrolled
   * in the current academic year. Deliberately NO minimum-attendance
   * threshold is applied here (no such config exists anywhere in this schema
   * -- checked school-wide before adding this) -- every row shows its own
   * real presentCount/totalCount so a student with e.g. 0/1 isn't
   * misrepresented as equivalent to 0/40. The frontend sorts/filters this
   * real data; it does not decide who is "flagged". Same effective-status
   * derivation (post-correction) as every other read in this repository. */
  async findLowestAttendance(
    sinceDate: string,
    limit: number,
    executor: Queryable = this.postgres,
  ): Promise<
    Array<{
      studentId: string;
      firstName: string;
      lastName: string | null;
      admissionNo: string;
      gradeName: string | null;
      sectionName: string | null;
      presentCount: number;
      totalCount: number;
    }>
  > {
    const { rows } = await executor.query<{
      student_id: string;
      first_name: string;
      last_name: string | null;
      admission_no: string;
      grade_name: string | null;
      section_name: string | null;
      present_count: string;
      total_count: string;
    }>(
      `SELECT s.id AS student_id, p.first_name, p.last_name, s.admission_no,
              g.name AS grade_name, sec.name AS section_name,
              count(*) FILTER (WHERE COALESCE(latest_correction.new_status, ar.status) IN ('PRESENT', 'LATE', 'HALF_DAY')) AS present_count,
              count(*) AS total_count
       FROM attendance_record ar
       JOIN attendance_session ats ON ats.id = ar.session_id
       JOIN student s ON s.id = ar.student_id
       JOIN person p ON p.id = s.person_id
       LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
         AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       LEFT JOIN section sec ON sec.id = se.section_id
       LEFT JOIN grade g ON g.id = sec.grade_id
       ${LATEST_CORRECTION_JOIN}
       WHERE s.status = 'ACTIVE' AND ats.session_date >= $1
       GROUP BY s.id, p.first_name, p.last_name, s.admission_no, g.name, sec.name
       HAVING count(*) > 0
       ORDER BY (count(*) FILTER (WHERE COALESCE(latest_correction.new_status, ar.status) IN ('PRESENT', 'LATE', 'HALF_DAY')))::numeric / count(*) ASC,
                count(*) DESC
       LIMIT $2`,
      [sinceDate, limit],
    );
    return rows.map((r) => ({
      studentId: r.student_id,
      firstName: r.first_name,
      lastName: r.last_name,
      admissionNo: r.admission_no,
      gradeName: r.grade_name,
      sectionName: r.section_name,
      presentCount: parseInt(r.present_count, 10),
      totalCount: parseInt(r.total_count, 10),
    }));
  }

  /** Which of these students have an effective status of ABSENT for this exact
   * calendar date, across whatever section(s) they were enrolled in that day --
   * feeds the Hostel module's Class Absence Alert (a student marked absent in class
   * while hostel records show them as a resident boarder). Read-only: never writes
   * to attendance_record/attendance_session, and reuses the same effective-status
   * derivation (post-correction) as every other read in this repository, rather than
   * a second module re-deriving it from attendance_correction itself. */
  async findAbsentStudentIdsForDate(
    studentIds: string[],
    date: string,
    executor: Queryable = this.postgres,
  ): Promise<
    Array<{ studentId: string; recordId: string; sectionId: string }>
  > {
    if (studentIds.length === 0) return [];
    const { rows } = await executor.query<{
      studentId: string;
      recordId: string;
      sectionId: string;
    }>(
      `SELECT ar.student_id AS "studentId", ar.id AS "recordId", ats.section_id AS "sectionId"
       FROM attendance_record ar
       ${LATEST_CORRECTION_JOIN}
       JOIN attendance_session ats ON ats.id = ar.session_id
       WHERE ar.student_id = ANY($1)
         AND ats.session_date = $2
         AND COALESCE(latest_correction.new_status, ar.status) = 'ABSENT'`,
      [studentIds, date],
    );
    return rows;
  }

  /** Direct edit -- only valid while the record's own session is still unlocked
   * (the DB trigger itself enforces this the moment the session locks; the service
   * also checks first so it can return a clean 409 instead of a raw trigger error). */
  async updateStatus(
    id: string,
    status: string,
    reason: string | null | undefined,
    executor: Queryable = this.postgres,
  ): Promise<AttendanceRecordRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE attendance_record SET status = $2, reason = COALESCE($3, reason) WHERE id = $1 RETURNING id`,
      [id, status, reason ?? null],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }
}

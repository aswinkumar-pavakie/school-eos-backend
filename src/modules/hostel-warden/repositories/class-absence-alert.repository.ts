// Class Absence Alert is a derived, read-mostly feature -- it never writes to
// attendance_record/attendance_session (see AttendanceRecordsService.
// findAbsentStudentIdsForDate, which this module calls instead of re-deriving
// "absent" itself). The only write this repository does is the dedup-check read
// against `notification` (written via the shared OutboxService, never a new table)
// and a small read of `outing_request`/`guardian_link` -- both real, existing,
// shared tables, read directly the same way hostel repositories already read
// `student`/`person` without importing another module's repository for a plain join.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ClassAbsenceAlertRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  title: string;
  body: string;
  createdAt: Date;
}

@Injectable()
export class ClassAbsenceAlertRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every ACTIVE-allocation student across the Warden's hostels -- the candidate
   * pool an absence check runs against. */
  async findActiveStudentsForHostels(
    hostelIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<
    Array<{ studentId: string; firstName: string; lastName: string | null }>
  > {
    const { rows } = await executor.query<{
      studentId: string;
      firstName: string;
      lastName: string | null;
    }>(
      `SELECT DISTINCT s.id AS "studentId", p.first_name AS "firstName", p.last_name AS "lastName"
       FROM hostel_allocation a
       JOIN student s ON s.id = a.student_id
       JOIN person p ON p.id = s.person_id
       JOIN hostel_bed bed ON bed.id = a.bed_id
       JOIN hostel_room r ON r.id = bed.room_id
       JOIN hostel_floor f ON f.id = r.floor_id
       JOIN hostel_block bl ON bl.id = f.block_id
       WHERE bl.hostel_id = ANY($1) AND a.status = 'ACTIVE'`,
      [hostelIds],
    );
    return rows;
  }

  /** Students among these already covered by an APPROVED outing (Gate Pass or
   * Emergency Exit) spanning this date -- excluded from alerting since they had a
   * legitimate, Warden-approved reason to be off-campus, not an unexplained absence. */
  async findStudentIdsWithApprovedOutingCoveringDate(
    studentIds: string[],
    date: string,
    executor: Queryable = this.postgres,
  ): Promise<Set<string>> {
    if (studentIds.length === 0) return new Set();
    const { rows } = await executor.query<{ studentId: string }>(
      `SELECT DISTINCT student_id AS "studentId"
       FROM outing_request
       WHERE student_id = ANY($1) AND state = 'APPROVED'
         AND out_from::date <= $2::date AND expected_return::date >= $2::date`,
      [studentIds, date],
    );
    return new Set(rows.map((r) => r.studentId));
  }

  /** Dedup check -- which of these attendance_record ids already have an alert
   * notification enqueued, so a repeat call for the same date never double-alerts. */
  async findRecordIdsAlreadyAlerted(
    recordIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<Set<string>> {
    if (recordIds.length === 0) return new Set();
    const { rows } = await executor.query<{ relatedObjectId: string }>(
      `SELECT DISTINCT related_object_id AS "relatedObjectId"
       FROM notification
       WHERE notification_type = 'HOSTEL_CLASS_ABSENCE_ALERT'
         AND related_object_type = 'attendance_record'
         AND related_object_id = ANY($1::text[])`,
      [recordIds],
    );
    return new Set(rows.map((r) => r.relatedObjectId));
  }

  /** Every ACTIVE guardian for this student -- who the alert notification goes to. */
  async findActiveGuardianPersonIds(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const { rows } = await executor.query<{ personId: string }>(
      `SELECT person_id AS "personId" FROM guardian_link WHERE student_id = $1 AND status = 'ACTIVE'`,
      [studentId],
    );
    return rows.map((r) => r.personId);
  }

  /** Already-generated alerts for the Warden's hostel(s) ON THE REQUESTED DATE, newest
   * first -- read from the shared `notification` table (never a second copy of the
   * alert). "This date" means the underlying class absence's own session date
   * (attendance_session.session_date, joined via the notification's
   * related_object_id -> attendance_record.id), NOT the notification's created_at --
   * a Warden generating/viewing an alert a day late must still see it filed under the
   * absence's real date, not the day they happened to look. */
  async listAlertsForHostels(
    hostelIds: string[],
    date: string,
    executor: Queryable = this.postgres,
  ): Promise<ClassAbsenceAlertRow[]> {
    const { rows } = await executor.query<ClassAbsenceAlertRow>(
      `SELECT n.id::text AS id, n.about_student_id AS "studentId",
              p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
              n.title, n.body, n.created_at AS "createdAt"
       FROM notification n
       JOIN attendance_record ar ON ar.id::text = n.related_object_id
       JOIN attendance_session ats ON ats.id = ar.session_id
       JOIN student s ON s.id = n.about_student_id
       JOIN person p ON p.id = s.person_id
       JOIN hostel_allocation a ON a.student_id = s.id AND a.status = 'ACTIVE'
       JOIN hostel_bed bed ON bed.id = a.bed_id
       JOIN hostel_room r ON r.id = bed.room_id
       JOIN hostel_floor f ON f.id = r.floor_id
       JOIN hostel_block bl ON bl.id = f.block_id
       WHERE n.notification_type = 'HOSTEL_CLASS_ABSENCE_ALERT' AND n.related_object_type = 'attendance_record'
         AND bl.hostel_id = ANY($1) AND ats.session_date = $2
       ORDER BY n.created_at DESC`,
      [hostelIds, date],
    );
    return rows;
  }
}

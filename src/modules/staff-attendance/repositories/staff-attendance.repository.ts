import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface StaffDailyStatusRow {
  staffId: string;
  employeeNo: string;
  firstName: string;
  lastName: string | null;
  designation: string | null;
  status: string | null; // 'CHECK_IN' | 'ABSENT' | null (not marked yet)
  markedAt: Date | null;
  reason: string | null;
}

export interface MarkEventInput {
  staffId: string;
  eventType: 'CHECK_IN' | 'ABSENT';
  occurredAt: string;
  reason: string;
  recordedBy: string;
}

@Injectable()
export class StaffAttendanceRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** One row per active staff member, with whichever CHECK_IN/ABSENT event is
   * most recent for the given date (LEFT JOIN LATERAL) -- staff with no event
   * that date show status: null, "not marked yet", not defaulted to absent.
   * Ordered by received_at (real insertion time), not occurred_at -- a bulk
   * manual mark always stamps occurred_at as a fixed 9am for that whole date
   * (see the service), so two marks on the same day tie on occurred_at and
   * received_at is the only column that actually reflects which one is newer.
   *
   * Optional filter mirrors StaffRepository.findMany's teaching-assignment
   * filter (isTeaching + gradeId/sectionId/subjectId via subject_offering) --
   * same reasoning: a teacher's real class/section/subject assignment lives
   * there, not on staff itself. */
  async findDailyRoster(
    date: string,
    filter: { isTeaching?: boolean; gradeId?: string; sectionId?: string; subjectId?: string } = {},
    executor: Queryable = this.postgres,
  ): Promise<StaffDailyStatusRow[]> {
    const conditions = [`s.status = 'ACTIVE'`];
    const params: unknown[] = [date];

    if (filter.isTeaching !== undefined) {
      params.push(filter.isTeaching);
      conditions.push(`s.is_teaching = $${params.length}`);
    }
    if (filter.gradeId || filter.sectionId || filter.subjectId) {
      const soConditions = [`so.teacher_staff_id = s.id`, `so.status = 'ACTIVE'`];
      if (filter.sectionId) {
        params.push(filter.sectionId);
        soConditions.push(`so.section_id = $${params.length}`);
      } else if (filter.gradeId) {
        params.push(filter.gradeId);
        soConditions.push(`sec.grade_id = $${params.length}`);
      }
      if (filter.subjectId) {
        params.push(filter.subjectId);
        soConditions.push(`so.subject_id = $${params.length}`);
      }
      conditions.push(
        `EXISTS (SELECT 1 FROM subject_offering so JOIN section sec ON sec.id = so.section_id WHERE ${soConditions.join(' AND ')})`,
      );
    }

    const { rows } = await executor.query<StaffDailyStatusRow>(
      `SELECT s.id AS "staffId", s.employee_no AS "employeeNo", p.first_name AS "firstName",
              p.last_name AS "lastName", s.designation,
              latest.event_type AS "status", latest.received_at AS "markedAt", latest.reason
       FROM staff s
       JOIN person p ON p.id = s.person_id
       LEFT JOIN LATERAL (
         SELECT event_type, received_at, reason
         FROM staff_attendance_event e
         WHERE e.staff_id = s.id
           AND e.occurred_at::date = $1::date
           AND e.event_type IN ('CHECK_IN', 'ABSENT')
         ORDER BY e.received_at DESC
         LIMIT 1
       ) latest ON true
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.first_name, p.last_name`,
      params,
    );
    return rows;
  }

  /** Present vs total marked calendar days for this staff member -- one row per
   * distinct day via the same "latest event that day, by received_at" rule as
   * the daily roster, so a re-mark on the same day is never double-counted.
   * Backs the profile header's "Attendance" stat. */
  async getAttendanceSummaryForStaff(
    staffId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ presentCount: number; totalCount: number }> {
    const { rows } = await executor.query<{ present_count: string; total_count: string }>(
      `WITH daily AS (
         SELECT DISTINCT ON (e.occurred_at::date) e.occurred_at::date AS day, e.event_type
         FROM staff_attendance_event e
         WHERE e.staff_id = $1 AND e.event_type IN ('CHECK_IN', 'ABSENT')
         ORDER BY e.occurred_at::date, e.received_at DESC
       )
       SELECT count(*) FILTER (WHERE event_type = 'CHECK_IN') AS present_count, count(*) AS total_count
       FROM daily`,
      [staffId],
    );
    return {
      presentCount: parseInt(rows[0].present_count, 10),
      totalCount: parseInt(rows[0].total_count, 10),
    };
  }

  async markMany(inputs: MarkEventInput[], executor: Queryable = this.postgres): Promise<void> {
    for (const input of inputs) {
      await executor.query(
        `INSERT INTO staff_attendance_event (staff_id, event_type, method, occurred_at, received_at, reason, recorded_by, state)
         VALUES ($1, $2, 'MANUAL', $3, now(), $4, $5, 'CONFIRMED')`,
        [input.staffId, input.eventType, input.occurredAt, input.reason, input.recordedBy],
      );
    }
  }
}

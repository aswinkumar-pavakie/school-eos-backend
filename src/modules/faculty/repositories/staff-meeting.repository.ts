// Parent Meetings -- real scheduling + booking. Raising a booking is a real
// Parent-app feature explicitly out of scope for polish here (same minimal-
// creation-path convention as student_leave_request's own Parent side) --
// this repository is the Faculty-facing full CRUD + the decision-side write,
// plus the one guardian-checked insert needed for real test data to exist at
// all. No generic-approvals routing: there's no role-chain to resolve here,
// just "the slot's own creator decides" -- a plain ownership check.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface MeetingSlotRow {
  id: string;
  staffId: string;
  meetingDate: string;
  fromTime: string;
  toTime: string;
  createdAt: Date;
}

export interface MeetingBookingRow {
  id: string;
  slotId: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  rollNo: number | null;
  gradeName: string | null;
  sectionName: string | null;
  requestedBy: string;
  parentName: string;
  parentPhone: string | null;
  notes: string | null;
  state: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

const BOOKING_COLUMNS = `
  b.id, b.slot_id, b.student_id, b.requested_by, b.notes, b.state, b.decided_by, b.decided_at, b.created_at,
  sp.first_name, sp.last_name, s.admission_no, se.roll_no, g.name AS grade_name, sec.name AS section_name,
  pp.first_name AS parent_first_name, pp.last_name AS parent_last_name, pp.mobile AS parent_phone`;

const BOOKING_FROM = `
  FROM staff_meeting_booking b
  JOIN student s ON s.id = b.student_id
  JOIN person sp ON sp.id = s.person_id
  JOIN person pp ON pp.id = b.requested_by
  LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
    AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id`;

function mapBooking(row: any): MeetingBookingRow {
  return {
    id: row.id,
    slotId: row.slot_id,
    studentId: row.student_id,
    studentName: [row.first_name, row.last_name].filter(Boolean).join(' '),
    admissionNo: row.admission_no,
    rollNo: row.roll_no,
    gradeName: row.grade_name,
    sectionName: row.section_name,
    requestedBy: row.requested_by,
    parentName: [row.parent_first_name, row.parent_last_name]
      .filter(Boolean)
      .join(' '),
    parentPhone: row.parent_phone,
    notes: row.notes,
    state: row.state,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

@Injectable()
export class StaffMeetingRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Parent-facing: every real slot belonging to a faculty member who
   * currently teaches or advises this exact student -- the same scope
   * boundary isActiveGuardian's own caller (createBooking) already checks
   * per-slot, resolved here as a real join instead of a loop so the Parent
   * app's own "choose a slot" screen can list them all in one query. */
  async findOpenSlotsForStudent(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<(MeetingSlotRow & { facultyName: string })[]> {
    const { rows } = await executor.query(
      `SELECT sms.id, sms.staff_id, sms.meeting_date, sms.from_time, sms.to_time, sms.created_at,
              (p.first_name || COALESCE(' ' || p.last_name, '')) AS faculty_name
       FROM staff_meeting_slot sms
       JOIN staff st ON st.id = sms.staff_id
       JOIN person p ON p.id = st.person_id
       WHERE st.person_id IN (
         SELECT ra.person_id FROM role_assignment ra
         JOIN student_enrolment se ON se.section_id = ra.scope_id
         WHERE ra.role_code = 'CLASS_ADVISOR' AND ra.scope_type = 'SECTION' AND ra.status = 'ACTIVE'
           AND se.student_id = $1 AND se.status = 'ACTIVE'
           AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
         UNION
         SELECT st2.person_id FROM subject_offering so
         JOIN staff st2 ON st2.id = so.teacher_staff_id AND st2.status = 'ACTIVE'
         JOIN student_enrolment se2 ON se2.section_id = so.section_id
         WHERE so.status = 'ACTIVE' AND se2.student_id = $1 AND se2.status = 'ACTIVE'
           AND se2.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       )
       ORDER BY sms.meeting_date, sms.from_time`,
      [studentId],
    );
    return rows.map((r: any) => ({
      id: r.id,
      staffId: r.staff_id,
      meetingDate: r.meeting_date,
      fromTime: r.from_time,
      toTime: r.to_time,
      createdAt: r.created_at,
      facultyName: r.faculty_name,
    }));
  }

  async findSlotsForStaff(
    staffId: string,
    executor: Queryable = this.postgres,
  ): Promise<MeetingSlotRow[]> {
    const { rows } = await executor.query(
      `SELECT id, staff_id, meeting_date, from_time, to_time, created_at
       FROM staff_meeting_slot WHERE staff_id = $1 ORDER BY meeting_date, from_time`,
      [staffId],
    );
    return rows.map((r: any) => ({
      id: r.id,
      staffId: r.staff_id,
      meetingDate: r.meeting_date,
      fromTime: r.from_time,
      toTime: r.to_time,
      createdAt: r.created_at,
    }));
  }

  async findSlotById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<MeetingSlotRow | null> {
    const { rows } = await executor.query(
      `SELECT id, staff_id, meeting_date, from_time, to_time, created_at FROM staff_meeting_slot WHERE id = $1`,
      [id],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      staffId: r.staff_id,
      meetingDate: r.meeting_date,
      fromTime: r.from_time,
      toTime: r.to_time,
      createdAt: r.created_at,
    };
  }

  async createSlot(
    input: {
      staffId: string;
      meetingDate: string;
      fromTime: string;
      toTime: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO staff_meeting_slot (staff_id, meeting_date, from_time, to_time) VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.staffId, input.meetingDate, input.fromTime, input.toTime],
    );
    return rows[0].id;
  }

  async updateSlot(
    id: string,
    input: Partial<{ meetingDate: string; fromTime: string; toTime: string }>,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.meetingDate !== undefined)
      push('meeting_date', input.meetingDate);
    if (input.fromTime !== undefined) push('from_time', input.fromTime);
    if (input.toTime !== undefined) push('to_time', input.toTime);
    if (sets.length === 0) return;
    params.push(id);
    await executor.query(
      `UPDATE staff_meeting_slot SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
      params,
    );
  }

  /** Cascades to staff_meeting_booking automatically (ON DELETE CASCADE). */
  async deleteSlot(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(`DELETE FROM staff_meeting_slot WHERE id = $1`, [id]);
  }

  async findBookingsForSlots(
    slotIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<MeetingBookingRow[]> {
    if (slotIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT ${BOOKING_COLUMNS} ${BOOKING_FROM} WHERE b.slot_id = ANY($1) ORDER BY b.created_at DESC`,
      [slotIds],
    );
    return rows.map(mapBooking);
  }

  async findBookingById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<MeetingBookingRow | null> {
    const { rows } = await executor.query(
      `SELECT ${BOOKING_COLUMNS} ${BOOKING_FROM} WHERE b.id = $1`,
      [id],
    );
    return rows.length ? mapBooking(rows[0]) : null;
  }

  async setBookingDecision(
    id: string,
    state: 'APPROVED' | 'REJECTED',
    decidedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE staff_meeting_booking SET state = $2, decided_by = $3, decided_at = now(), updated_at = now() WHERE id = $1`,
      [id, state, decidedBy],
    );
  }

  /** Minimal creation path (see file header note) -- real ACTIVE guardian
   * only, and only for a student this exact faculty actually teaches or
   * advises (the slot's own scope boundary, enforced here not just assumed). */
  async isActiveGuardian(
    personId: string,
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM guardian_link WHERE person_id = $1 AND student_id = $2 AND status = 'ACTIVE'`,
      [personId, studentId],
    );
    return rows.length > 0;
  }

  async createBooking(
    input: {
      slotId: string;
      studentId: string;
      requestedBy: string;
      notes: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO staff_meeting_booking (slot_id, student_id, requested_by, notes) VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.slotId, input.studentId, input.requestedBy, input.notes],
    );
    return rows[0].id;
  }
}

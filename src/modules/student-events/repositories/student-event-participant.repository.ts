// One row per student added to an event = one permission request. Real
// student/section/class-teacher joins throughout -- nothing here is free text.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface ParticipantRow {
  id: string;
  eventId: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  rollNo: number | null;
  gradeName: string | null;
  sectionName: string | null;
  state: string;
  decidedByPersonId: string | null;
  decidedAt: Date | null;
  signatureObjectKey: string | null;
  addedBy: string;
  addedAt: Date;
  updatedAt: Date;
}

function mapRow(row: any): ParticipantRow {
  return {
    id: row.id,
    eventId: row.event_id,
    studentId: row.student_id,
    studentName: [row.first_name, row.last_name].filter(Boolean).join(' '),
    admissionNo: row.admission_no,
    rollNo: row.roll_no,
    gradeName: row.grade_name,
    sectionName: row.section_name,
    state: row.state,
    decidedByPersonId: row.decided_by_person_id,
    decidedAt: row.decided_at,
    signatureObjectKey: row.signature_object_key,
    addedBy: row.added_by,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = `
  ep.id, ep.event_id, ep.student_id, ep.state, ep.decided_by_person_id, ep.decided_at,
  ep.signature_object_key, ep.added_by, ep.added_at, ep.updated_at,
  p.first_name, p.last_name, s.admission_no,
  se.roll_no, g.name AS grade_name, sec.name AS section_name`;

const FROM = `
  FROM student_event_participant ep
  JOIN student s ON s.id = ep.student_id
  JOIN person p ON p.id = s.person_id
  LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
    AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id`;

export interface LetterData {
  participantId: string;
  state: string;
  decidedAt: Date | null;
  signatureObjectKey: string | null;
  eventName: string;
  eventLocation: string;
  eventPurpose: string;
  eventStartsAt: Date;
  eventEndsAt: Date;
  monitoringTeacherName: string;
  monitoringTeacherDesignation: string | null;
  studentName: string;
  admissionNo: string;
  rollNo: number | null;
  gradeName: string | null;
  sectionName: string | null;
  classTeacherName: string | null;
  parentName: string | null;
  parentAddressLine1: string | null;
  parentAddressLine2: string | null;
  parentCity: string | null;
  parentState: string | null;
  parentPincode: string | null;
}

function mapLetterRow(row: any): LetterData {
  return {
    participantId: row.participant_id,
    state: row.state,
    decidedAt: row.decided_at,
    signatureObjectKey: row.signature_object_key,
    eventName: row.event_name,
    eventLocation: row.event_location,
    eventPurpose: row.event_purpose,
    eventStartsAt: row.event_starts_at,
    eventEndsAt: row.event_ends_at,
    monitoringTeacherName: [row.teacher_first_name, row.teacher_last_name].filter(Boolean).join(' '),
    monitoringTeacherDesignation: row.teacher_designation,
    studentName: [row.student_first_name, row.student_last_name].filter(Boolean).join(' '),
    admissionNo: row.admission_no,
    rollNo: row.roll_no,
    gradeName: row.grade_name,
    sectionName: row.section_name,
    classTeacherName: row.class_teacher_first_name
      ? [row.class_teacher_first_name, row.class_teacher_last_name].filter(Boolean).join(' ')
      : null,
    parentName: row.parent_first_name ? [row.parent_first_name, row.parent_last_name].filter(Boolean).join(' ') : null,
    parentAddressLine1: row.parent_address_line1,
    parentAddressLine2: row.parent_address_line2,
    parentCity: row.parent_city,
    parentState: row.parent_state,
    parentPincode: row.parent_pincode,
  };
}

@Injectable()
export class StudentEventParticipantRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: { eventId: string; studentId: string; addedBy: string },
    executor: Queryable = this.postgres,
  ): Promise<ParticipantRow> {
    const { rows } = await executor.query(
      `INSERT INTO student_event_participant (event_id, student_id, added_by) VALUES ($1, $2, $3) RETURNING id`,
      [input.eventId, input.studentId, input.addedBy],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findByEventId(eventId: string, executor: Queryable = this.postgres): Promise<ParticipantRow[]> {
    const { rows } = await executor.query(`${`SELECT ${COLUMNS}`} ${FROM} WHERE ep.event_id = $1 ORDER BY ep.added_at`, [eventId]);
    return rows.map(mapRow);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<ParticipantRow | null> {
    const { rows } = await executor.query(`${`SELECT ${COLUMNS}`} ${FROM} WHERE ep.id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<{ id: string; eventId: string; studentId: string; state: string } | null> {
    const { rows } = await executor.query(
      `SELECT id, event_id AS "eventId", student_id AS "studentId", state FROM student_event_participant WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Every permission request across every ACTIVE guardian link this parent
   * (personId) actually holds -- the real authorization boundary: a parent only
   * ever sees requests for a student they hold a real, ACTIVE guardian_link to,
   * mirroring GuardianLinkRepository.findActiveLink's own boundary comment. */
  async findForGuardian(personId: string, executor: Queryable = this.postgres): Promise<(ParticipantRow & { eventName: string })[]> {
    // Aliased "stev" (not "se") for student_event -- FROM already uses "se" for
    // student_enrolment; reusing it here for a second, different table is a
    // real Postgres error ("table name specified more than once"), not just a
    // style choice.
    const { rows } = await executor.query(
      `SELECT ${COLUMNS}, stev.name AS event_name
       ${FROM}
       JOIN guardian_link gl ON gl.student_id = ep.student_id AND gl.person_id = $1 AND gl.status = 'ACTIVE'
       JOIN student_event stev ON stev.id = ep.event_id
       ORDER BY ep.added_at DESC`,
      [personId],
    );
    return rows.map((r: any) => ({ ...mapRow(r), eventName: r.event_name }));
  }

  /** The one real ACTIVE guardian_link row proving this parent may act on this
   * exact participant's student -- checked before every parent-side action. */
  async findGuardianAccess(
    personId: string,
    participantId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ accessLevel: string } | null> {
    const { rows } = await executor.query(
      `SELECT gl.access_level AS "accessLevel"
       FROM student_event_participant ep
       JOIN guardian_link gl ON gl.student_id = ep.student_id AND gl.person_id = $1 AND gl.status = 'ACTIVE'
       WHERE ep.id = $2`,
      [personId, participantId],
    );
    return rows[0] ?? null;
  }

  async setDecision(
    id: string,
    input: { state: 'APPROVED' | 'REJECTED'; decidedByPersonId: string; signatureObjectKey: string | null },
    executor: Queryable,
  ): Promise<ParticipantRow> {
    await executor.query(
      `UPDATE student_event_participant
       SET state = $2, decided_by_person_id = $3, decided_at = now(), signature_object_key = $4, updated_at = now()
       WHERE id = $1`,
      [id, input.state, input.decidedByPersonId, input.signatureObjectKey],
    );
    return (await this.findById(id, executor))!;
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM student_event_participant WHERE id = $1`, [id]);
  }

  /** Every real field the permission letter needs, in one query: event details,
   * monitoring teacher (staff/person), student (person/enrolment/section/grade),
   * the section's real CLASS_ADVISOR (role_assignment, SECTION-scoped, ACTIVE --
   * see 0007_student_events.sql's own header note) for the letter's "From" line,
   * and the deciding parent's own person/address for the letter's "To" line
   * (never an arbitrary guardian -- specifically whichever parent actually
   * signed). Only meaningful once state <> 'PENDING'. */
  async findLetterData(id: string, executor: Queryable = this.postgres): Promise<LetterData | null> {
    const { rows } = await executor.query(
      `SELECT
         ep.id AS participant_id, ep.state, ep.decided_at, ep.signature_object_key,
         se.name AS event_name, se.location AS event_location, se.purpose AS event_purpose,
         se.starts_at AS event_starts_at, se.ends_at AS event_ends_at,
         tp.first_name AS teacher_first_name, tp.last_name AS teacher_last_name, st.designation AS teacher_designation,
         sp.first_name AS student_first_name, sp.last_name AS student_last_name,
         stu.admission_no, senr.roll_no, g.name AS grade_name, sec.name AS section_name,
         ctp.first_name AS class_teacher_first_name, ctp.last_name AS class_teacher_last_name,
         pp.first_name AS parent_first_name, pp.last_name AS parent_last_name,
         pp.address_line1 AS parent_address_line1, pp.address_line2 AS parent_address_line2,
         pp.city AS parent_city, pp.state AS parent_state, pp.pincode AS parent_pincode
       FROM student_event_participant ep
       JOIN student_event se ON se.id = ep.event_id
       JOIN person tp ON tp.id = se.monitoring_teacher_person_id
       LEFT JOIN staff st ON st.person_id = tp.id
       JOIN student stu ON stu.id = ep.student_id
       JOIN person sp ON sp.id = stu.person_id
       LEFT JOIN student_enrolment senr ON senr.student_id = stu.id AND senr.status = 'ACTIVE'
         AND senr.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       LEFT JOIN section sec ON sec.id = senr.section_id
       LEFT JOIN grade g ON g.id = sec.grade_id
       LEFT JOIN role_assignment ra ON ra.role_code = 'CLASS_ADVISOR' AND ra.scope_type = 'SECTION'
         AND ra.scope_id = sec.id AND ra.status = 'ACTIVE'
       LEFT JOIN person ctp ON ctp.id = ra.person_id
       LEFT JOIN person pp ON pp.id = ep.decided_by_person_id
       WHERE ep.id = $1`,
      [id],
    );
    return rows.length ? mapLetterRow(rows[0]) : null;
  }
}

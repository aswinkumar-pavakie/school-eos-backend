// Health In-charge: the queries behind the console (student lookup, health-profile
// upsert, recording an infirmary visit, alert acknowledgement, escalation log,
// dashboard counts). All five tables already exist -- no schema changes. Reads of
// visits / alerts / escalations / consents reuse HealthRepository.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface StudentLookupRow {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string | null;
  gradeName: string | null;
  sectionName: string | null;
  bloodGroup: string | null;
  hasProfile: boolean;
}

export interface VisitBasics {
  id: string;
  studentId: string;
  action: string;
  complaint: string;
  parentNotifiedAt: Date | null;
}

export interface HealthDashboardCounts {
  visitsToday: number;
  visitsThisWeek: number;
  needsParentNotice: number;
  openAlerts: number;
  escalationsThisWeek: number;
  profilesWithoutBloodGroup: number;
}

export interface ProfileInput {
  bloodGroup: string | null;
  heightCm: number | null;
  weightKg: number | null;
  measuredOn: string | null;
  familyDoctor: string | null;
  doctorPhone: string | null;
  insuranceRef: string | null;
  notes: string | null;
}

export interface VisitInput {
  studentId: string;
  complaint: string;
  vitals: Record<string, unknown> | null;
  observation: string | null;
  action: string;
  outcome: string | null;
}

const CURRENT_YEAR = `(SELECT id FROM academic_year WHERE is_current LIMIT 1)`;
// "Today" and "this week" are the SCHOOL's (India) calendar days, not the database's UTC ones --
// otherwise a visit at 9 pm would be counted on the wrong day.
const SCHOOL_TZ = `'Asia/Kolkata'`;
const LOCAL_DAY = (col: string) => `(${col} AT TIME ZONE ${SCHOOL_TZ})::date`;
const TODAY = `(now() AT TIME ZONE ${SCHOOL_TZ})::date`;
const WEEK_START = `date_trunc('week', now() AT TIME ZONE ${SCHOOL_TZ})::date`;

@Injectable()
export class HealthInchargeRepository {
  constructor(private readonly postgres: PostgresService) {}

  async dashboardCounts(executor: Queryable = this.postgres): Promise<HealthDashboardCounts> {
    const { rows } = await executor.query<Record<string, string>>(
      `SELECT
         (SELECT count(*) FROM infirmary_visit WHERE ${LOCAL_DAY('visited_at')} = ${TODAY}) AS visits_today,
         (SELECT count(*) FROM infirmary_visit WHERE ${LOCAL_DAY('visited_at')} >= ${WEEK_START}) AS visits_week,
         (SELECT count(*) FROM infirmary_visit
           WHERE parent_notified_at IS NULL AND action IN ('SENT_HOME', 'REFERRED', 'SICKBAY_ADMIT')) AS needs_notice,
         (SELECT count(*) FROM health_alert WHERE acknowledged_at IS NULL) AS open_alerts,
         (SELECT count(*) FROM medical_escalation WHERE ${LOCAL_DAY('contacted_at')} >= ${WEEK_START}) AS esc_week,
         (SELECT count(*) FROM health_profile WHERE blood_group IS NULL) AS no_blood_group`,
    );
    const r = rows[0];
    return {
      visitsToday: parseInt(r.visits_today, 10),
      visitsThisWeek: parseInt(r.visits_week, 10),
      needsParentNotice: parseInt(r.needs_notice, 10),
      openAlerts: parseInt(r.open_alerts, 10),
      escalationsThisWeek: parseInt(r.esc_week, 10),
      profilesWithoutBloodGroup: parseInt(r.no_blood_group, 10),
    };
  }

  /** Active students only, current-year class, matching name / admission number. */
  async searchStudents(
    search: string | undefined,
    limit: number,
    executor: Queryable = this.postgres,
  ): Promise<StudentLookupRow[]> {
    const params: unknown[] = [];
    let where = `WHERE s.status = 'ACTIVE'`;
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      where += ` AND (p.first_name ILIKE $1 OR p.last_name ILIKE $1 OR s.admission_no ILIKE $1
                      OR (p.first_name || ' ' || COALESCE(p.last_name, '')) ILIKE $1)`;
    }
    params.push(limit);
    const { rows } = await executor.query<StudentLookupRow>(
      `SELECT s.id AS "studentId", s.admission_no AS "admissionNo", p.first_name AS "firstName",
              p.last_name AS "lastName", g.name AS "gradeName", sec.name AS "sectionName",
              hp.blood_group AS "bloodGroup", (hp.id IS NOT NULL) AS "hasProfile"
       FROM student s
       JOIN person p ON p.id = s.person_id
       LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
         AND se.academic_year_id = ${CURRENT_YEAR}
       LEFT JOIN section sec ON sec.id = se.section_id
       LEFT JOIN grade g ON g.id = sec.grade_id
       LEFT JOIN health_profile hp ON hp.student_id = s.id
       ${where}
       ORDER BY p.first_name, p.last_name
       LIMIT $${params.length}`,
      params,
    );
    return rows;
  }

  /** The student's name + class if they are an ACTIVE student, else null. */
  async findActiveStudent(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ studentId: string; firstName: string; lastName: string | null; gradeName: string | null; sectionName: string | null; admissionNo: string } | null> {
    const { rows } = await executor.query(
      `SELECT s.id AS "studentId", p.first_name AS "firstName", p.last_name AS "lastName",
              g.name AS "gradeName", sec.name AS "sectionName", s.admission_no AS "admissionNo"
       FROM student s
       JOIN person p ON p.id = s.person_id
       LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
         AND se.academic_year_id = ${CURRENT_YEAR}
       LEFT JOIN section sec ON sec.id = se.section_id
       LEFT JOIN grade g ON g.id = sec.grade_id
       WHERE s.id = $1 AND s.status = 'ACTIVE'`,
      [studentId],
    );
    return rows[0] ?? null;
  }

  async upsertProfile(
    studentId: string,
    input: ProfileInput,
    updatedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO health_profile
         (student_id, blood_group, height_cm, weight_kg, measured_on, family_doctor,
          doctor_phone, insurance_ref, notes, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (student_id) DO UPDATE SET
         blood_group = EXCLUDED.blood_group, height_cm = EXCLUDED.height_cm,
         weight_kg = EXCLUDED.weight_kg, measured_on = EXCLUDED.measured_on,
         family_doctor = EXCLUDED.family_doctor, doctor_phone = EXCLUDED.doctor_phone,
         insurance_ref = EXCLUDED.insurance_ref, notes = EXCLUDED.notes,
         updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [
        studentId,
        input.bloodGroup,
        input.heightCm,
        input.weightKg,
        input.measuredOn,
        input.familyDoctor,
        input.doctorPhone,
        input.insuranceRef,
        input.notes,
        updatedBy,
      ],
    );
  }

  /** is_hosteller is derived from the student's live hostel bed, never trusted from input. */
  async createVisit(
    input: VisitInput,
    attendedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO infirmary_visit
         (student_id, visited_at, complaint, vitals, observation, action, attended_by, outcome, is_hosteller)
       VALUES ($1, now(), $2, $3, $4, $5, $6, $7,
               EXISTS (SELECT 1 FROM hostel_allocation ha WHERE ha.student_id = $1 AND ha.status = 'ACTIVE'))
       RETURNING id`,
      [
        input.studentId,
        input.complaint,
        input.vitals ? JSON.stringify(input.vitals) : null,
        input.observation,
        input.action,
        attendedBy,
        input.outcome,
      ],
    );
    return rows[0].id;
  }

  async findVisitBasics(id: string, executor: Queryable = this.postgres): Promise<VisitBasics | null> {
    const { rows } = await executor.query<VisitBasics>(
      `SELECT id, student_id AS "studentId", action, complaint, parent_notified_at AS "parentNotifiedAt"
       FROM infirmary_visit WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async updateVisit(
    id: string,
    patch: { observation?: string; outcome?: string; action?: string },
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      `UPDATE infirmary_visit SET
         observation = COALESCE($2, observation),
         outcome = COALESCE($3, outcome),
         action = COALESCE($4, action)
       WHERE id = $1`,
      [id, patch.observation ?? null, patch.outcome ?? null, patch.action ?? null],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Only the first notice counts; a second call finds nothing to update. */
  async markParentNotified(id: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rowCount } = await executor.query(
      `UPDATE infirmary_visit SET parent_notified_at = now() WHERE id = $1 AND parent_notified_at IS NULL`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  /** One in-app notification per ACTIVE guardian of the student, in one statement.
   * Returns how many guardians were told (0 = no guardian on file). */
  async notifyGuardians(visitId: string, executor: Queryable = this.postgres): Promise<number> {
    const { rowCount } = await executor.query(
      `INSERT INTO notification
         (person_id, about_student_id, notification_type, title, body, related_object_type, related_object_id, is_emergency)
       SELECT DISTINCT gl.person_id, s.id, 'INFIRMARY_VISIT', 'Infirmary visit',
              sp.first_name || ' visited the infirmary: ' || iv.complaint || '. ' ||
              CASE iv.action
                WHEN 'SENT_HOME' THEN 'Please collect ' || sp.first_name || ' from school.'
                WHEN 'REFERRED' THEN sp.first_name || ' has been referred for medical attention.'
                WHEN 'SICKBAY_ADMIT' THEN sp.first_name || ' is resting in the sickbay.'
                WHEN 'MEDICATION' THEN 'Medication was given.'
                ELSE 'No further action is needed.'
              END,
              'infirmary_visit', iv.id::text,
              (iv.action IN ('REFERRED', 'SICKBAY_ADMIT', 'SENT_HOME'))
       FROM infirmary_visit iv
       JOIN student s ON s.id = iv.student_id
       JOIN person sp ON sp.id = s.person_id
       JOIN guardian_link gl ON gl.student_id = s.id AND gl.status = 'ACTIVE'
       WHERE iv.id = $1`,
      [visitId],
    );
    return rowCount ?? 0;
  }

  /** false = no such alert, or it was already acknowledged. */
  async acknowledgeAlert(id: string, personId: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rowCount } = await executor.query(
      `UPDATE health_alert SET acknowledged_by = $2, acknowledged_at = now()
       WHERE id = $1::bigint AND acknowledged_at IS NULL`,
      [id, personId],
    );
    return (rowCount ?? 0) > 0;
  }

  async alertExists(id: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rows } = await executor.query(`SELECT 1 FROM health_alert WHERE id = $1::bigint`, [id]);
    return rows.length > 0;
  }

  /** Serialises concurrent contacts about the same visit so sequence numbers never repeat. */
  async lockEscalationThread(visitId: string, executor: Queryable): Promise<void> {
    await executor.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['escalation:' + visitId]);
  }

  async createEscalation(
    input: {
      visitId: string;
      studentId: string;
      contactedName: string;
      channel: string;
      response: string | null;
      outcome: string | null;
    },
    executor: Queryable,
  ): Promise<number> {
    const { rows } = await executor.query<{ seq: number }>(
      `INSERT INTO medical_escalation
         (source_type, source_id, student_id, sequence_no, contacted_name, contacted_at, channel, response, outcome)
       VALUES ('VISIT', $1, $2,
               (SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM medical_escalation
                 WHERE source_type = 'VISIT' AND source_id = $1),
               $3, now(), $4, $5, $6)
       RETURNING sequence_no AS seq`,
      [input.visitId, input.studentId, input.contactedName, input.channel, input.response, input.outcome],
    );
    return rows[0].seq;
  }
}

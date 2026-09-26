// Health & Infirmary -- health_profile, infirmary_visit, health_alert,
// medical_escalation, emergency_treatment_consent. All five tables already
// existed live in the DB (1,120 health profiles, 200 infirmary visits, 10
// alerts, 10 escalations, 1,120 consents), fully populated -- pure
// application code, no schema changes. Real data owner is the HEALTH_INCHARGE
// role (see the `role` table), which has no web/mobile login built yet (a
// separate future build, same status as Faculty/Parent/Hostel Warden mobile --
// see the project's own mobile-deferred note); this module is Admin/
// Principal/Vice Principal read-only oversight only, same convention as every
// other module this session (Transport, Library, Hostel...). Writing a new
// infirmary visit, alert, or escalation stays out of scope until that
// dedicated role has its own real login.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface HealthProfileRow {
  id: string;
  studentId: string;
  bloodGroup: string | null;
  heightCm: string | null;
  weightKg: string | null;
  measuredOn: string | null;
  familyDoctor: string | null;
  doctorPhone: string | null;
  insuranceRef: string | null;
  notes: string | null;
  updatedAt: Date;
}

export interface InfirmaryVisitRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  visitedAt: Date;
  complaint: string;
  vitals: Record<string, unknown> | null;
  observation: string | null;
  action: string;
  attendedByFirstName: string | null;
  attendedByLastName: string | null;
  parentNotifiedAt: Date | null;
  outcome: string | null;
  isHosteller: boolean;
}

export interface HealthAlertRow {
  id: string;
  alertType: string;
  scopeType: string | null;
  scopeId: string | null;
  studentId: string | null;
  studentFirstName: string | null;
  studentLastName: string | null;
  detectedAt: Date;
  detail: Record<string, unknown> | null;
  acknowledgedByFirstName: string | null;
  acknowledgedByLastName: string | null;
  acknowledgedAt: Date | null;
}

export interface MedicalEscalationRow {
  id: string;
  sourceType: string;
  sourceId: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  sequenceNo: number;
  contactedName: string | null;
  contactedAt: Date;
  channel: string | null;
  response: string | null;
  outcome: string | null;
}

export interface EmergencyConsentRow {
  id: string;
  studentId: string;
  guardianFirstName: string | null;
  guardianLastName: string | null;
  scope: string;
  consentGivenAt: Date;
  validUntil: string | null;
  documentKey: string | null;
}

const STUDENT_JOIN = `
  JOIN person sp ON sp.id = s2.person_id
  LEFT JOIN student_enrolment se ON se.student_id = s2.id AND se.status = 'ACTIVE'
    AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id`;

@Injectable()
export class HealthRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findProfileByStudentId(studentId: string, executor: Queryable = this.postgres): Promise<HealthProfileRow | null> {
    const { rows } = await executor.query<HealthProfileRow>(
      `SELECT id, student_id AS "studentId", blood_group AS "bloodGroup", height_cm AS "heightCm",
         weight_kg AS "weightKg", measured_on AS "measuredOn", family_doctor AS "familyDoctor",
         doctor_phone AS "doctorPhone", insurance_ref AS "insuranceRef", notes, updated_at AS "updatedAt"
       FROM health_profile WHERE student_id = $1`,
      [studentId],
    );
    return rows[0] ?? null;
  }

  async findConsentsByStudentId(studentId: string, executor: Queryable = this.postgres): Promise<EmergencyConsentRow[]> {
    const { rows } = await executor.query<EmergencyConsentRow>(
      `SELECT etc.id, etc.student_id AS "studentId", gp.first_name AS "guardianFirstName",
         gp.last_name AS "guardianLastName", etc.scope, etc.consent_given_at AS "consentGivenAt",
         etc.valid_until AS "validUntil", etc.document_key AS "documentKey"
       FROM emergency_treatment_consent etc
       JOIN person gp ON gp.id = etc.guardian_person_id
       WHERE etc.student_id = $1
       ORDER BY etc.consent_given_at DESC`,
      [studentId],
    );
    return rows;
  }

  async findInfirmaryVisits(
    filter: {
      studentId?: string;
      action?: string;
      limit?: number;
      /** Optional extras (used by the Health In-charge console). All additive. */
      id?: string;
      from?: string;
      to?: string;
      needsParentNotice?: boolean;
    },
    executor: Queryable = this.postgres,
  ): Promise<InfirmaryVisitRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.studentId) {
      params.push(filter.studentId);
      conditions.push(`iv.student_id = $${params.length}`);
    }
    if (filter.action) {
      params.push(filter.action);
      conditions.push(`iv.action = $${params.length}`);
    }
    if (filter.id) {
      params.push(filter.id);
      conditions.push(`iv.id = $${params.length}`);
    }
    if (filter.from) {
      params.push(filter.from);
      conditions.push(`iv.visited_at >= ($${params.length}::date)::timestamp AT TIME ZONE 'Asia/Kolkata'`);
    }
    if (filter.to) {
      params.push(filter.to);
      conditions.push(`iv.visited_at < (($${params.length}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`);
    }
    if (filter.needsParentNotice) {
      conditions.push(`iv.parent_notified_at IS NULL AND iv.action IN ('SENT_HOME', 'REFERRED', 'SICKBAY_ADMIT')`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const { rows } = await executor.query<InfirmaryVisitRow>(
      `SELECT iv.id, iv.student_id AS "studentId", sp.first_name AS "studentFirstName",
         sp.last_name AS "studentLastName", s2.admission_no AS "admissionNo",
         g.name AS "gradeName", sec.name AS "sectionName",
         iv.visited_at AS "visitedAt", iv.complaint, iv.vitals, iv.observation, iv.action,
         ap.first_name AS "attendedByFirstName", ap.last_name AS "attendedByLastName",
         iv.parent_notified_at AS "parentNotifiedAt", iv.outcome, iv.is_hosteller AS "isHosteller"
       FROM infirmary_visit iv
       JOIN student s2 ON s2.id = iv.student_id
       ${STUDENT_JOIN}
       LEFT JOIN person ap ON ap.id = iv.attended_by
       ${where}
       ORDER BY iv.visited_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows;
  }

  async findAlerts(
    filter: { acknowledged?: boolean; limit?: number },
    executor: Queryable = this.postgres,
  ): Promise<HealthAlertRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.acknowledged !== undefined) {
      conditions.push(filter.acknowledged ? `ha.acknowledged_at IS NOT NULL` : `ha.acknowledged_at IS NULL`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const { rows } = await executor.query<HealthAlertRow>(
      `SELECT ha.id::text, ha.alert_type AS "alertType", ha.scope_type AS "scopeType", ha.scope_id AS "scopeId",
         ha.student_id AS "studentId", sp.first_name AS "studentFirstName", sp.last_name AS "studentLastName",
         ha.detected_at AS "detectedAt", ha.detail,
         acp.first_name AS "acknowledgedByFirstName", acp.last_name AS "acknowledgedByLastName",
         ha.acknowledged_at AS "acknowledgedAt"
       FROM health_alert ha
       LEFT JOIN student s2 ON s2.id = ha.student_id
       LEFT JOIN person sp ON sp.id = s2.person_id
       LEFT JOIN person acp ON acp.id = ha.acknowledged_by
       ${where}
       ORDER BY ha.detected_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows;
  }

  async findEscalations(
    filter: { studentId?: string; limit?: number },
    executor: Queryable = this.postgres,
  ): Promise<MedicalEscalationRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.studentId) {
      params.push(filter.studentId);
      conditions.push(`me.student_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const { rows } = await executor.query<MedicalEscalationRow>(
      `SELECT me.id::text, me.source_type AS "sourceType", me.source_id AS "sourceId",
         me.student_id AS "studentId", sp.first_name AS "studentFirstName", sp.last_name AS "studentLastName",
         me.sequence_no AS "sequenceNo", me.contacted_name AS "contactedName", me.contacted_at AS "contactedAt",
         me.channel, me.response, me.outcome
       FROM medical_escalation me
       JOIN student s2 ON s2.id = me.student_id
       JOIN person sp ON sp.id = s2.person_id
       ${where}
       ORDER BY me.contacted_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows;
  }
}

// Student Development -- achievement, merit_point, observation,
// discipline_incident. All four tables already existed live in the DB (4
// achievements, 200 merit points, 100 observations, 30 discipline incidents)
// with no API in front of them until now -- pure application code, no schema
// changes. `observation.visibility` is a real privacy scope
// (ADVISOR_ONLY/LEADERSHIP/PARENT) -- Admin/Principal/Vice Principal oversight
// only ever sees LEADERSHIP/PARENT rows, never ADVISOR_ONLY (a class advisor's
// private note, and Faculty has no web login to view it here either -- mobile
// only, a separate future build).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface AchievementRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  title: string;
  level: string;
  awardedOn: string;
  sourceDomain: string | null;
  certificateKey: string | null;
  createdAt: Date;
}

export interface MeritPointRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  houseId: string | null;
  houseName: string | null;
  points: number;
  reason: string;
  awardedByFirstName: string | null;
  awardedByLastName: string | null;
  awardedAt: Date;
}

export interface ObservationRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  subjectName: string | null;
  observationText: string;
  visibility: string;
  recordedByFirstName: string | null;
  recordedByLastName: string | null;
  createdAt: Date;
}

export interface DisciplineIncidentRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  incidentDate: string;
  severity: string;
  category: string | null;
  description: string;
  reportedByFirstName: string | null;
  reportedByLastName: string | null;
  actionTaken: string | null;
  parentNotifiedAt: Date | null;
  state: string;
  createdAt: Date;
}

export interface CreateAchievementInput {
  studentId: string;
  title: string;
  level: string;
  awardedOn: string;
  sourceDomain?: string | null;
}

export interface CreateMeritPointInput {
  studentId: string;
  houseId?: string | null;
  points: number;
  reason: string;
  awardedBy: string;
}

export interface CreateDisciplineIncidentInput {
  studentId: string;
  incidentDate: string;
  severity: string;
  category?: string | null;
  description: string;
  actionTaken?: string | null;
  reportedBy: string;
}

const CURRENT_SECTION_JOIN = `
  LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
    AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id`;

@Injectable()
export class StudentDevelopmentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findAchievements(
    filter: { studentId?: string; limit?: number },
    executor: Queryable = this.postgres,
  ): Promise<AchievementRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.studentId) {
      params.push(filter.studentId);
      conditions.push(`a.student_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const { rows } = await executor.query<AchievementRow>(
      `SELECT a.id, a.student_id AS "studentId", p.first_name AS "studentFirstName",
         p.last_name AS "studentLastName", s.admission_no AS "admissionNo",
         g.name AS "gradeName", sec.name AS "sectionName",
         a.title, a.level, a.awarded_on AS "awardedOn", a.source_domain AS "sourceDomain",
         a.certificate_key AS "certificateKey", a.created_at AS "createdAt"
       FROM achievement a
       JOIN student s ON s.id = a.student_id
       JOIN person p ON p.id = s.person_id
       ${CURRENT_SECTION_JOIN}
       ${where}
       ORDER BY a.awarded_on DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows;
  }

  async createAchievement(input: CreateAchievementInput, executor: Queryable = this.postgres): Promise<{ id: string }> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO achievement (student_id, title, level, awarded_on, source_domain)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.studentId, input.title, input.level, input.awardedOn, input.sourceDomain ?? null],
    );
    return rows[0];
  }

  async findMeritPoints(
    filter: { studentId?: string; limit?: number },
    executor: Queryable = this.postgres,
  ): Promise<MeritPointRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.studentId) {
      params.push(filter.studentId);
      conditions.push(`mp.student_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const { rows } = await executor.query<MeritPointRow>(
      `SELECT mp.id::text, mp.student_id AS "studentId", p.first_name AS "studentFirstName",
         p.last_name AS "studentLastName", s.admission_no AS "admissionNo",
         g.name AS "gradeName", sec.name AS "sectionName",
         mp.house_id AS "houseId", h.name AS "houseName",
         mp.points, mp.reason,
         ap.first_name AS "awardedByFirstName", ap.last_name AS "awardedByLastName",
         mp.awarded_at AS "awardedAt"
       FROM merit_point mp
       JOIN student s ON s.id = mp.student_id
       JOIN person p ON p.id = s.person_id
       LEFT JOIN house h ON h.id = mp.house_id
       LEFT JOIN person ap ON ap.id = mp.awarded_by
       ${CURRENT_SECTION_JOIN}
       ${where}
       ORDER BY mp.awarded_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows;
  }

  async createMeritPoint(input: CreateMeritPointInput, executor: Queryable = this.postgres): Promise<{ id: string }> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO merit_point (student_id, house_id, points, reason, awarded_by, awarded_at)
       VALUES ($1, $2, $3, $4, $5, now())
       RETURNING id::text`,
      [input.studentId, input.houseId ?? null, input.points, input.reason, input.awardedBy],
    );
    return rows[0];
  }

  async findObservations(
    filter: { studentId?: string; limit?: number },
    executor: Queryable = this.postgres,
  ): Promise<ObservationRow[]> {
    const conditions: string[] = [`o.visibility IN ('LEADERSHIP', 'PARENT')`];
    const params: unknown[] = [];
    if (filter.studentId) {
      params.push(filter.studentId);
      conditions.push(`o.student_id = $${params.length}`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(filter.limit ?? 200);
    const { rows } = await executor.query<ObservationRow>(
      `SELECT o.id, o.student_id AS "studentId", p.first_name AS "studentFirstName",
         p.last_name AS "studentLastName", s.admission_no AS "admissionNo",
         g.name AS "gradeName", sec.name AS "sectionName", sub.name AS "subjectName",
         o.observation_text AS "observationText", o.visibility,
         rp.first_name AS "recordedByFirstName", rp.last_name AS "recordedByLastName",
         o.created_at AS "createdAt"
       FROM observation o
       JOIN student s ON s.id = o.student_id
       JOIN person p ON p.id = s.person_id
       LEFT JOIN person rp ON rp.id = o.recorded_by
       LEFT JOIN subject_offering so ON so.id = o.subject_offering_id
       LEFT JOIN subject sub ON sub.id = so.subject_id
       ${CURRENT_SECTION_JOIN}
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows;
  }

  async findDisciplineIncidents(
    filter: { studentId?: string; state?: string; limit?: number },
    executor: Queryable = this.postgres,
  ): Promise<DisciplineIncidentRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.studentId) {
      params.push(filter.studentId);
      conditions.push(`di.student_id = $${params.length}`);
    }
    if (filter.state) {
      params.push(filter.state);
      conditions.push(`di.state = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const { rows } = await executor.query<DisciplineIncidentRow>(
      `SELECT di.id, di.student_id AS "studentId", p.first_name AS "studentFirstName",
         p.last_name AS "studentLastName", s.admission_no AS "admissionNo",
         g.name AS "gradeName", sec.name AS "sectionName",
         di.incident_date AS "incidentDate", di.severity, di.category, di.description,
         rp.first_name AS "reportedByFirstName", rp.last_name AS "reportedByLastName",
         di.action_taken AS "actionTaken", di.parent_notified_at AS "parentNotifiedAt",
         di.state, di.created_at AS "createdAt"
       FROM discipline_incident di
       JOIN student s ON s.id = di.student_id
       JOIN person p ON p.id = s.person_id
       LEFT JOIN person rp ON rp.id = di.reported_by
       ${CURRENT_SECTION_JOIN}
       ${where}
       ORDER BY di.incident_date DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows;
  }

  async createDisciplineIncident(
    input: CreateDisciplineIncidentInput,
    executor: Queryable = this.postgres,
  ): Promise<{ id: string }> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO discipline_incident
         (student_id, incident_date, severity, category, description, action_taken, reported_by, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')
       RETURNING id`,
      [
        input.studentId,
        input.incidentDate,
        input.severity,
        input.category ?? null,
        input.description,
        input.actionTaken ?? null,
        input.reportedBy,
      ],
    );
    return rows[0];
  }
}

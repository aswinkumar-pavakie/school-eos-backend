// Backs the Sports Admin "Injuries & incidents" screen -- real
// sports_injury_incident table (see migration 0023_sports_injuries.sql), a
// genuine backend gap confirmed by direct audit before this build (the
// only "incident" tables in this schema are discipline-related).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export const INJURY_STATUSES = ['UNDER_CARE', 'OBSERVATION', 'CLOSED'] as const;
export type InjuryStatus = (typeof INJURY_STATUSES)[number];

export interface SportsInjuryRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  gradeName: string | null;
  sectionName: string | null;
  sportId: string | null;
  sportName: string | null;
  title: string;
  description: string | null;
  incidentDate: string;
  guardianInformed: boolean;
  guardianInformedAt: string | null;
  status: InjuryStatus;
  createdAt: string;
}

const COLUMNS = `i.id, i.student_id AS "studentId", p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
  g.name AS "gradeName", sec.name AS "sectionName", i.sport_id AS "sportId", sp.name AS "sportName",
  i.title, i.description, i.incident_date AS "incidentDate", i.guardian_informed AS "guardianInformed",
  i.guardian_informed_at AS "guardianInformedAt", i.status, i.created_at AS "createdAt"`;

// Same current-year-only enrolment join canonical student.repository.ts
// uses (CURRENT_ENROLMENT_JOIN) -- a brand-new admission with no class
// assigned yet is a valid state, not an error, so this stays a LEFT JOIN.
const FROM = `sports_injury_incident i
  JOIN student s ON s.id = i.student_id
  JOIN person p ON p.id = s.person_id
  LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
    AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id
  LEFT JOIN sport sp ON sp.id = i.sport_id`;

@Injectable()
export class SportsInjuryRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      studentId: string;
      sportId?: string;
      title: string;
      description?: string;
      incidentDate: string;
      guardianInformed: boolean;
      createdBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<SportsInjuryRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO sports_injury_incident
         (student_id, sport_id, title, description, incident_date, guardian_informed, guardian_informed_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN now() ELSE NULL END, $7, $7)
       RETURNING id`,
      [
        input.studentId,
        input.sportId ?? null,
        input.title,
        input.description ?? null,
        input.incidentDate,
        input.guardianInformed,
        input.createdBy,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<SportsInjuryRow | null> {
    const { rows } = await executor.query<SportsInjuryRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE i.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findAll(executor: Queryable = this.postgres): Promise<SportsInjuryRow[]> {
    const { rows } = await executor.query<SportsInjuryRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ORDER BY i.incident_date DESC, i.created_at DESC`,
    );
    return rows;
  }

  async updateStatus(
    id: string,
    patch: { status?: InjuryStatus; guardianInformed?: boolean; title?: string; description?: string; incidentDate?: string },
    updatedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<SportsInjuryRow> {
    await executor.query(
      `UPDATE sports_injury_incident SET
         status = COALESCE($2, status),
         guardian_informed = COALESCE($3, guardian_informed),
         guardian_informed_at = CASE WHEN $3 = true AND guardian_informed_at IS NULL THEN now() ELSE guardian_informed_at END,
         title = COALESCE($5, title),
         description = COALESCE($6, description),
         incident_date = COALESCE($7, incident_date),
         updated_by = $4,
         updated_at = now()
       WHERE id = $1`,
      [id, patch.status ?? null, patch.guardianInformed ?? null, updatedBy, patch.title ?? null, patch.description ?? null, patch.incidentDate ?? null],
    );
    return (await this.findById(id, executor))!;
  }

  // No delete route existed before this.
  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM sports_injury_incident WHERE id = $1`, [id]);
  }
}

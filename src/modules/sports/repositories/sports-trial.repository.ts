// Backs the Sports Admin "Trials & selection" screen -- real
// sports_trial table (see migration 0022_sports_trials.sql), a genuine
// backend gap confirmed by direct audit before this build (no
// trial/selection table existed anywhere in this schema).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export const TRIAL_ROUNDS = ['ROUND_1', 'ROUND_2', 'FINAL_ROUND'] as const;
export type TrialRound = (typeof TRIAL_ROUNDS)[number];

export const TRIAL_STATUSES = ['PENDING', 'HOLD', 'SELECTED', 'NOT_SELECTED'] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

export interface SportsTrialRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  gradeName: string | null;
  sectionName: string | null;
  sportId: string;
  sportName: string;
  round: TrialRound;
  trialDate: string;
  score: string | null;
  status: TrialStatus;
  notes: string | null;
  createdAt: string;
}

const COLUMNS = `t.id, t.student_id AS "studentId", p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
  g.name AS "gradeName", sec.name AS "sectionName",
  t.sport_id AS "sportId", sp.name AS "sportName", t.round, t.trial_date AS "trialDate", t.score, t.status, t.notes,
  t.created_at AS "createdAt"`;

// Same current-year-only enrolment join canonical student.repository.ts
// uses (CURRENT_ENROLMENT_JOIN) -- see sports-injury.repository.ts's own
// identical comment.
const FROM = `sports_trial t
  JOIN student s ON s.id = t.student_id
  JOIN person p ON p.id = s.person_id
  LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
    AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id
  JOIN sport sp ON sp.id = t.sport_id`;

@Injectable()
export class SportsTrialRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      studentId: string;
      sportId: string;
      round: TrialRound;
      trialDate: string;
      score?: string;
      notes?: string;
      createdBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<SportsTrialRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO sports_trial (student_id, sport_id, round, trial_date, score, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING id`,
      [
        input.studentId,
        input.sportId,
        input.round,
        input.trialDate,
        input.score ?? null,
        input.notes ?? null,
        input.createdBy,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<SportsTrialRow | null> {
    const { rows } = await executor.query<SportsTrialRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE t.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findAll(executor: Queryable = this.postgres): Promise<SportsTrialRow[]> {
    const { rows } = await executor.query<SportsTrialRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ORDER BY t.trial_date DESC, t.created_at DESC`,
    );
    return rows;
  }

  async updateStatusAndScore(
    id: string,
    patch: { status?: TrialStatus; score?: string; notes?: string; round?: TrialRound; trialDate?: string },
    updatedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<SportsTrialRow> {
    await executor.query(
      `UPDATE sports_trial SET
         status = COALESCE($2, status),
         score = COALESCE($3, score),
         notes = COALESCE($4, notes),
         round = COALESCE($5, round),
         trial_date = COALESCE($6, trial_date),
         updated_by = $7,
         updated_at = now()
       WHERE id = $1`,
      [id, patch.status ?? null, patch.score ?? null, patch.notes ?? null, patch.round ?? null, patch.trialDate ?? null, updatedBy],
    );
    return (await this.findById(id, executor))!;
  }

  // No delete route existed before this -- confirmed no CANCELLED-style
  // status exists on sports_trial either, so a hard delete is the only real
  // removal path.
  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM sports_trial WHERE id = $1`, [id]);
  }
}

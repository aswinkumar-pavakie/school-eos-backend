// Backs both the Sports Admin "Entry results" screen (create + list) and
// "Result verification" screen (the same rows filtered to PENDING, with a
// verify/reject action) -- real sports_result_entry table (see migration
// 0026_sports_practice_results_selection_substitute.sql), a genuine
// backend gap confirmed by direct audit before this build. Deliberately
// separate from fixture_result (team-level win/loss/score) -- this is
// per-athlete, per-event.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export const RESULT_ENTRY_STATUSES = ['DRAFT', 'PENDING', 'VERIFIED', 'REJECTED'] as const;
export type ResultEntryStatus = (typeof RESULT_ENTRY_STATUSES)[number];

export interface ResultEntryRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  sportId: string;
  sportName: string;
  tournamentId: string | null;
  tournamentName: string | null;
  eventName: string;
  resultValue: string;
  position: string | null;
  status: ResultEntryStatus;
  verifiedByName: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

const COLUMNS = `re.id, re.student_id AS "studentId", p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
  re.sport_id AS "sportId", sp.name AS "sportName", re.tournament_id AS "tournamentId", tn.name AS "tournamentName",
  re.event_name AS "eventName", re.result_value AS "resultValue", re.position, re.status,
  vp.first_name || COALESCE(' ' || vp.last_name, '') AS "verifiedByName",
  re.verified_at AS "verifiedAt", re.created_at AS "createdAt"`;
const FROM = `sports_result_entry re
  JOIN student s ON s.id = re.student_id
  JOIN person p ON p.id = s.person_id
  JOIN sport sp ON sp.id = re.sport_id
  LEFT JOIN tournament tn ON tn.id = re.tournament_id
  LEFT JOIN person vp ON vp.id = re.verified_by`;

@Injectable()
export class SportsResultEntryRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      studentId: string;
      sportId: string;
      tournamentId?: string;
      eventName: string;
      resultValue: string;
      position?: string;
      createdBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<ResultEntryRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO sports_result_entry (student_id, sport_id, tournament_id, event_name, result_value, position, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING id`,
      [input.studentId, input.sportId, input.tournamentId ?? null, input.eventName, input.resultValue, input.position ?? null, input.createdBy],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<ResultEntryRow | null> {
    const { rows } = await executor.query<ResultEntryRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE re.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findAll(status: ResultEntryStatus | undefined, executor: Queryable = this.postgres): Promise<ResultEntryRow[]> {
    const where = status ? `WHERE re.status = $1` : '';
    const params = status ? [status] : [];
    const { rows } = await executor.query<ResultEntryRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where} ORDER BY re.created_at DESC`,
      params,
    );
    return rows;
  }

  async update(
    id: string,
    patch: { eventName?: string; resultValue?: string; position?: string; status?: ResultEntryStatus },
    updatedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<ResultEntryRow> {
    const isVerifyOrReject = patch.status === 'VERIFIED' || patch.status === 'REJECTED';
    await executor.query(
      `UPDATE sports_result_entry SET
         event_name = COALESCE($2, event_name),
         result_value = COALESCE($3, result_value),
         position = COALESCE($4, position),
         status = COALESCE($5, status),
         verified_by = CASE WHEN $6 THEN $7 ELSE verified_by END,
         verified_at = CASE WHEN $6 THEN now() ELSE verified_at END,
         updated_by = $7,
         updated_at = now()
       WHERE id = $1`,
      [id, patch.eventName ?? null, patch.resultValue ?? null, patch.position ?? null, patch.status ?? null, isVerifyOrReject, updatedBy],
    );
    return (await this.findById(id, executor))!;
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM sports_result_entry WHERE id = $1`, [id]);
  }
}

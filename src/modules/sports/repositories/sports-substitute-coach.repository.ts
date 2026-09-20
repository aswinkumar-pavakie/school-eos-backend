// Backs the Sports Admin "Substitute Coach" screen -- real
// sports_substitute_coach table (see migration
// 0026_sports_practice_results_selection_substitute.sql), a genuine
// backend gap confirmed by direct audit before this build (team.coach_id is
// a single overwritable field with no time-boxed coverage concept at all).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export const SUBSTITUTE_COACH_STATUSES = ['PENDING', 'APPROVED', 'CLOSED'] as const;
export type SubstituteCoachStatus = (typeof SUBSTITUTE_COACH_STATUSES)[number];

export interface SubstituteCoachRow {
  id: string;
  teamId: string;
  teamName: string;
  originalCoachId: string | null;
  originalCoachName: string | null;
  substituteCoachId: string;
  substituteCoachName: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: SubstituteCoachStatus;
  createdAt: string;
}

const COLUMNS = `sc.id, sc.team_id AS "teamId", t.name AS "teamName",
  sc.original_coach_id AS "originalCoachId", oc.full_name AS "originalCoachName",
  sc.substitute_coach_id AS "substituteCoachId", subc.full_name AS "substituteCoachName",
  sc.start_date AS "startDate", sc.end_date AS "endDate", sc.reason, sc.status, sc.created_at AS "createdAt"`;
const FROM = `sports_substitute_coach sc
  JOIN team t ON t.id = sc.team_id
  LEFT JOIN coach oc ON oc.id = sc.original_coach_id
  JOIN coach subc ON subc.id = sc.substitute_coach_id`;

@Injectable()
export class SportsSubstituteCoachRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      teamId: string;
      originalCoachId?: string;
      substituteCoachId: string;
      startDate: string;
      endDate: string;
      reason?: string;
      createdBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<SubstituteCoachRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO sports_substitute_coach (team_id, original_coach_id, substitute_coach_id, start_date, end_date, reason, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING id`,
      [input.teamId, input.originalCoachId ?? null, input.substituteCoachId, input.startDate, input.endDate, input.reason ?? null, input.createdBy],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<SubstituteCoachRow | null> {
    const { rows } = await executor.query<SubstituteCoachRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE sc.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findAll(executor: Queryable = this.postgres): Promise<SubstituteCoachRow[]> {
    const { rows } = await executor.query<SubstituteCoachRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ORDER BY sc.start_date DESC, sc.created_at DESC`,
    );
    return rows;
  }

  async update(
    id: string,
    patch: { startDate?: string; endDate?: string; reason?: string; status?: SubstituteCoachStatus },
    updatedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<SubstituteCoachRow> {
    await executor.query(
      `UPDATE sports_substitute_coach SET
         start_date = COALESCE($2, start_date),
         end_date = COALESCE($3, end_date),
         reason = COALESCE($4, reason),
         status = COALESCE($5, status),
         updated_by = $6,
         updated_at = now()
       WHERE id = $1`,
      [id, patch.startDate ?? null, patch.endDate ?? null, patch.reason ?? null, patch.status ?? null, updatedBy],
    );
    return (await this.findById(id, executor))!;
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM sports_substitute_coach WHERE id = $1`, [id]);
  }
}

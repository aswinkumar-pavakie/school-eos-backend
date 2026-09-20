// Backs the Sports Admin "Practice Plan" screen -- real
// sports_practice_plan table (see migration
// 0026_sports_practice_results_selection_substitute.sql), a genuine
// backend gap confirmed by direct audit before this build. Deliberately
// separate from sports_training_session (real day-of scheduling +
// attendance) -- this is a forward-looking weekly plan for a squad.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export const PRACTICE_PLAN_STATUSES = ['ACTIVE', 'DRAFT', 'ARCHIVED'] as const;
export type PracticePlanStatus = (typeof PRACTICE_PLAN_STATUSES)[number];

export type WeeklyFocus = Partial<Record<'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY', string>>;

export interface PracticePlanRow {
  id: string;
  teamId: string;
  teamName: string;
  sportName: string;
  title: string;
  startDate: string;
  endDate: string;
  weeklyFocus: WeeklyFocus;
  status: PracticePlanStatus;
  createdAt: string;
}

const COLUMNS = `pp.id, pp.team_id AS "teamId", t.name AS "teamName", sp.name AS "sportName", pp.title,
  pp.start_date AS "startDate", pp.end_date AS "endDate", pp.weekly_focus AS "weeklyFocus", pp.status, pp.created_at AS "createdAt"`;
const FROM = `sports_practice_plan pp JOIN team t ON t.id = pp.team_id JOIN sport sp ON sp.id = t.sport_id`;

@Injectable()
export class SportsPracticePlanRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: { teamId: string; title: string; startDate: string; endDate: string; weeklyFocus?: WeeklyFocus; createdBy: string },
    executor: Queryable = this.postgres,
  ): Promise<PracticePlanRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO sports_practice_plan (team_id, title, start_date, end_date, weekly_focus, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id`,
      [input.teamId, input.title, input.startDate, input.endDate, JSON.stringify(input.weeklyFocus ?? {}), input.createdBy],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<PracticePlanRow | null> {
    const { rows } = await executor.query<PracticePlanRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE pp.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findAll(executor: Queryable = this.postgres): Promise<PracticePlanRow[]> {
    const { rows } = await executor.query<PracticePlanRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ORDER BY pp.start_date DESC, pp.created_at DESC`,
    );
    return rows;
  }

  async update(
    id: string,
    patch: { title?: string; startDate?: string; endDate?: string; weeklyFocus?: WeeklyFocus; status?: PracticePlanStatus },
    updatedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<PracticePlanRow> {
    await executor.query(
      `UPDATE sports_practice_plan SET
         title = COALESCE($2, title),
         start_date = COALESCE($3, start_date),
         end_date = COALESCE($4, end_date),
         weekly_focus = COALESCE($5, weekly_focus),
         status = COALESCE($6, status),
         updated_by = $7,
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        patch.title ?? null,
        patch.startDate ?? null,
        patch.endDate ?? null,
        patch.weeklyFocus ? JSON.stringify(patch.weeklyFocus) : null,
        patch.status ?? null,
        updatedBy,
      ],
    );
    return (await this.findById(id, executor))!;
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM sports_practice_plan WHERE id = $1`, [id]);
  }
}

// Backs the Sports Admin "Selection Window" screen -- real
// sports_selection_window table (see migration
// 0026_sports_practice_results_selection_substitute.sql), a genuine
// backend gap confirmed by direct audit before this build.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export const SELECTION_WINDOW_STATUSES = ['DRAFT', 'OPEN', 'CLOSED'] as const;
export type SelectionWindowStatus = (typeof SELECTION_WINDOW_STATUSES)[number];

export interface SelectionWindowRow {
  id: string;
  sportId: string;
  sportName: string;
  title: string;
  opensOn: string;
  closesOn: string;
  notes: string | null;
  status: SelectionWindowStatus;
  createdAt: string;
}

const COLUMNS = `w.id, w.sport_id AS "sportId", sp.name AS "sportName", w.title,
  w.opens_on AS "opensOn", w.closes_on AS "closesOn", w.notes, w.status, w.created_at AS "createdAt"`;
const FROM = `sports_selection_window w JOIN sport sp ON sp.id = w.sport_id`;

@Injectable()
export class SportsSelectionWindowRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: { sportId: string; title: string; opensOn: string; closesOn: string; notes?: string; createdBy: string },
    executor: Queryable = this.postgres,
  ): Promise<SelectionWindowRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO sports_selection_window (sport_id, title, opens_on, closes_on, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id`,
      [input.sportId, input.title, input.opensOn, input.closesOn, input.notes ?? null, input.createdBy],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<SelectionWindowRow | null> {
    const { rows } = await executor.query<SelectionWindowRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE w.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findAll(executor: Queryable = this.postgres): Promise<SelectionWindowRow[]> {
    const { rows } = await executor.query<SelectionWindowRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ORDER BY w.opens_on DESC, w.created_at DESC`,
    );
    return rows;
  }

  async update(
    id: string,
    patch: { title?: string; opensOn?: string; closesOn?: string; notes?: string; status?: SelectionWindowStatus },
    updatedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<SelectionWindowRow> {
    await executor.query(
      `UPDATE sports_selection_window SET
         title = COALESCE($2, title),
         opens_on = COALESCE($3, opens_on),
         closes_on = COALESCE($4, closes_on),
         notes = COALESCE($5, notes),
         status = COALESCE($6, status),
         updated_by = $7,
         updated_at = now()
       WHERE id = $1`,
      [id, patch.title ?? null, patch.opensOn ?? null, patch.closesOn ?? null, patch.notes ?? null, patch.status ?? null, updatedBy],
    );
    return (await this.findById(id, executor))!;
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM sports_selection_window WHERE id = $1`, [id]);
  }
}

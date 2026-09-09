import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface TournamentRow {
  id: string;
  sportId: string;
  sportName: string;
  name: string;
  level: string;
  format: string | null;
  startDate: string;
  endDate: string;
  venue: string | null;
  state: string;
}

const COLUMNS = `t.id, t.sport_id AS "sportId", sp.name AS "sportName", t.name, t.level, t.format,
  t.start_date AS "startDate", t.end_date AS "endDate", t.venue, t.state`;

const FROM = `FROM tournament t JOIN sport sp ON sp.id = t.sport_id`;

@Injectable()
export class TournamentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      sportId: string;
      name: string;
      level: string;
      format?: string | null;
      startDate: string;
      endDate: string;
      venue?: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<TournamentRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO tournament (sport_id, name, level, format, start_date, end_date, venue)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.sportId,
        input.name,
        input.level,
        input.format ?? null,
        input.startDate,
        input.endDate,
        input.venue ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<TournamentRow | null> {
    const { rows } = await executor.query<TournamentRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE t.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findBySportIds(
    sportIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<TournamentRow[]> {
    if (sportIds.length === 0) return [];
    const { rows } = await executor.query<TournamentRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE t.sport_id = ANY($1::uuid[]) ORDER BY t.start_date DESC`,
      [sportIds],
    );
    return rows;
  }

  async update(
    id: string,
    input: {
      name?: string;
      format?: string | null;
      startDate?: string;
      endDate?: string;
      venue?: string | null;
      state?: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<TournamentRow | null> {
    await executor.query(
      `UPDATE tournament SET
         name = COALESCE($2, name),
         format = COALESCE($3, format),
         start_date = COALESCE($4, start_date),
         end_date = COALESCE($5, end_date),
         venue = COALESCE($6, venue),
         state = COALESCE($7, state)
       WHERE id = $1`,
      [
        id,
        input.name ?? null,
        input.format ?? null,
        input.startDate ?? null,
        input.endDate ?? null,
        input.venue ?? null,
        input.state ?? null,
      ],
    );
    return this.findById(id, executor);
  }
}

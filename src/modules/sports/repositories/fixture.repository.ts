import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface FixtureRow {
  id: string;
  tournamentId: string;
  sportId: string;
  round: string | null;
  scheduledAt: Date;
  venue: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  status: string;
}

const COLUMNS = `f.id, f.tournament_id AS "tournamentId", tour.sport_id AS "sportId", f.round,
  f.scheduled_at AS "scheduledAt", f.venue, f.home_team_id AS "homeTeamId", f.away_team_id AS "awayTeamId", f.status`;

const FROM = `FROM fixture f JOIN tournament tour ON tour.id = f.tournament_id`;

@Injectable()
export class FixtureRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      tournamentId: string;
      round?: string | null;
      scheduledAt: string;
      venue?: string | null;
      homeTeamId?: string | null;
      awayTeamId?: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<FixtureRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO fixture (tournament_id, round, scheduled_at, venue, home_team_id, away_team_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.tournamentId,
        input.round ?? null,
        input.scheduledAt,
        input.venue ?? null,
        input.homeTeamId ?? null,
        input.awayTeamId ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<FixtureRow | null> {
    const { rows } = await executor.query<FixtureRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE f.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findBySportIds(
    sportIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<FixtureRow[]> {
    if (sportIds.length === 0) return [];
    const { rows } = await executor.query<FixtureRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE tour.sport_id = ANY($1::uuid[]) ORDER BY f.scheduled_at DESC`,
      [sportIds],
    );
    return rows;
  }

  async update(
    id: string,
    input: {
      round?: string | null;
      scheduledAt?: string;
      venue?: string | null;
      homeTeamId?: string | null;
      awayTeamId?: string | null;
      status?: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<FixtureRow | null> {
    await executor.query(
      `UPDATE fixture SET
         round = COALESCE($2, round),
         scheduled_at = COALESCE($3, scheduled_at),
         venue = COALESCE($4, venue),
         home_team_id = COALESCE($5, home_team_id),
         away_team_id = COALESCE($6, away_team_id),
         status = COALESCE($7, status)
       WHERE id = $1`,
      [
        id,
        input.round ?? null,
        input.scheduledAt ?? null,
        input.venue ?? null,
        input.homeTeamId ?? null,
        input.awayTeamId ?? null,
        input.status ?? null,
      ],
    );
    return this.findById(id, executor);
  }
}

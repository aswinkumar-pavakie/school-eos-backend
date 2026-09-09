import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface FixtureResultRow {
  id: string;
  fixtureId: string;
  homeScore: string | null;
  awayScore: string | null;
  winnerTeamId: string | null;
  resultDetail: Record<string, unknown> | null;
  recordedBy: string | null;
  recordedAt: Date;
}

export interface HousePerformanceRow {
  houseId: string;
  houseName: string;
  matches: number;
  wins: number;
}

const COLUMNS = `id, fixture_id AS "fixtureId", home_score AS "homeScore", away_score AS "awayScore",
  winner_team_id AS "winnerTeamId", result_detail AS "resultDetail", recorded_by AS "recordedBy", recorded_at AS "recordedAt"`;

@Injectable()
export class FixtureResultRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** fixture_result.fixture_id is UNIQUE — one result per fixture, DB-enforced;
   * this surfaces as a unique-violation the service maps to a clean 409. */
  async create(
    input: {
      fixtureId: string;
      homeScore?: string | null;
      awayScore?: string | null;
      winnerTeamId?: string | null;
      resultDetail?: Record<string, unknown> | null;
      recordedBy: string;
    },
    executor: Queryable,
  ): Promise<FixtureResultRow> {
    const { rows } = await executor.query<FixtureResultRow>(
      `INSERT INTO fixture_result (fixture_id, home_score, away_score, winner_team_id, result_detail, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        input.fixtureId,
        input.homeScore ?? null,
        input.awayScore ?? null,
        input.winnerTeamId ?? null,
        input.resultDetail ? JSON.stringify(input.resultDetail) : null,
        input.recordedBy,
      ],
    );
    return rows[0];
  }

  async findByFixtureId(
    fixtureId: string,
    executor: Queryable = this.postgres,
  ): Promise<FixtureResultRow | null> {
    const { rows } = await executor.query<FixtureResultRow>(
      `SELECT ${COLUMNS} FROM fixture_result WHERE fixture_id = $1`,
      [fixtureId],
    );
    return rows[0] ?? null;
  }

  /**
   * Feature #17 — house-wise performance. No dedicated "rankings" table exists
   * in the real schema (checked during discovery), so this is a live
   * aggregation over fixture_result joined back through fixture -> tournament
   * (for sport scoping) and team (for house). Each fixture_result contributes
   * one "side" row for its home team and one for its away team (UNION ALL),
   * so a team's house gets +1 match either way, and +1 win only on the side
   * that actually matches winner_team_id — counts both home and away
   * appearances correctly without double-counting a single fixture as two
   * house wins.
   */
  async getHousePerformanceBySportIds(
    sportIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<HousePerformanceRow[]> {
    if (sportIds.length === 0) return [];
    const { rows } = await executor.query<{
      house_id: string;
      house_name: string;
      matches: string;
      wins: string;
    }>(
      `WITH sides AS (
         SELECT ht.house_id AS house_id, (fr.winner_team_id = f.home_team_id) AS is_win
         FROM fixture_result fr
         JOIN fixture f ON f.id = fr.fixture_id
         JOIN tournament tour ON tour.id = f.tournament_id
         JOIN team ht ON ht.id = f.home_team_id
         WHERE tour.sport_id = ANY($1::uuid[]) AND ht.house_id IS NOT NULL
         UNION ALL
         SELECT at.house_id AS house_id, (fr.winner_team_id = f.away_team_id) AS is_win
         FROM fixture_result fr
         JOIN fixture f ON f.id = fr.fixture_id
         JOIN tournament tour ON tour.id = f.tournament_id
         JOIN team at ON at.id = f.away_team_id
         WHERE tour.sport_id = ANY($1::uuid[]) AND at.house_id IS NOT NULL
       )
       SELECT h.id AS house_id, h.name AS house_name,
              count(*)::int AS matches,
              count(*) FILTER (WHERE sides.is_win)::int AS wins
       FROM sides
       JOIN house h ON h.id = sides.house_id
       GROUP BY h.id, h.name
       ORDER BY wins DESC, matches DESC`,
      [sportIds],
    );
    return rows.map((r) => ({
      houseId: r.house_id,
      houseName: r.house_name,
      matches: Number(r.matches),
      wins: Number(r.wins),
    }));
  }
}

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface SportsAchievementRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  teamId: string | null;
  teamName: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  placement: string;
  awardedOn: string;
  certificateKey: string | null;
  achievementId: string | null;
}

const COLUMNS = `sa.id, sa.student_id AS "studentId", p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
  sa.team_id AS "teamId", t.name AS "teamName", sa.tournament_id AS "tournamentId", tour.name AS "tournamentName",
  sa.placement, sa.awarded_on AS "awardedOn", sa.certificate_key AS "certificateKey", sa.achievement_id AS "achievementId"`;

const FROM = `
  FROM sports_achievement sa
  JOIN student s ON s.id = sa.student_id
  JOIN person p ON p.id = s.person_id
  LEFT JOIN team t ON t.id = sa.team_id
  LEFT JOIN tournament tour ON tour.id = sa.tournament_id`;

@Injectable()
export class SportsAchievementRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      studentId: string;
      teamId?: string | null;
      tournamentId?: string | null;
      placement: string;
      awardedOn: string;
      certificateKey?: string | null;
    },
    executor: Queryable,
  ): Promise<SportsAchievementRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO sports_achievement (student_id, team_id, tournament_id, placement, awarded_on, certificate_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.studentId,
        input.teamId ?? null,
        input.tournamentId ?? null,
        input.placement,
        input.awardedOn,
        input.certificateKey ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async linkAchievement(
    id: string,
    achievementId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE sports_achievement SET achievement_id = $2 WHERE id = $1`,
      [id, achievementId],
    );
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<SportsAchievementRow | null> {
    const { rows } = await executor.query<SportsAchievementRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE sa.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Resolves sport via team.sport_id or tournament.sport_id (whichever is set
   * on the given team/tournament id) — used for the live authorization check
   * before an achievement is ever created (sports_achievement itself carries
   * no sport_id column). */
  async resolveSportId(
    input: { teamId?: string | null; tournamentId?: string | null },
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    if (input.teamId) {
      const { rows } = await executor.query<{ sport_id: string }>(
        `SELECT sport_id FROM team WHERE id = $1`,
        [input.teamId],
      );
      return rows[0]?.sport_id ?? null;
    }
    if (input.tournamentId) {
      const { rows } = await executor.query<{ sport_id: string }>(
        `SELECT sport_id FROM tournament WHERE id = $1`,
        [input.tournamentId],
      );
      return rows[0]?.sport_id ?? null;
    }
    return null;
  }

  async findBySportIds(
    sportIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<SportsAchievementRow[]> {
    if (sportIds.length === 0) return [];
    const { rows } = await executor.query<SportsAchievementRow>(
      `SELECT ${COLUMNS} ${FROM}
       WHERE t.sport_id = ANY($1::uuid[]) OR tour.sport_id = ANY($1::uuid[])
       ORDER BY sa.awarded_on DESC`,
      [sportIds],
    );
    return rows;
  }
}

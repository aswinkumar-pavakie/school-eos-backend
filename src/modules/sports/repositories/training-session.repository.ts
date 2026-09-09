import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface TrainingSessionRow {
  id: string;
  teamId: string;
  teamName: string;
  sportId: string;
  scheduledAt: Date;
  venue: string | null;
  focus: string | null;
  conductedByCoachId: string | null;
  status: string;
}

const COLUMNS = `ts.id, ts.team_id AS "teamId", t.name AS "teamName", t.sport_id AS "sportId",
  ts.scheduled_at AS "scheduledAt", ts.venue, ts.focus,
  ts.conducted_by_coach_id AS "conductedByCoachId", ts.status`;

const FROM = `FROM training_session ts JOIN team t ON t.id = ts.team_id`;

@Injectable()
export class TrainingSessionRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      teamId: string;
      scheduledAt: string;
      venue?: string | null;
      focus?: string | null;
      conductedByCoachId?: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<TrainingSessionRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO training_session (team_id, scheduled_at, venue, focus, conducted_by_coach_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.teamId,
        input.scheduledAt,
        input.venue ?? null,
        input.focus ?? null,
        input.conductedByCoachId ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<TrainingSessionRow | null> {
    const { rows } = await executor.query<TrainingSessionRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE ts.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findBySportIds(
    sportIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<TrainingSessionRow[]> {
    if (sportIds.length === 0) return [];
    const { rows } = await executor.query<TrainingSessionRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE t.sport_id = ANY($1::uuid[]) ORDER BY ts.scheduled_at DESC`,
      [sportIds],
    );
    return rows;
  }

  async update(
    id: string,
    input: {
      scheduledAt?: string;
      venue?: string | null;
      focus?: string | null;
      conductedByCoachId?: string | null;
      status?: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<TrainingSessionRow | null> {
    await executor.query(
      `UPDATE training_session SET
         scheduled_at = COALESCE($2, scheduled_at),
         venue = COALESCE($3, venue),
         focus = COALESCE($4, focus),
         conducted_by_coach_id = COALESCE($5, conducted_by_coach_id),
         status = COALESCE($6, status)
       WHERE id = $1`,
      [
        id,
        input.scheduledAt ?? null,
        input.venue ?? null,
        input.focus ?? null,
        input.conductedByCoachId ?? null,
        input.status ?? null,
      ],
    );
    return this.findById(id, executor);
  }
}

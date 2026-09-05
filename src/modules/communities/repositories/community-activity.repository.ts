import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface CommunityActivityRow {
  id: string;
  communityId: string;
  title: string;
  description: string | null;
  scheduledAt: Date;
  venue: string | null;
  status: string;
  createdBy: string | null;
}

export interface CreateActivityInput {
  communityId: string;
  title: string;
  description?: string | null;
  scheduledAt: string;
  venue?: string | null;
  createdBy: string;
}

export interface UpdateActivityInput {
  title?: string;
  description?: string | null;
  scheduledAt?: string;
  venue?: string | null;
  status?: string;
}

const COLUMNS = `id, community_id AS "communityId", title, description,
  scheduled_at AS "scheduledAt", venue, status, created_by AS "createdBy"`;

@Injectable()
export class CommunityActivityRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByCommunityId(
    communityId: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityActivityRow[]> {
    const { rows } = await executor.query<CommunityActivityRow>(
      `SELECT ${COLUMNS} FROM community_activity WHERE community_id = $1 ORDER BY scheduled_at DESC`,
      [communityId],
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<CommunityActivityRow | null> {
    const { rows } = await executor.query<CommunityActivityRow>(
      `SELECT ${COLUMNS} FROM community_activity WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateActivityInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityActivityRow> {
    const { rows } = await executor.query<CommunityActivityRow>(
      `INSERT INTO community_activity (community_id, title, description, scheduled_at, venue, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        input.communityId,
        input.title,
        input.description ?? null,
        input.scheduledAt,
        input.venue ?? null,
        input.createdBy,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateActivityInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityActivityRow | null> {
    const { rows } = await executor.query<CommunityActivityRow>(
      `UPDATE community_activity SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         scheduled_at = COALESCE($4, scheduled_at),
         venue = COALESCE($5, venue),
         status = COALESCE($6, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.title ?? null,
        input.description ?? null,
        input.scheduledAt ?? null,
        input.venue ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}

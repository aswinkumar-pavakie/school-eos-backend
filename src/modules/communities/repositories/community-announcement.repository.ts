import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface CommunityAnnouncementRow {
  id: string;
  communityId: string;
  title: string;
  body: string;
  attachmentKeys: string[];
  publishedBy: string;
  publishedAt: Date;
  state: string;
}

export interface CreateAnnouncementInput {
  communityId: string;
  title: string;
  body: string;
  publishedBy: string;
  state?: string;
}

export interface UpdateAnnouncementInput {
  title?: string;
  body?: string;
  state?: string;
}

const COLUMNS = `id, community_id AS "communityId", title, body,
  attachment_keys AS "attachmentKeys", published_by AS "publishedBy",
  published_at AS "publishedAt", state`;

@Injectable()
export class CommunityAnnouncementRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByCommunityId(
    communityId: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityAnnouncementRow[]> {
    const { rows } = await executor.query<CommunityAnnouncementRow>(
      `SELECT ${COLUMNS} FROM community_announcement WHERE community_id = $1 ORDER BY published_at DESC`,
      [communityId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityAnnouncementRow | null> {
    const { rows } = await executor.query<CommunityAnnouncementRow>(
      `SELECT ${COLUMNS} FROM community_announcement WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateAnnouncementInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityAnnouncementRow> {
    const { rows } = await executor.query<CommunityAnnouncementRow>(
      `INSERT INTO community_announcement (community_id, title, body, published_by, state)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'PUBLISHED'))
       RETURNING ${COLUMNS}`,
      [input.communityId, input.title, input.body, input.publishedBy, input.state ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateAnnouncementInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityAnnouncementRow | null> {
    const { rows } = await executor.query<CommunityAnnouncementRow>(
      `UPDATE community_announcement SET
         title = COALESCE($2, title),
         body = COALESCE($3, body),
         state = COALESCE($4, state)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, input.title ?? null, input.body ?? null, input.state ?? null],
    );
    return rows[0] ?? null;
  }
}

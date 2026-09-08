// media_post -- see database/migrations/0006_media_room.sql. Real
// DRAFT -> SCHEDULED -> PUBLISHED/CANCELLED lifecycle; MediaPostsScheduler is the
// only thing that ever moves SCHEDULED -> PUBLISHED (once publish_at has passed).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface MediaPostAssetRow {
  id: string;
  objectKey: string;
  mediaType: string;
  sortOrder: number;
}

export interface MediaPostRow {
  id: string;
  format: string;
  category: string;
  caption: string;
  firstComment: string | null;
  linkUrl: string | null;
  pinToTop: boolean;
  allowComments: boolean;
  state: string;
  publishAt: Date | null;
  publishedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: any): MediaPostRow {
  return {
    id: row.id,
    format: row.format,
    category: row.category,
    caption: row.caption,
    firstComment: row.first_comment,
    linkUrl: row.link_url,
    pinToTop: row.pin_to_top,
    allowComments: row.allow_comments,
    state: row.state,
    publishAt: row.publish_at,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class MediaPostRepository {
  constructor(private readonly postgres: PostgresService) {}

  async list(filter: { state?: string }, executor: Queryable = this.postgres): Promise<MediaPostRow[]> {
    const { rows } = await executor.query(
      `SELECT * FROM media_post WHERE ($1::text IS NULL OR state = $1) ORDER BY pin_to_top DESC, created_at DESC`,
      [filter.state ?? null],
    );
    return rows.map(mapRow);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<MediaPostRow | null> {
    const { rows } = await executor.query(`SELECT * FROM media_post WHERE id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(id: string, executor: Queryable): Promise<MediaPostRow | null> {
    const { rows } = await executor.query(`SELECT * FROM media_post WHERE id = $1 FOR UPDATE`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async create(
    input: {
      format: string;
      category: string;
      caption: string;
      firstComment?: string | null;
      linkUrl?: string | null;
      pinToTop: boolean;
      allowComments: boolean;
      state: string;
      publishAt: string | null;
      createdBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<MediaPostRow> {
    const { rows } = await executor.query(
      `INSERT INTO media_post (format, category, caption, first_comment, link_url, pin_to_top, allow_comments, state, publish_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.format,
        input.category,
        input.caption,
        input.firstComment ?? null,
        input.linkUrl ?? null,
        input.pinToTop,
        input.allowComments,
        input.state,
        input.publishAt,
        input.createdBy,
      ],
    );
    return mapRow(rows[0]);
  }

  async update(
    id: string,
    input: {
      caption?: string;
      firstComment?: string | null;
      linkUrl?: string | null;
      pinToTop?: boolean;
      allowComments?: boolean;
    },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE media_post SET
         caption = COALESCE($2, caption),
         first_comment = COALESCE($3, first_comment),
         link_url = COALESCE($4, link_url),
         pin_to_top = COALESCE($5, pin_to_top),
         allow_comments = COALESCE($6, allow_comments),
         updated_at = now()
       WHERE id = $1`,
      [id, input.caption ?? null, input.firstComment ?? null, input.linkUrl ?? null, input.pinToTop ?? null, input.allowComments ?? null],
    );
  }

  async setState(id: string, state: string, executor: Queryable = this.postgres, publishedAt?: Date): Promise<void> {
    await executor.query(
      `UPDATE media_post SET state = $2, published_at = COALESCE($3, published_at), updated_at = now() WHERE id = $1`,
      [id, state, publishedAt ?? null],
    );
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM media_post WHERE id = $1`, [id]);
  }

  /** Real due-for-publish rows -- MediaPostsScheduler's own query, locked FOR
   * UPDATE SKIP LOCKED so a slow tick can never double-publish the same row. */
  async findDueForPublish(executor: Queryable): Promise<MediaPostRow[]> {
    const { rows } = await executor.query(
      `SELECT * FROM media_post WHERE state = 'SCHEDULED' AND publish_at <= now() FOR UPDATE SKIP LOCKED`,
    );
    return rows.map(mapRow);
  }

  async countByState(executor: Queryable = this.postgres): Promise<Record<string, number>> {
    const { rows } = await executor.query(`SELECT state, COUNT(*)::int AS count FROM media_post GROUP BY state`);
    const result: Record<string, number> = {};
    for (const row of rows) result[row.state] = row.count;
    return result;
  }

  // ---- assets ----

  async listAssets(mediaPostId: string, executor: Queryable = this.postgres): Promise<MediaPostAssetRow[]> {
    const { rows } = await executor.query(
      `SELECT id, object_key, media_type, sort_order FROM media_post_asset WHERE media_post_id = $1 ORDER BY sort_order ASC`,
      [mediaPostId],
    );
    return rows.map((r: any) => ({ id: r.id, objectKey: r.object_key, mediaType: r.media_type, sortOrder: r.sort_order }));
  }

  async addAsset(
    input: { mediaPostId: string; objectKey: string; mediaType: string; sortOrder: number },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO media_post_asset (media_post_id, object_key, media_type, sort_order) VALUES ($1, $2, $3, $4)`,
      [input.mediaPostId, input.objectKey, input.mediaType, input.sortOrder],
    );
  }
}

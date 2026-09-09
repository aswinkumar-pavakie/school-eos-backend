import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface MediaPostCommentRow {
  id: string;
  mediaPostId: string;
  commenterPersonId: string | null;
  commenterLabel: string | null;
  body: string;
  staffReply: string | null;
  staffRepliedBy: string | null;
  staffRepliedAt: Date | null;
  createdAt: Date;
}

function mapRow(row: any): MediaPostCommentRow {
  return {
    id: row.id,
    mediaPostId: row.media_post_id,
    commenterPersonId: row.commenter_person_id,
    commenterLabel: row.commenter_label,
    body: row.body,
    staffReply: row.staff_reply,
    staffRepliedBy: row.staff_replied_by,
    staffRepliedAt: row.staff_replied_at,
    createdAt: row.created_at,
  };
}

@Injectable()
export class MediaPostCommentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async listByPost(
    mediaPostId: string,
    executor: Queryable = this.postgres,
  ): Promise<MediaPostCommentRow[]> {
    const { rows } = await executor.query(
      `SELECT * FROM media_post_comment WHERE media_post_id = $1 ORDER BY created_at ASC`,
      [mediaPostId],
    );
    return rows.map(mapRow);
  }

  async countByPost(
    executor: Queryable = this.postgres,
  ): Promise<Record<string, { total: number; unanswered: number }>> {
    const { rows } = await executor.query(
      `SELECT media_post_id,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE staff_reply IS NULL)::int AS unanswered
       FROM media_post_comment GROUP BY media_post_id`,
    );
    const result: Record<string, { total: number; unanswered: number }> = {};
    for (const row of rows)
      result[row.media_post_id] = {
        total: row.total,
        unanswered: row.unanswered,
      };
    return result;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<MediaPostCommentRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM media_post_comment WHERE id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async reply(
    id: string,
    input: { staffReply: string; staffRepliedBy: string },
    executor: Queryable = this.postgres,
  ): Promise<MediaPostCommentRow | null> {
    const { rows } = await executor.query(
      `UPDATE media_post_comment SET staff_reply = $2, staff_replied_by = $3, staff_replied_at = now() WHERE id = $1 RETURNING *`,
      [id, input.staffReply, input.staffRepliedBy],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM media_post_comment WHERE id = $1`, [id]);
  }
}

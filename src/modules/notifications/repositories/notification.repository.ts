import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

// Reads what OutboxService.enqueue() (src/common/outbox/outbox.service.ts)
// already writes -- the `notification` table has existed and been populated
// since that service's own introduction (approvals, community announcements,
// repair requests, attendance-absence alerts, etc. all already write real
// rows here), but nothing anywhere in the backend has ever read it back.
// This is that missing read side, not a new table or a new write path --
// OutboxService itself is completely untouched.
export interface NotificationRow {
  id: string;
  personId: string;
  aboutStudentId: string | null;
  notificationType: string;
  title: string;
  body: string;
  relatedObjectType: string | null;
  relatedObjectId: string | null;
  deepLink: string | null;
  isEmergency: boolean;
  createdAt: Date;
  readAt: Date | null;
}

const COLUMNS = `id, person_id AS "personId", about_student_id AS "aboutStudentId",
  notification_type AS "notificationType", title, body,
  related_object_type AS "relatedObjectType", related_object_id AS "relatedObjectId",
  deep_link AS "deepLink", is_emergency AS "isEmergency",
  created_at AS "createdAt", read_at AS "readAt"`;

@Injectable()
export class NotificationRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Always scoped to one person -- callers must pass the AUTHENTICATED
   * actor's own personId, never a client-supplied one. */
  async findForPerson(
    personId: string,
    filter: { unreadOnly?: boolean; limit: number; offset: number },
    executor: Queryable = this.postgres,
  ): Promise<{ rows: NotificationRow[]; total: number }> {
    const conditions = ['person_id = $1'];
    const params: unknown[] = [personId];
    if (filter.unreadOnly) {
      conditions.push('read_at IS NULL');
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await executor.query<{ count: string }>(
      `SELECT count(*) FROM notification ${where}`,
      params,
    );

    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<NotificationRow>(
      `SELECT ${COLUMNS} FROM notification ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );

    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async countUnread(personId: string, executor: Queryable = this.postgres): Promise<number> {
    const { rows } = await executor.query<{ count: string }>(
      `SELECT count(*) FROM notification WHERE person_id = $1 AND read_at IS NULL`,
      [personId],
    );
    return parseInt(rows[0].count, 10);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<NotificationRow | null> {
    const { rows } = await executor.query<NotificationRow>(
      `SELECT ${COLUMNS} FROM notification WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async markRead(id: string, executor: Queryable = this.postgres): Promise<NotificationRow | null> {
    const { rows } = await executor.query<NotificationRow>(
      `UPDATE notification SET read_at = now() WHERE id = $1 AND read_at IS NULL
       RETURNING ${COLUMNS}`,
      [id],
    );
    if (rows.length > 0) return rows[0];
    // Already read (or didn't exist) -- fall back to a plain read so a
    // second mark-as-read call is idempotent rather than a silent no-op.
    return this.findById(id, executor);
  }
}

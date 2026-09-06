// Messages are immutable once created (no edit/delete in this MVP) and idempotent
// per (conversation, sender, Idempotency-Key), mirroring online_class's own
// faculty-scoped idempotency constraint exactly.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface MessageView {
  id: string;
  conversationId: string;
  senderPersonId: string;
  messageText: string;
  createdAt: Date;
}

function mapRow(row: {
  id: string;
  conversation_id: string;
  sender_person_id: string;
  message_text: string;
  created_at: Date;
}): MessageView {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderPersonId: row.sender_person_id,
    messageText: row.message_text,
    createdAt: row.created_at,
  };
}

@Injectable()
export class MessageRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByIdempotencyKey(
    conversationId: string,
    senderPersonId: string,
    idempotencyKey: string,
    executor: Queryable = this.postgres,
  ): Promise<MessageView | null> {
    const { rows } = await executor.query(
      `SELECT id, conversation_id, sender_person_id, message_text, created_at
       FROM message WHERE conversation_id = $1 AND sender_person_id = $2 AND idempotency_key = $3`,
      [conversationId, senderPersonId, idempotencyKey],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async insert(
    conversationId: string,
    senderPersonId: string,
    messageText: string,
    idempotencyKey: string,
    executor: Queryable,
  ): Promise<MessageView> {
    const { rows } = await executor.query(
      `INSERT INTO message (conversation_id, sender_person_id, message_text, idempotency_key)
       VALUES ($1, $2, $3, $4)
       RETURNING id, conversation_id, sender_person_id, message_text, created_at`,
      [conversationId, senderPersonId, messageText, idempotencyKey],
    );
    return mapRow(rows[0]);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<MessageView | null> {
    const { rows } = await executor.query(
      `SELECT id, conversation_id, sender_person_id, message_text, created_at FROM message WHERE id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findLatest(
    conversationId: string,
    executor: Queryable = this.postgres,
  ): Promise<MessageView | null> {
    const { rows } = await executor.query(
      `SELECT id, conversation_id, sender_person_id, message_text, created_at
       FROM message WHERE conversation_id = $1 ORDER BY id DESC LIMIT 1`,
      [conversationId],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** Cursor pagination: fetches up to `limit` messages older than `beforeId` (or the
   * newest page if omitted), newest-first, bounded — never an unbounded SELECT.
   * Fetches one extra row to determine hasMore without a second COUNT query. */
  async listPage(
    conversationId: string,
    limit: number,
    beforeId: string | undefined,
    executor: Queryable = this.postgres,
  ): Promise<{ items: MessageView[]; hasMore: boolean }> {
    const { rows } = await executor.query(
      `SELECT id, conversation_id, sender_person_id, message_text, created_at
       FROM message
       WHERE conversation_id = $1 AND ($2::bigint IS NULL OR id < $2)
       ORDER BY id DESC
       LIMIT $3`,
      [conversationId, beforeId ?? null, limit + 1],
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page.map(mapRow), hasMore };
  }

  async countUnread(
    conversationId: string,
    excludePersonId: string,
    sinceExclusive: Date | null,
    executor: Queryable = this.postgres,
  ): Promise<number> {
    const { rows } = await executor.query<{ count: string }>(
      `SELECT count(*) FROM message
       WHERE conversation_id = $1 AND sender_person_id <> $2
         AND ($3::timestamptz IS NULL OR created_at > $3)`,
      [conversationId, excludePersonId, sinceExclusive],
    );
    return Number(rows[0].count);
  }

  /** Bulk unread count -- one query for many conversations instead of one
   * sequential query per conversation. Feeds MessagingService's bulk list-summary
   * builder, where a faculty's list can span hundreds of conversations across
   * every student in every section they teach. Returns 0 (not absent) for a
   * conversation with no matching messages. */
  async countUnreadMany(
    requests: {
      conversationId: string;
      excludePersonId: string;
      sinceExclusive: Date | null;
    }[],
    executor: Queryable = this.postgres,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (requests.length === 0) return result;
    const conversationIds = requests.map((r) => r.conversationId);
    const excludeIds = requests.map((r) => r.excludePersonId);
    const sinces = requests.map((r) => r.sinceExclusive);
    const { rows } = await executor.query<{
      conversation_id: string;
      count: string;
    }>(
      `SELECT req.conversation_id, count(m.id) AS count
       FROM unnest($1::uuid[], $2::uuid[], $3::timestamptz[]) AS req(conversation_id, exclude_person_id, since_exclusive)
       LEFT JOIN message m
         ON m.conversation_id = req.conversation_id
        AND m.sender_person_id <> req.exclude_person_id
        AND (req.since_exclusive IS NULL OR m.created_at > req.since_exclusive)
       GROUP BY req.conversation_id`,
      [conversationIds, excludeIds, sinces],
    );
    for (const row of rows) {
      result.set(row.conversation_id, Number(row.count));
    }
    return result;
  }

  /** Bulk lookup for conversation-list "last message" previews -- one query for
   * every distinct last_message_id instead of one per conversation. */
  async findByIds(
    ids: string[],
    executor: Queryable = this.postgres,
  ): Promise<MessageView[]> {
    if (ids.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT id, conversation_id, sender_person_id, message_text, created_at FROM message WHERE id = ANY($1::bigint[])`,
      [ids],
    );
    return rows.map(mapRow);
  }
}

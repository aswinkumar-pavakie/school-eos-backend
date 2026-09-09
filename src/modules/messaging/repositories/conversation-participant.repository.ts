// conversation_participant is a DISPLAY + per-person-read-state cache, never the
// authorization boundary (see migration header / MessagingService). sync() keeps it
// current with the live-derived authorized set on every access; it never deletes a
// row for someone no longer authorized (message history still attributes to them),
// it just stops granting them access on the next request regardless of this table.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export type ParticipantRole = 'PARENT' | 'SUBJECT_TEACHER' | 'CLASS_ADVISOR';

export interface ParticipantView {
  personId: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  participantRole: ParticipantRole;
  lastReadAt: Date | null;
}

@Injectable()
export class ConversationParticipantRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Upserts one participant row per (personId, role) — role is updated in place if
   * it changed (e.g. a subject teacher newly became class advisor too). */
  async sync(
    conversationId: string,
    participants: { personId: string; role: ParticipantRole }[],
    executor: Queryable = this.postgres,
  ): Promise<void> {
    for (const p of participants) {
      await executor.query(
        `INSERT INTO conversation_participant (conversation_id, person_id, participant_role)
         VALUES ($1, $2, $3)
         ON CONFLICT (conversation_id, person_id)
         DO UPDATE SET participant_role = EXCLUDED.participant_role`,
        [conversationId, p.personId, p.role],
      );
    }
  }

  async findOne(
    conversationId: string,
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ lastReadAt: Date | null } | null> {
    const { rows } = await executor.query<{ last_read_at: Date | null }>(
      `SELECT last_read_at FROM conversation_participant WHERE conversation_id = $1 AND person_id = $2`,
      [conversationId, personId],
    );
    return rows.length ? { lastReadAt: rows[0].last_read_at } : null;
  }

  /** Bulk upsert -- one multi-row INSERT for every (conversation, person, role)
   * triple across an entire list-summary build, instead of sync()'s one query per
   * participant per conversation. Same ON CONFLICT semantics as sync(). */
  async syncMany(
    rows: { conversationId: string; personId: string; role: ParticipantRole }[],
    executor: Queryable = this.postgres,
  ): Promise<void> {
    if (rows.length === 0) return;
    const values = rows
      .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
      .join(', ');
    const params = rows.flatMap((r) => [r.conversationId, r.personId, r.role]);
    await executor.query(
      `INSERT INTO conversation_participant (conversation_id, person_id, participant_role)
       VALUES ${values}
       ON CONFLICT (conversation_id, person_id)
       DO UPDATE SET participant_role = EXCLUDED.participant_role`,
      params,
    );
  }

  /** Bulk own-read-state lookup -- one query for the viewer's lastReadAt across
   * every conversation in a list, instead of one findOne() per conversation.
   * Absent from the map (not present as a key) means "never synced/read yet",
   * same as findOne() returning null. */
  async findManyOwn(
    conversationIds: string[],
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<Map<string, Date | null>> {
    const result = new Map<string, Date | null>();
    if (conversationIds.length === 0) return result;
    const { rows } = await executor.query<{
      conversation_id: string;
      last_read_at: Date | null;
    }>(
      `SELECT conversation_id, last_read_at FROM conversation_participant
       WHERE conversation_id = ANY($1::uuid[]) AND person_id = $2`,
      [conversationIds, personId],
    );
    for (const row of rows) {
      result.set(row.conversation_id, row.last_read_at);
    }
    return result;
  }

  /** Marks read for exactly the calling person's own row — never another
   * participant's (Step 12/37/38: independent read state per person). Upserts in
   * case sync() hasn't run for this person yet on this conversation. */
  async markRead(
    conversationId: string,
    personId: string,
    role: ParticipantRole,
    readAt: Date,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO conversation_participant (conversation_id, person_id, participant_role, last_read_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (conversation_id, person_id)
       DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
      [conversationId, personId, role, readAt],
    );
  }

  /** For display only — the caller must independently confirm current
   * authorization; this list is not filtered by it (see file header). */
  async listForConversation(
    conversationId: string,
    executor: Queryable = this.postgres,
  ): Promise<ParticipantView[]> {
    const { rows } = await executor.query<{
      person_id: string;
      first_name: string;
      last_name: string;
      display_name: string | null;
      participant_role: ParticipantRole;
      last_read_at: Date | null;
    }>(
      `SELECT cp.person_id, p.first_name, p.last_name, p.display_name, cp.participant_role, cp.last_read_at
       FROM conversation_participant cp
       JOIN person p ON p.id = cp.person_id
       WHERE cp.conversation_id = $1
       ORDER BY cp.joined_at`,
      [conversationId],
    );
    return rows.map((row) => ({
      personId: row.person_id,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      participantRole: row.participant_role,
      lastReadAt: row.last_read_at,
    }));
  }
}

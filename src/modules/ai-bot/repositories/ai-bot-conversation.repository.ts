import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface AiBotConversationRow {
  id: string;
  personId: string;
  roleCode: string;
  createdAt: Date;
}

export interface AiBotMessageRow {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  category: string | null;
  toolCalls: unknown[] | null;
  createdAt: Date;
}

const CONVERSATION_COLUMNS = `id, person_id AS "personId", role_code AS "roleCode", created_at AS "createdAt"`;
const MESSAGE_COLUMNS = `id, conversation_id AS "conversationId", role, content, category, tool_calls AS "toolCalls", created_at AS "createdAt"`;

@Injectable()
export class AiBotConversationRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    personId: string,
    roleCode: string,
    executor: Queryable = this.postgres,
  ): Promise<AiBotConversationRow> {
    const { rows } = await executor.query<AiBotConversationRow>(
      `INSERT INTO ai_bot_conversation (person_id, role_code)
       VALUES ($1, $2)
       RETURNING ${CONVERSATION_COLUMNS}`,
      [personId, roleCode],
    );
    return rows[0];
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<AiBotConversationRow | null> {
    const { rows } = await executor.query<AiBotConversationRow>(
      `SELECT ${CONVERSATION_COLUMNS} FROM ai_bot_conversation WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async addMessage(
    input: {
      conversationId: string;
      role: 'user' | 'assistant';
      content: string;
      category?: string | null;
      toolCalls?: unknown[] | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<AiBotMessageRow> {
    const { rows } = await executor.query<AiBotMessageRow>(
      `INSERT INTO ai_bot_message (conversation_id, role, content, category, tool_calls)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${MESSAGE_COLUMNS}`,
      [
        input.conversationId,
        input.role,
        input.content,
        input.category ?? null,
        input.toolCalls ? JSON.stringify(input.toolCalls) : null,
      ],
    );
    // touch updated_at so a future "list my conversations, most recent first"
    // view has a real signal to sort by.
    await executor.query(
      `UPDATE ai_bot_conversation SET updated_at = now() WHERE id = $1`,
      [input.conversationId],
    );
    return rows[0];
  }

  async listMessages(
    conversationId: string,
    executor: Queryable = this.postgres,
  ): Promise<AiBotMessageRow[]> {
    const { rows } = await executor.query<AiBotMessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM ai_bot_message WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );
    return rows;
  }
}

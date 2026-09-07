// Pure cache: keyed by (message_id, target_language). Never touches message.message_text.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface MessageTranslationView {
  messageId: string;
  targetLanguage: string;
  sourceLanguage: string;
  translatedText: string;
  provider: string;
}

@Injectable()
export class MessageTranslationRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findCached(
    messageId: string,
    targetLanguage: string,
    executor: Queryable = this.postgres,
  ): Promise<MessageTranslationView | null> {
    const { rows } = await executor.query<{
      message_id: string;
      target_language: string;
      source_language: string;
      translated_text: string;
      provider: string;
    }>(
      `SELECT message_id, target_language, source_language, translated_text, provider
       FROM message_translation WHERE message_id = $1 AND target_language = $2`,
      [messageId, targetLanguage],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      messageId: row.message_id,
      targetLanguage: row.target_language,
      sourceLanguage: row.source_language,
      translatedText: row.translated_text,
      provider: row.provider,
    };
  }

  async upsert(
    view: MessageTranslationView,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO message_translation (message_id, target_language, source_language, translated_text, provider)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (message_id, target_language)
       DO UPDATE SET translated_text = EXCLUDED.translated_text, source_language = EXCLUDED.source_language,
                     provider = EXCLUDED.provider`,
      [view.messageId, view.targetLanguage, view.sourceLanguage, view.translatedText, view.provider],
    );
  }
}

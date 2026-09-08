// Orchestrates: validate target language -> cache lookup -> provider call (only if
// configured) -> cache store. Never mutates the original message. Object-level
// authorization (is this caller allowed to see this message at all) is decided by
// MessagingService before this is ever called — this service assumes the caller
// has already been authorized for the message's conversation.

import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MESSAGING_ERRORS } from '../../../common/errors/error-codes';
import { MessageTranslationRepository } from '../repositories/message-translation.repository';
import { TRANSLATION_PROVIDER, type TranslationProvider } from './translation-provider.interface';
import { isSupportedTranslationLanguage } from './supported-languages';

export interface TranslateMessageResult {
  messageId: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
}

@Injectable()
export class TranslationService {
  constructor(
    private readonly translationRepo: MessageTranslationRepository,
    @Inject(TRANSLATION_PROVIDER) private readonly provider: TranslationProvider,
  ) {}

  async translate(messageId: string, messageText: string, targetLanguage: string): Promise<TranslateMessageResult> {
    if (!isSupportedTranslationLanguage(targetLanguage)) {
      throw new BadRequestException(MESSAGING_ERRORS.UNSUPPORTED_LANGUAGE);
    }

    const cached = await this.translationRepo.findCached(messageId, targetLanguage);
    if (cached) {
      return {
        messageId: cached.messageId,
        sourceLanguage: cached.sourceLanguage,
        targetLanguage: cached.targetLanguage,
        translatedText: cached.translatedText,
      };
    }

    if (!this.provider.isConfigured()) {
      throw new ServiceUnavailableException(MESSAGING_ERRORS.TRANSLATION_NOT_CONFIGURED);
    }

    let result: { translatedText: string; sourceLanguage: string };
    try {
      result = await this.provider.translate(messageText, targetLanguage);
    } catch {
      // Never surface the provider's own error text (it could echo request
      // details) — a single generic, safe message regardless of the underlying
      // cause.
      throw new ServiceUnavailableException(MESSAGING_ERRORS.TRANSLATION_FAILED);
    }

    await this.translationRepo.upsert({
      messageId,
      targetLanguage,
      sourceLanguage: result.sourceLanguage,
      translatedText: result.translatedText,
      provider: this.provider.name,
    });

    return { messageId, sourceLanguage: result.sourceLanguage, targetLanguage, translatedText: result.translatedText };
  }
}

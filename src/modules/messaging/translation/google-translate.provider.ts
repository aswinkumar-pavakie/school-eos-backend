// Google Cloud Translation v2 REST API via plain fetch (Node 18+ global) — no new
// SDK dependency, consistent with how lightly this project pulls in vendor code
// elsewhere. The API key is read once from config and is NEVER logged: not in
// error messages, not in thrown exceptions, not in any console output below.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TranslationProvider, TranslationResult } from './translation-provider.interface';

const TRANSLATE_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

@Injectable()
export class GoogleTranslateProvider implements TranslationProvider {
  readonly name = 'GOOGLE_TRANSLATE';

  constructor(private readonly configService: ConfigService) {}

  private get apiKey(): string {
    return this.configService.get<string>('translation.apiKey') ?? '';
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async translate(text: string, targetLanguage: string): Promise<TranslationResult> {
    if (!this.isConfigured()) {
      throw new Error('GoogleTranslateProvider.translate called while not configured');
    }

    const res = await fetch(`${TRANSLATE_ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target: targetLanguage, format: 'text' }),
    });

    if (!res.ok) {
      // Never include response body verbatim — it could echo the request, and in
      // some provider error shapes has included query parameters.
      throw new Error(`Google Translate request failed with status ${res.status}`);
    }

    const body = (await res.json()) as {
      data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] };
    };
    const translation = body.data?.translations?.[0];
    if (!translation) {
      throw new Error('Google Translate returned an unexpected response shape');
    }

    return {
      translatedText: translation.translatedText,
      sourceLanguage: translation.detectedSourceLanguage ?? 'und',
    };
  }
}

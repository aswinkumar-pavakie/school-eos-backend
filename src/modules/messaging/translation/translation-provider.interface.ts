// Provider abstraction so TranslationService never talks to a specific vendor's
// SDK/API shape directly — swapping providers later (or adding a second one) means
// implementing this interface and rebinding TRANSLATION_PROVIDER in
// messaging.module.ts, not touching the service.

export const TRANSLATION_PROVIDER = 'TRANSLATION_PROVIDER';

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
}

export interface TranslationProvider {
  readonly name: string;
  isConfigured(): boolean;
  translate(text: string, targetLanguage: string): Promise<TranslationResult>;
}

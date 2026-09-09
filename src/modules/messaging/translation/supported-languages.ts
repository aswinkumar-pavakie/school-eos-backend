// Explicit allow-list so an arbitrary provider-specific code can't be passed
// through unvalidated (Step 15). Small starter set matching the languages this
// school community actually needs; extend by adding an ISO 639-1 code here — no
// other code change required.

export const SUPPORTED_TRANSLATION_LANGUAGES = ['en', 'ta', 'hi', 'te', 'kn', 'ml'] as const;

export type SupportedTranslationLanguage = (typeof SUPPORTED_TRANSLATION_LANGUAGES)[number];

export function isSupportedTranslationLanguage(value: string): value is SupportedTranslationLanguage {
  return (SUPPORTED_TRANSLATION_LANGUAGES as readonly string[]).includes(value);
}

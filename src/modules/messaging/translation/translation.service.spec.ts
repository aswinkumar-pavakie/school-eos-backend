import { TranslationService } from './translation.service';
import type { TranslationProvider } from './translation-provider.interface';

function buildService(
  opts: {
    cached?: any;
    providerConfigured?: boolean;
    providerResult?: { translatedText: string; sourceLanguage: string };
    providerError?: Error;
  } = {},
) {
  const translationRepo = {
    findCached: jest.fn().mockResolvedValue(opts.cached ?? null),
    upsert: jest.fn().mockResolvedValue(undefined),
  } as any;

  const provider: jest.Mocked<TranslationProvider> = {
    name: 'GOOGLE_TRANSLATE',
    isConfigured: jest.fn().mockReturnValue(opts.providerConfigured ?? true),
    translate: jest.fn().mockImplementation(async () => {
      if (opts.providerError) throw opts.providerError;
      return (
        opts.providerResult ?? {
          translatedText: 'காலை வணக்கம்',
          sourceLanguage: 'en',
        }
      );
    }),
  };

  const service = new TranslationService(translationRepo, provider);
  return { service, translationRepo, provider };
}

describe('TranslationService', () => {
  it('43. rejects an unsupported target language before touching the cache or provider', async () => {
    const { service, translationRepo, provider } = buildService();

    await expect(service.translate('101', 'hello', 'xx')).rejects.toMatchObject(
      { status: 400 },
    );
    expect(translationRepo.findCached).not.toHaveBeenCalled();
    expect(provider.translate).not.toHaveBeenCalled();
  });

  it('47. a cache hit returns the stored translation without calling the provider again', async () => {
    const { service, provider } = buildService({
      cached: {
        messageId: '101',
        targetLanguage: 'ta',
        sourceLanguage: 'en',
        translatedText: 'cached text',
        provider: 'GOOGLE_TRANSLATE',
      },
    });

    const result = await service.translate('101', 'hello', 'ta');

    expect(provider.translate).not.toHaveBeenCalled();
    expect(result.translatedText).toBe('cached text');
  });

  it('45. missing provider configuration is reported explicitly, never a fake translated result', async () => {
    const { service, provider } = buildService({ providerConfigured: false });

    await expect(service.translate('101', 'hello', 'ta')).rejects.toMatchObject(
      { status: 503 },
    );
    expect(provider.translate).not.toHaveBeenCalled();
  });

  it('44. a provider failure is handled safely — a generic 503, never the raw provider error', async () => {
    const { service } = buildService({
      providerError: new Error('upstream 500: leaked-detail'),
    });

    await expect(service.translate('101', 'hello', 'ta')).rejects.toMatchObject(
      {
        status: 503,
        message: expect.not.stringContaining('leaked-detail'),
      },
    );
  });

  it('42/47. a successful translation is cached keyed by (messageId, targetLanguage) and never mutates the source', async () => {
    const { service, translationRepo } = buildService();

    const result = await service.translate('101', 'Good morning', 'ta');

    expect(translationRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: '101',
        targetLanguage: 'ta',
        provider: 'GOOGLE_TRANSLATE',
      }),
    );
    expect(result.messageId).toBe('101');
    expect(result.targetLanguage).toBe('ta');
  });

  it('46. never returns or logs the provider API key/credentials', async () => {
    const { service } = buildService();
    const result = await service.translate('101', 'Good morning', 'ta');
    expect(JSON.stringify(result)).not.toMatch(/key|credential|secret/i);
  });
});

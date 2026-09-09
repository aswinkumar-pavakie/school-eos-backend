// App configuration loader — typed accessor over process.env, consumed via ConfigService.

export interface AppConfig {
  port: number;
  database: {
    url: string;
  };
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
  };
  auth: {
    lockoutThreshold: number;
    lockoutMinutes: number;
    refreshTokenTtlDays: number;
    otpTtlMinutes: number;
  };
  finance: {
    paymentWebhookSecret: string;
    refundAutoApproveThresholdPaise: string;
  };
  razorpay: {
    keyId: string;
    keySecret: string;
    webhookSecret: string;
  };
  storage: {
    supabaseUrl: string;
    serviceRoleKey: string;
    photosBucket: string;
    documentsBucket: string;
  };
  google: {
    oauthClientId: string;
    oauthClientSecret: string;
    oauthRedirectUri: string;
    // Keyed by encryption_key_id on google_account_connection — add "v2" etc. here
    // (and a matching branch in google-token-crypto.util.ts) to rotate without ever
    // hard-coding a key in source.
    tokenEncryptionKeys: Record<string, string>;
  };
  translation: {
    // Google Cloud Translation v2 REST API, chosen for consistency with the
    // Google APIs this project already trusts (Calendar/Meet) rather than
    // introducing an unrelated vendor with no precedent here. Empty string means
    // "not configured" — TranslationService reports this explicitly rather than
    // faking a translated result (see messaging/translation/README notes).
    apiKey: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  },
  auth: {
    lockoutThreshold: parseInt(process.env.AUTH_LOCKOUT_THRESHOLD ?? '5', 10),
    lockoutMinutes: parseInt(process.env.AUTH_LOCKOUT_MINUTES ?? '15', 10),
    refreshTokenTtlDays: parseInt(process.env.AUTH_REFRESH_TOKEN_TTL_DAYS ?? '30', 10),
    otpTtlMinutes: parseInt(process.env.AUTH_OTP_TTL_MINUTES ?? '10', 10),
  },
  finance: {
    paymentWebhookSecret: process.env.FINANCE_PAYMENT_WEBHOOK_SECRET ?? '',
    // ₹5,000 default — a school's actual threshold is a business decision, not a
    // literal spec value; override via env, never hardcode a second copy elsewhere.
    refundAutoApproveThresholdPaise: process.env.FINANCE_REFUND_AUTO_APPROVE_THRESHOLD_PAISE ?? '500000',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  },
  storage: {
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    photosBucket: process.env.SUPABASE_PHOTOS_BUCKET ?? 'person-photos',
    documentsBucket: process.env.SUPABASE_DOCUMENTS_BUCKET ?? 'documents',
  },
  google: {
    oauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    oauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    oauthRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '',
    tokenEncryptionKeys: {
      v1: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY_V1 ?? '',
    },
  },
  translation: {
    apiKey: process.env.GOOGLE_TRANSLATE_API_KEY ?? '',
  },
});

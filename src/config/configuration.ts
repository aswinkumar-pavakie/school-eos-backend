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
  storage: {
    supabaseUrl: string;
    serviceRoleKey: string;
    photosBucket: string;
    documentsBucket: string;
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
  storage: {
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    photosBucket: process.env.SUPABASE_PHOTOS_BUCKET ?? 'person-photos',
    documentsBucket: process.env.SUPABASE_DOCUMENTS_BUCKET ?? 'documents',
  },
});

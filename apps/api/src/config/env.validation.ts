import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const intFromEnv = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number().int().min(min).max(max));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: intFromEnv(3000, 1, 65535),
    LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
    TRUST_PROXY: bool.default(false),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    JWT_ACCESS_TTL: z.string().default('1h'),
    SESSION_TTL_DAYS: intFromEnv(7, 1, 365),
    LOGIN_MAX_FAILED_ATTEMPTS: intFromEnv(5, 1, 100),
    LOGIN_LOCKOUT_MINUTES: intFromEnv(15, 1, 1440),

    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    /** Public URL of the web app; used to build links in messages (invites, reviews, payments). */
    APP_BASE_URL: z.string().url().default('http://localhost:5173'),
    /** Public URL of this API (for provider webhooks / status callbacks). Optional. */
    API_PUBLIC_URL: z.string().url().optional(),
    ACCESS_SYNC_ON_BOOT: bool.default(true),
    CURRENCY: z.string().length(3).default('INR'),
    MAX_JSON_BODY_MB: intFromEnv(2, 1, 50),
    DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    UPLOAD_DIR: z.string().default('./storage/uploads'),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(false),
    MAX_UPLOAD_MB: intFromEnv(10, 1, 100),
    MALWARE_SCAN: z.enum(['off', 'clamav']).default('off'),
    CLAMAV_HOST: z.string().optional(),
    CLAMAV_PORT: intFromEnv(3310, 1, 65535),

    BACKUP_DIR: z.string().default('./storage/backups'),
    BACKUP_RETENTION_DAYS: intFromEnv(14, 1, 3650),
    BACKUP_SCHEDULE_ENABLED: bool.default(false),
    BACKUP_HOUR_LOCAL: intFromEnv(2, 0, 23),
    BACKUP_ENCRYPTION_KEY: z
      .string()
      .optional()
      .refine((v) => !v || /^[0-9a-fA-F]{64}$/.test(v), 'BACKUP_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

    SCHEDULER_ENABLED: bool.default(false),
    REMINDER_INTERVAL_MINUTES: intFromEnv(15, 1, 1440),

    MESSAGING_PROVIDER: z.enum(['console', 'twilio']).default('console'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_SMS_FROM: z.string().optional(),
    TWILIO_WHATSAPP_FROM: z.string().optional(),

    MAIL_PROVIDER: z.enum(['console', 'resend', 'sendgrid']).default('console'),
    MAIL_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    /** Directory containing pg_dump/pg_restore when they are not on PATH. */
    PG_BIN_DIR: z.string().optional(),

    PAYMENTS_PROVIDER: z.enum(['none', 'stripe']).default('none'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    SENTRY_DSN: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z
      .union([z.number(), z.string()])
      .optional()
      .transform((v) => (v === undefined || v === '' ? 0.1 : Number(v)))
      .pipe(z.number().min(0).max(1)),

    SEED_PASSWORD: z.string().optional(),
    ALLOW_SEED: bool.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.JWT_SECRET.length < 32 || /^(super-secret|secret|changeme)/i.test(env.JWT_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'In production JWT_SECRET must be a random string of at least 32 characters',
        });
      }
      if (env.MESSAGING_PROVIDER === 'twilio') {
        for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] as const) {
          if (!env[k]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: `${k} is required when MESSAGING_PROVIDER=twilio` });
        }
        if (!env.TWILIO_SMS_FROM && !env.TWILIO_WHATSAPP_FROM) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['TWILIO_SMS_FROM'], message: 'TWILIO_SMS_FROM or TWILIO_WHATSAPP_FROM is required when MESSAGING_PROVIDER=twilio' });
        }
      }
      if (env.STORAGE_DRIVER === 's3' && !env.S3_BUCKET) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['S3_BUCKET'], message: 'S3_BUCKET is required when STORAGE_DRIVER=s3' });
      }
      if (env.MAIL_PROVIDER !== 'console') {
        for (const k of ['MAIL_API_KEY', 'MAIL_FROM'] as const) {
          if (!env[k]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: `${k} is required when MAIL_PROVIDER=${env.MAIL_PROVIDER}` });
        }
      }
      if (env.PAYMENTS_PROVIDER === 'stripe') {
        for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const) {
          if (!env[k]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: `${k} is required when PAYMENTS_PROVIDER=stripe` });
        }
      }
      if (env.MALWARE_SCAN === 'clamav' && !env.CLAMAV_HOST) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['CLAMAV_HOST'], message: 'CLAMAV_HOST is required when MALWARE_SCAN=clamav' });
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

/** Used by ConfigModule.forRoot({ validate }). Throws a readable error and stops boot on invalid config. */
export function validateEnv(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}

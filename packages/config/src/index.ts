import { z } from 'zod';

export * from './secrets.js';

const environmentSchema = z.enum(['development', 'test', 'production']);
const logLevelSchema = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);
const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/u);
const optionalEnvironmentValue = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const runtimeConfigSchema = z.object({
  NODE_ENV: environmentSchema.default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: logLevelSchema.default('info'),
  DATABASE_URL: z.string().min(1),
  APP_TIME_ZONE: z.string().min(1).default('Asia/Shanghai'),
  APP_BASE_CURRENCY: currencyCodeSchema.default('CNY'),
  FRANKFURTER_BASE_URL: z.url().default('https://api.frankfurter.dev/v2'),
  APP_MASTER_KEY: optionalEnvironmentValue(z.string().min(1)),
  APP_ORIGIN: optionalEnvironmentValue(z.url()),
  COOKIE_SECURE: optionalEnvironmentValue(
    z.enum(['true', 'false']).transform((value) => value === 'true'),
  ),
  WEB_DIST_DIR: optionalEnvironmentValue(z.string().min(1)),
  ATTACHMENTS_DIR: z.string().min(1).default('./.data/attachments'),
  ATTACHMENT_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(104_857_600)
    .default(20_971_520),
  ATTACHMENT_MAX_COUNT_PER_ASSET: z.coerce.number().int().min(1).max(200).default(50),
  TELEGRAM_BOT_TOKEN: optionalEnvironmentValue(z.string().min(20).max(300)),
  TELEGRAM_CHAT_ID: optionalEnvironmentValue(z.string().min(1).max(120)),
  REMINDER_WEBHOOK_URL: optionalEnvironmentValue(z.url()),
  REMINDER_WEBHOOK_SECRET: optionalEnvironmentValue(z.string().max(500)),
  REMINDER_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(10_000),
  REMINDER_EXPANSION_DAYS: z.coerce.number().int().min(1).max(730).default(400),
  REMINDER_DELIVERY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(4),
  REMINDER_CLAIM_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  TAVILY_API_KEY: optionalEnvironmentValue(z.string().min(10).max(300)),
  TAVILY_BASE_URL: z.url().default('https://api.tavily.com'),
  AI_BASE_URL: optionalEnvironmentValue(z.url()),
  AI_API_KEY: optionalEnvironmentValue(z.string().min(8).max(500)),
  AI_MODEL: optionalEnvironmentValue(z.string().min(1).max(160)),
  AI_PROTOCOL: z.enum(['chat_completions', 'responses']).default('chat_completions'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(3_000).max(180_000).default(45_000),
  AI_PROVIDER_NAME: z.string().min(1).max(80).default('openai-compatible'),
  AI_MONTHLY_BUDGET: z.coerce.number().int().min(0).max(10_000).default(50),
  AI_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
  AI_SEARCH_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(7 * 24 * 60 * 60 * 1000)
    .default(24 * 60 * 60 * 1000),
  VALUATION_CLAIM_LIMIT: z.coerce.number().int().min(1).max(50).default(5),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  return runtimeConfigSchema.parse(environment);
}

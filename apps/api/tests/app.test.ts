import { describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '@thingcost/config';

import { buildApp } from '../src/app.js';

const testConfig: RuntimeConfig = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 3000,
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
  APP_TIME_ZONE: 'Asia/Shanghai',
  APP_BASE_CURRENCY: 'CNY',
  FRANKFURTER_BASE_URL: 'https://api.frankfurter.dev/v2',
  ATTACHMENTS_DIR: '/tmp/chronicle-app-test-attachments',
  ATTACHMENT_MAX_BYTES: 20_971_520,
  ATTACHMENT_MAX_COUNT_PER_ASSET: 50,
  REMINDER_POLL_INTERVAL_MS: 10_000,
  REMINDER_EXPANSION_DAYS: 400,
  REMINDER_DELIVERY_MAX_ATTEMPTS: 4,
  REMINDER_CLAIM_LIMIT: 20,
  TAVILY_BASE_URL: 'https://api.tavily.com',
  AI_PROTOCOL: 'chat_completions',
  AI_TIMEOUT_MS: 45_000,
  AI_PROVIDER_NAME: 'openai-compatible',
  AI_MONTHLY_BUDGET: 50,
  AI_CONCURRENCY: 1,
  AI_SEARCH_CACHE_TTL_MS: 86_400_000,
  VALUATION_CLAIM_LIMIT: 5,
};

describe('application metadata', () => {
  it('reports the API and brand metadata', async () => {
    const app = await buildApp(testConfig);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/meta',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: '物纪',
      englishName: 'Chronicle',
      apiVersion: 'v1',
    });

    await app.close();
  });
});

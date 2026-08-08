import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '@thingcost/config';
import {
  assetStatuses,
  assets,
  categories,
  createDatabase,
  valuationSchedules,
} from '@thingcost/database';

import { runValuationCycle } from '../src/valuation-worker.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const database = databaseUrl ? createDatabase(databaseUrl) : null;

const testConfig: RuntimeConfig = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 3100,
  LOG_LEVEL: 'silent',
  DATABASE_URL: databaseUrl ?? 'postgres://unused:unused@localhost:5432/unused',
  APP_TIME_ZONE: 'Asia/Shanghai',
  APP_BASE_CURRENCY: 'CNY',
  FRANKFURTER_BASE_URL: 'https://api.frankfurter.dev/v2',
  COOKIE_SECURE: false,
  ATTACHMENTS_DIR: '/tmp/chronicle-worker-valuation-attachments',
  ATTACHMENT_MAX_BYTES: 20_971_520,
  ATTACHMENT_MAX_COUNT_PER_ASSET: 50,
  REMINDER_POLL_INTERVAL_MS: 10_000,
  REMINDER_EXPANSION_DAYS: 400,
  REMINDER_DELIVERY_MAX_ATTEMPTS: 3,
  REMINDER_CLAIM_LIMIT: 20,
  TAVILY_BASE_URL: 'https://api.tavily.com',
  AI_PROTOCOL: 'chat_completions',
  AI_TIMEOUT_MS: 45_000,
  AI_PROVIDER_NAME: 'fixture',
  AI_MONTHLY_BUDGET: 50,
  AI_CONCURRENCY: 2,
  AI_SEARCH_CACHE_TTL_MS: 86_400_000,
  VALUATION_CLAIM_LIMIT: 5,
};

const suite = databaseUrl ? describe : describe.skip;

suite('valuation worker integration', () => {
  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    if (!database) return;
    await database.db.execute(sql`
      truncate table
        valuation_snapshots,
        valuation_schedules,
        valuation_search_cache,
        valuation_reports,
        lifecycle_events,
        financial_events,
        assets,
        categories,
        asset_statuses,
        app_settings
      restart identity cascade
    `);
  });

  it('runs due scheduled valuations with fixture providers', async () => {
    if (!database) throw new Error('TEST_DATABASE_URL required');

    await database.db.execute(sql`
      insert into app_settings (id, time_zone, base_currency, initialized_at)
      values ('default', 'Asia/Shanghai', 'CNY', now())
      on conflict (id) do update set time_zone = excluded.time_zone
    `);

    const [category] = await database.db
      .insert(categories)
      .values({ name: '数码', isSystem: true, sortOrder: 1 })
      .returning();
    const [status] = await database.db
      .insert(assetStatuses)
      .values({
        code: 'in_use',
        name: '使用中',
        countsTowardService: true,
        ownershipState: 'held',
        isSystem: true,
        sortOrder: 1,
      })
      .returning();
    if (!category || !status) throw new Error('seed failed');

    const [asset] = await database.db
      .insert(assets)
      .values({
        name: '周期估值相机',
        brand: 'Fujifilm',
        model: 'X100V',
        categoryId: category.id,
        acquisitionType: 'purchase',
        acquisitionDate: '2024-01-01',
        costKnowledge: 'known_amount',
        currentStatusId: status.id,
      })
      .returning();
    if (!asset) throw new Error('asset seed failed');

    await database.db.insert(valuationSchedules).values({
      assetId: asset.id,
      cadence: 'monthly',
      enabled: true,
      nextRunAt: new Date(Date.now() - 60_000),
    });

    const stats = await runValuationCycle(database.db, testConfig);
    expect(stats.dueSchedules).toBe(1);
    expect(stats.completedReports).toBe(1);
    expect(stats.failedRuns).toBe(0);
  });
});

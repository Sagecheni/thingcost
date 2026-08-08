import { createServer, type Server } from 'node:http';

import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '@thingcost/config';
import { createDatabase, reminders } from '@thingcost/database';

import { runReminderCycle } from '../src/reminder-worker.js';

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
  ATTACHMENTS_DIR: '/tmp/chronicle-worker-test-attachments',
  ATTACHMENT_MAX_BYTES: 20_971_520,
  ATTACHMENT_MAX_COUNT_PER_ASSET: 50,
  REMINDER_POLL_INTERVAL_MS: 10_000,
  REMINDER_EXPANSION_DAYS: 400,
  REMINDER_DELIVERY_MAX_ATTEMPTS: 3,
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

interface TestReceiver {
  server: Server;
  url: string;
  requests: Array<{ body: string; signature: string | undefined }>;
  setStatus(status: number): void;
}

async function createReceiver(): Promise<TestReceiver> {
  const requests: Array<{ body: string; signature: string | undefined }> = [];
  let responseStatus = 204;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({
        body: Buffer.concat(chunks).toString('utf8'),
        signature: request.headers['x-chronicle-signature'] as string | undefined,
      });
      response.statusCode = responseStatus;
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Receiver did not bind.');
  return {
    server,
    url: `http://127.0.0.1:${address.port}/reminders`,
    requests,
    setStatus: (status) => {
      responseStatus = status;
    },
  };
}

describe.skipIf(!database)('reminder worker', () => {
  let receiver: TestReceiver;

  beforeEach(async () => {
    if (receiver) {
      await new Promise<void>((resolve) => receiver.server.close(() => resolve()));
    }
    receiver = await createReceiver();
    await database?.db.execute(sql`
      truncate table
        reminder_deliveries,
        reminder_occurrences,
        reminders,
        notification_channels
      restart identity cascade
    `);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => receiver?.server.close(() => resolve()));
    await database?.client.end();
  });

  it('expands and sends a due notification exactly once', async () => {
    if (!database) throw new Error('TEST_DATABASE_URL is required.');
    const now = new Date('2026-08-06T01:00:00.000Z');
    const [reminder] = await database.db
      .insert(reminders)
      .values({
        kind: 'maintenance',
        title: '清洁镜头',
        triggerMode: 'datetime',
        anchorDate: '2026-08-06',
        anchorTime: '09:00',
        anchorAt: now,
        timeZone: 'Asia/Shanghai',
        recurrenceKind: 'once',
        leadMinutes: [0],
        taskMode: 'notification',
        repeatIntervalMinutes: 1_440,
        maxRepeats: 0,
        channelMode: 'default',
        channelKeys: [],
        nextSequence: 0,
        nextOccurrenceAt: now,
      })
      .returning({ id: reminders.id });
    if (!reminder) throw new Error('Expected reminder fixture.');

    const config = {
      ...testConfig,
      REMINDER_WEBHOOK_URL: receiver.url,
      REMINDER_WEBHOOK_SECRET: 'test-secret',
    };
    const first = await runReminderCycle(database.db, config, now);
    expect(first).toMatchObject({
      expandedOccurrences: 1,
      queuedDeliveries: 1,
      sentDeliveries: 1,
    });
    expect(receiver.requests).toHaveLength(1);
    expect(receiver.requests[0]?.body).toContain('清洁镜头');
    expect(receiver.requests[0]?.signature).toMatch(/^sha256=/u);

    const second = await runReminderCycle(
      database.db,
      config,
      new Date(now.getTime() + 60_000),
    );
    expect(second.sentDeliveries).toBe(0);
    expect(receiver.requests).toHaveLength(1);
    const [occurrence] = await database.db.execute<{ status: string }>(sql`
      select status from reminder_occurrences where reminder_id = ${reminder.id}
    `);
    expect(occurrence?.status).toBe('completed');
  });

  it('retries transient provider failures with a bounded attempt count', async () => {
    if (!database) throw new Error('TEST_DATABASE_URL is required.');
    receiver.setStatus(500);
    const now = new Date('2026-08-06T01:00:00.000Z');
    const [reminder] = await database.db
      .insert(reminders)
      .values({
        kind: 'general',
        title: '重试测试',
        triggerMode: 'datetime',
        anchorDate: '2026-08-06',
        anchorTime: '09:00',
        anchorAt: now,
        timeZone: 'Asia/Shanghai',
        recurrenceKind: 'once',
        leadMinutes: [0],
        taskMode: 'notification',
        repeatIntervalMinutes: 1_440,
        maxRepeats: 0,
        channelMode: 'default',
        channelKeys: [],
        nextSequence: 0,
        nextOccurrenceAt: now,
      })
      .returning({ id: reminders.id });
    if (!reminder) throw new Error('Expected reminder fixture.');
    const config = { ...testConfig, REMINDER_WEBHOOK_URL: receiver.url };

    await runReminderCycle(database.db, config, now);
    await runReminderCycle(database.db, config, new Date(now.getTime() + 5 * 60_000));
    await runReminderCycle(database.db, config, new Date(now.getTime() + 15 * 60_000));
    await runReminderCycle(database.db, config, new Date(now.getTime() + 40 * 60_000));

    expect(receiver.requests).toHaveLength(3);
    const [delivery] = await database.db.execute<{
      status: string;
      attempt_count: number;
    }>(sql`
      select status, attempt_count from reminder_deliveries where reminder_id = ${reminder.id}
    `);
    expect(delivery).toMatchObject({ status: 'failed', attempt_count: 3 });
  });

  it('sends bounded repeats for an actionable occurrence after the first delivery', async () => {
    if (!database) throw new Error('TEST_DATABASE_URL is required.');
    const now = new Date('2026-08-06T01:00:00.000Z');
    const [reminder] = await database.db
      .insert(reminders)
      .values({
        kind: 'loan_return',
        title: '归还借出相机',
        triggerMode: 'datetime',
        anchorDate: '2026-08-06',
        anchorTime: '09:00',
        anchorAt: now,
        timeZone: 'Asia/Shanghai',
        recurrenceKind: 'once',
        leadMinutes: [0],
        taskMode: 'actionable',
        repeatIntervalMinutes: 60,
        maxRepeats: 1,
        channelMode: 'default',
        channelKeys: [],
        nextSequence: 0,
        nextOccurrenceAt: now,
      })
      .returning({ id: reminders.id });
    if (!reminder) throw new Error('Expected reminder fixture.');
    const config = { ...testConfig, REMINDER_WEBHOOK_URL: receiver.url };

    await runReminderCycle(database.db, config, now);
    await runReminderCycle(database.db, config, new Date(now.getTime() + 61 * 60_000));
    await runReminderCycle(database.db, config, new Date(now.getTime() + 122 * 60_000));

    expect(receiver.requests).toHaveLength(2);
    const [occurrence] = await database.db.execute<{ repeat_count: number }>(sql`
      select repeat_count from reminder_occurrences where reminder_id = ${reminder.id}
    `);
    expect(occurrence?.repeat_count).toBe(1);
  });
});

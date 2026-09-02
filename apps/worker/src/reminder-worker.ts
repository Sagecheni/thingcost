import { createHmac, randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, isNull, lte, lt } from 'drizzle-orm';

import type { RuntimeConfig } from '@thingcost/config';
import {
  assets,
  reminderDeliveries,
  reminderOccurrences,
  reminders,
  type Database,
} from '@thingcost/database';
import {
  reminderDeliveryTime,
  reminderOccurrenceAt,
  type ReminderSchedule,
} from '@thingcost/domain';

import {
  channelsForReminder,
  resolveWorkerChannels,
  type ProviderChannelConfig,
  type WorkerChannel,
} from './channels.js';

const STALE_CLAIM_MS = 10 * 60_000;
const MAX_EXPANDED_OCCURRENCES_PER_CYCLE = 500;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

export interface ReminderCycleStats {
  expandedOccurrences: number;
  queuedDeliveries: number;
  claimedDeliveries: number;
  sentDeliveries: number;
  failedDeliveries: number;
}

interface DeliveryPayload {
  title: string;
  description: string | null;
  assetName: string | null;
  dueAt: Date;
  timeZone: string;
  taskMode: 'notification' | 'actionable';
  kind: 'lead' | 'repeat' | 'snooze';
}

function scheduleFromReminder(reminder: typeof reminders.$inferSelect): ReminderSchedule {
  return {
    anchorDate: reminder.anchorDate,
    anchorTime: reminder.anchorTime,
    timeZone: reminder.timeZone,
    recurrenceKind: reminder.recurrenceKind,
    frequency: reminder.frequency,
    recurrenceInterval: reminder.recurrenceInterval,
    endsOn: reminder.endsOn,
    occurrenceLimit: reminder.occurrenceLimit,
  };
}

function deliveryDedupeKey(
  occurrenceId: string,
  kind: 'lead' | 'repeat' | 'snooze',
  channelKey: string,
  discriminator: number,
): string {
  return `${occurrenceId}:${kind}:${discriminator}:${channelKey}`;
}

function nextAttemptBackoff(attempt: number, now: Date): Date {
  const delay = Math.min(5 * 60_000 * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);
  return new Date(now.getTime() + delay);
}

function formatDueAt(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function messageForDelivery(payload: DeliveryPayload): string {
  const prefix = payload.kind === 'repeat' ? '待确认提醒再次到期' : '物纪提醒';
  const lines = [
    `${prefix}：${payload.title}`,
    payload.assetName ? `物品：${payload.assetName}` : null,
    `时间：${formatDueAt(payload.dueAt, payload.timeZone)}`,
    payload.description ? `备注：${payload.description}` : null,
    payload.taskMode === 'actionable' ? '请在物纪中确认、忽略或稍后提醒。' : null,
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}

async function insertDeliveries(
  db: Database,
  reminder: typeof reminders.$inferSelect,
  occurrenceId: string,
  dueAt: Date,
  kind: 'lead' | 'repeat' | 'snooze',
  channels: WorkerChannel[],
  config: RuntimeConfig,
  now: Date,
  repeatDiscriminator: number,
): Promise<number> {
  let inserted = 0;
  const leadMinutes = kind === 'lead' ? reminder.leadMinutes : [0];
  for (const channel of channels) {
    for (const lead of leadMinutes) {
      const scheduledAt = kind === 'lead' ? reminderDeliveryTime(dueAt, lead) : now;
      const dedupeKey = deliveryDedupeKey(
        occurrenceId,
        kind,
        channel.key,
        kind === 'lead' ? lead : repeatDiscriminator,
      );
      const [created] = await db
        .insert(reminderDeliveries)
        .values({
          reminderId: reminder.id,
          occurrenceId,
          channelKey: channel.key,
          provider: channel.provider,
          kind,
          dedupeKey,
          scheduledAt,
          nextAttemptAt: scheduledAt,
          maxAttempts: config.REMINDER_DELIVERY_MAX_ATTEMPTS,
        })
        .onConflictDoNothing({ target: reminderDeliveries.dedupeKey })
        .returning({ id: reminderDeliveries.id });
      if (created) inserted += 1;
    }
  }
  return inserted;
}

async function expandSchedules(
  db: Database,
  config: RuntimeConfig,
  now: Date,
): Promise<{ expandedOccurrences: number; queuedDeliveries: number }> {
  const horizon = new Date(now.getTime() + config.REMINDER_EXPANSION_DAYS * 86_400_000);
  const candidates = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.status, 'active'), lte(reminders.nextOccurrenceAt, horizon)))
    .orderBy(asc(reminders.nextOccurrenceAt))
    .limit(MAX_EXPANDED_OCCURRENCES_PER_CYCLE);
  const channels = await resolveWorkerChannels(db, config);
  let expandedOccurrences = 0;
  let queuedDeliveries = 0;

  for (const reminder of candidates) {
    let sequence = reminder.nextSequence;
    let nextAt: Date | null = reminder.nextOccurrenceAt;
    let reminderExpanded = 0;
    while (
      nextAt &&
      nextAt <= horizon &&
      reminderExpanded < MAX_EXPANDED_OCCURRENCES_PER_CYCLE
    ) {
      const schedule = scheduleFromReminder(reminder);
      const dueAt = reminderOccurrenceAt(schedule, sequence);
      if (!dueAt) {
        nextAt = null;
        break;
      }

      const [occurrence] = await db
        .insert(reminderOccurrences)
        .values({ reminderId: reminder.id, sequence, dueAt })
        .onConflictDoNothing({
          target: [reminderOccurrences.reminderId, reminderOccurrences.sequence],
        })
        .returning({ id: reminderOccurrences.id });
      let occurrenceId = occurrence?.id;
      if (!occurrenceId) {
        const [existing] = await db
          .select({ id: reminderOccurrences.id })
          .from(reminderOccurrences)
          .where(
            and(
              eq(reminderOccurrences.reminderId, reminder.id),
              eq(reminderOccurrences.sequence, sequence),
            ),
          )
          .limit(1);
        occurrenceId = existing?.id;
      }
      if (!occurrenceId) throw new Error('Reminder occurrence could not be loaded.');

      const selectedChannels = channelsForReminder(
        channels,
        reminder.channelMode,
        reminder.channelKeys,
      );
      queuedDeliveries += await insertDeliveries(
        db,
        reminder,
        occurrenceId,
        dueAt,
        'lead',
        selectedChannels,
        config,
        now,
        0,
      );
      expandedOccurrences += occurrence?.id ? 1 : 0;
      reminderExpanded += 1;
      sequence += 1;
      nextAt = reminderOccurrenceAt(schedule, sequence);
    }

    if (reminderExpanded > 0 || reminder.nextOccurrenceAt === null) {
      await db
        .update(reminders)
        .set({
          nextSequence: sequence,
          nextOccurrenceAt: nextAt,
          updatedAt: now,
        })
        .where(eq(reminders.id, reminder.id));
    }
  }

  return { expandedOccurrences, queuedDeliveries };
}

async function expandSnoozes(
  db: Database,
  config: RuntimeConfig,
  now: Date,
): Promise<number> {
  const rows = await db
    .select({ occurrence: reminderOccurrences, reminder: reminders })
    .from(reminderOccurrences)
    .innerJoin(reminders, eq(reminderOccurrences.reminderId, reminders.id))
    .where(
      and(
        eq(reminderOccurrences.status, 'pending'),
        eq(reminders.status, 'active'),
        lte(reminderOccurrences.snoozedUntil, now),
      ),
    )
    .limit(MAX_EXPANDED_OCCURRENCES_PER_CYCLE);
  const channels = await resolveWorkerChannels(db, config);
  let inserted = 0;
  for (const row of rows) {
    const selected = channelsForReminder(
      channels,
      row.reminder.channelMode,
      row.reminder.channelKeys,
    );
    if (selected.length === 0) {
      await db
        .update(reminderOccurrences)
        .set({ snoozedUntil: null, updatedAt: now })
        .where(eq(reminderOccurrences.id, row.occurrence.id));
      continue;
    }
    inserted += await insertDeliveries(
      db,
      row.reminder,
      row.occurrence.id,
      row.occurrence.dueAt,
      'snooze',
      selected,
      config,
      now,
      row.occurrence.snoozeCount,
    );
  }
  return inserted;
}

async function expandRepeats(
  db: Database,
  config: RuntimeConfig,
  now: Date,
): Promise<number> {
  const rows = await db
    .select({ occurrence: reminderOccurrences, reminder: reminders })
    .from(reminderOccurrences)
    .innerJoin(reminders, eq(reminderOccurrences.reminderId, reminders.id))
    .where(
      and(
        eq(reminderOccurrences.status, 'pending'),
        eq(reminders.status, 'active'),
        eq(reminders.taskMode, 'actionable'),
        lte(reminderOccurrences.dueAt, now),
        isNull(reminderOccurrences.snoozedUntil),
        lte(reminderOccurrences.lastNotifiedAt, new Date(now.getTime() - 10 * 60_000)),
      ),
    )
    .limit(MAX_EXPANDED_OCCURRENCES_PER_CYCLE);
  const channels = await resolveWorkerChannels(db, config);
  let inserted = 0;
  for (const row of rows) {
    if (
      row.occurrence.lastNotifiedAt === null ||
      row.occurrence.repeatCount >= row.reminder.maxRepeats ||
      row.occurrence.lastNotifiedAt.getTime() +
        row.reminder.repeatIntervalMinutes * 60_000 >
        now.getTime()
    ) {
      continue;
    }
    const selected = channelsForReminder(
      channels,
      row.reminder.channelMode,
      row.reminder.channelKeys,
    );
    inserted += await insertDeliveries(
      db,
      row.reminder,
      row.occurrence.id,
      row.occurrence.dueAt,
      'repeat',
      selected,
      config,
      now,
      row.occurrence.repeatCount + 1,
    );
  }
  return inserted;
}

async function recoverStaleClaims(db: Database, now: Date): Promise<void> {
  await db
    .update(reminderDeliveries)
    .set({
      status: 'queued',
      lockedAt: null,
      lockedBy: null,
      nextAttemptAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(reminderDeliveries.status, 'processing'),
        lte(reminderDeliveries.lockedAt, new Date(now.getTime() - STALE_CLAIM_MS)),
      ),
    );
}

async function sendTelegram(
  configuration: ProviderChannelConfig,
  text: string,
): Promise<{ status: number; excerpt: string }> {
  const telegram = configuration as { botToken: string; chatId: string };
  const response = await fetch(
    `https://api.telegram.org/bot${telegram.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: telegram.chatId, text }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.text();
  if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  let parsed: { ok?: boolean } = {};
  try {
    parsed = JSON.parse(body) as { ok?: boolean };
  } catch {
    // A successful response without JSON is still accepted based on HTTP status.
  }
  if (parsed.ok === false) throw new Error('Telegram rejected the message');
  return { status: response.status, excerpt: body.slice(0, 500) };
}

async function sendWebhook(
  configuration: ProviderChannelConfig,
  payload: object,
): Promise<{ status: number; excerpt: string }> {
  const webhook = configuration as { url: string; secret?: string };
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (webhook.secret) {
    headers['x-chronicle-signature'] = `sha256=${createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex')}`;
  }
  const response = await fetch(webhook.url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const responseBody = await response.text();
  if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
  return { status: response.status, excerpt: responseBody.slice(0, 500) };
}

async function sendWecom(
  configuration: ProviderChannelConfig,
  text: string,
): Promise<{ status: number; excerpt: string }> {
  const wecom = configuration as { webhookUrl: string };
  const response = await fetch(wecom.webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: { content: text.slice(0, 2048) },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const responseBody = await response.text();
  if (!response.ok) throw new Error(`企业微信 HTTP ${String(response.status)}`);
  let parsed: { errcode?: number } = {};
  try {
    parsed = JSON.parse(responseBody) as { errcode?: number };
  } catch {
    // accept HTTP-level success
  }
  if (typeof parsed.errcode === 'number' && parsed.errcode !== 0) {
    throw new Error(`企业微信 errcode ${String(parsed.errcode)}`);
  }
  return { status: response.status, excerpt: responseBody.slice(0, 500) };
}

async function sendServerchan(
  configuration: ProviderChannelConfig,
  title: string,
  description: string,
): Promise<{ status: number; excerpt: string }> {
  const serverchan = configuration as { sendKey: string };
  const response = await fetch(
    `https://sctapi.ftqq.com/${encodeURIComponent(serverchan.sendKey)}.send`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: title.slice(0, 100),
        desp: description.slice(0, 64_000),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const responseBody = await response.text();
  if (!response.ok) throw new Error(`Server酱 HTTP ${String(response.status)}`);
  return { status: response.status, excerpt: responseBody.slice(0, 500) };
}

async function sendPushplus(
  configuration: ProviderChannelConfig,
  title: string,
  description: string,
): Promise<{ status: number; excerpt: string }> {
  const pushplus = configuration as { token: string; topic?: string };
  const response = await fetch('https://www.pushplus.plus/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: pushplus.token,
      ...(pushplus.topic ? { topic: pushplus.topic } : {}),
      title: title.slice(0, 100),
      content: description.slice(0, 64_000),
      template: 'txt',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const responseBody = await response.text();
  if (!response.ok) throw new Error(`PushPlus HTTP ${String(response.status)}`);
  let parsed: { code?: number } = {};
  try {
    parsed = JSON.parse(responseBody) as { code?: number };
  } catch {
    // HTTP success is still useful when the provider returns non-JSON text.
  }
  if (typeof parsed.code === 'number' && parsed.code !== 200) {
    throw new Error(`PushPlus code ${String(parsed.code)}`);
  }
  return { status: response.status, excerpt: responseBody.slice(0, 500) };
}

async function sendBark(
  configuration: ProviderChannelConfig,
  title: string,
  description: string,
): Promise<{ status: number; excerpt: string }> {
  const bark = configuration as {
    serverUrl: string;
    deviceKey: string;
    group?: string;
    sound?: string;
  };
  const response = await fetch(bark.serverUrl.replace(/\/+$/u, '') + '/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      device_key: bark.deviceKey,
      title: title.slice(0, 200),
      body: description.slice(0, 10_000),
      ...(bark.group ? { group: bark.group } : {}),
      ...(bark.sound ? { sound: bark.sound } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const responseBody = await response.text();
  if (!response.ok) throw new Error('Bark HTTP ' + String(response.status));
  let parsed: { code?: number | string } = {};
  try {
    parsed = JSON.parse(responseBody) as { code?: number | string };
  } catch {
    // HTTP success is still accepted when a compatible self-hosted server returns no JSON.
  }
  if (
    (typeof parsed.code === 'number' && parsed.code !== 200) ||
    (typeof parsed.code === 'string' && parsed.code !== '200')
  ) {
    throw new Error('Bark code ' + String(parsed.code));
  }
  return { status: response.status, excerpt: responseBody.slice(0, 500) };
}

async function completeOrdinaryOccurrence(db: Database, occurrenceId: string, now: Date) {
  const [row] = await db
    .select({ occurrence: reminderOccurrences, reminder: reminders })
    .from(reminderOccurrences)
    .innerJoin(reminders, eq(reminderOccurrences.reminderId, reminders.id))
    .where(eq(reminderOccurrences.id, occurrenceId))
    .limit(1);
  if (
    !row ||
    row.reminder.taskMode !== 'notification' ||
    row.occurrence.status !== 'pending'
  ) {
    return;
  }
  if (row.occurrence.dueAt > now) return;
  const deliveries = await db
    .select({ status: reminderDeliveries.status })
    .from(reminderDeliveries)
    .where(eq(reminderDeliveries.occurrenceId, occurrenceId));
  if (
    deliveries.some(
      (delivery) => !['sent', 'failed', 'cancelled'].includes(delivery.status),
    )
  ) {
    return;
  }
  await db
    .update(reminderOccurrences)
    .set({ status: 'completed', resolvedAt: now, updatedAt: now })
    .where(eq(reminderOccurrences.id, occurrenceId));
}

async function processDeliveries(
  db: Database,
  config: RuntimeConfig,
  now: Date,
): Promise<{
  claimedDeliveries: number;
  sentDeliveries: number;
  failedDeliveries: number;
}> {
  await recoverStaleClaims(db, now);
  const candidates = await db
    .select()
    .from(reminderDeliveries)
    .where(
      and(
        inArray(reminderDeliveries.status, ['queued', 'failed']),
        lte(reminderDeliveries.nextAttemptAt, now),
        lt(reminderDeliveries.attemptCount, reminderDeliveries.maxAttempts),
      ),
    )
    .orderBy(asc(reminderDeliveries.nextAttemptAt))
    .limit(config.REMINDER_CLAIM_LIMIT);
  const workerId = `${process.pid}:${randomUUID()}`;
  let claimedDeliveries = 0;
  let sentDeliveries = 0;
  let failedDeliveries = 0;
  const channels = await resolveWorkerChannels(db, config);

  for (const candidate of candidates) {
    const [claimed] = await db
      .update(reminderDeliveries)
      .set({ status: 'processing', lockedAt: now, lockedBy: workerId, updatedAt: now })
      .where(
        and(
          eq(reminderDeliveries.id, candidate.id),
          inArray(reminderDeliveries.status, ['queued', 'failed']),
          lte(reminderDeliveries.nextAttemptAt, now),
          lt(reminderDeliveries.attemptCount, reminderDeliveries.maxAttempts),
        ),
      )
      .returning();
    if (!claimed) continue;
    claimedDeliveries += 1;

    const [row] = await db
      .select({
        delivery: reminderDeliveries,
        occurrence: reminderOccurrences,
        reminder: reminders,
        assetName: assets.name,
      })
      .from(reminderDeliveries)
      .innerJoin(
        reminderOccurrences,
        eq(reminderDeliveries.occurrenceId, reminderOccurrences.id),
      )
      .innerJoin(reminders, eq(reminderDeliveries.reminderId, reminders.id))
      .leftJoin(assets, eq(reminders.assetId, assets.id))
      .where(eq(reminderDeliveries.id, claimed.id))
      .limit(1);
    if (!row) continue;

    if (row.occurrence.status !== 'pending' || row.reminder.status !== 'active') {
      await db
        .update(reminderDeliveries)
        .set({ status: 'cancelled', lockedAt: null, lockedBy: null, updatedAt: now })
        .where(eq(reminderDeliveries.id, claimed.id));
      continue;
    }
    if (row.occurrence.snoozedUntil && row.occurrence.snoozedUntil > now) {
      await db
        .update(reminderDeliveries)
        .set({
          status: 'queued',
          nextAttemptAt: row.occurrence.snoozedUntil,
          lockedAt: null,
          lockedBy: null,
          updatedAt: now,
        })
        .where(eq(reminderDeliveries.id, claimed.id));
      continue;
    }

    const channel = channels.find(
      (item) => item.key === row.delivery.channelKey && item.enabled,
    );
    if (!channel) {
      failedDeliveries += 1;
      await db
        .update(reminderDeliveries)
        .set({
          status: 'failed',
          attemptCount: row.delivery.attemptCount + 1,
          maxAttempts: row.delivery.attemptCount + 1,
          lastError: '通知渠道不存在、未启用或无法解密',
          lockedAt: null,
          lockedBy: null,
          updatedAt: now,
        })
        .where(eq(reminderDeliveries.id, claimed.id));
      await completeOrdinaryOccurrence(db, row.occurrence.id, now);
      continue;
    }

    const text = messageForDelivery({
      title: row.reminder.title,
      description: row.reminder.description,
      assetName: row.assetName,
      dueAt: row.occurrence.dueAt,
      timeZone: row.reminder.timeZone,
      taskMode: row.reminder.taskMode,
      kind: row.delivery.kind,
    });
    try {
      const result =
        channel.provider === 'telegram'
          ? await sendTelegram(channel.configuration, text)
          : channel.provider === 'wecom'
            ? await sendWecom(channel.configuration, text)
            : channel.provider === 'serverchan'
              ? await sendServerchan(channel.configuration, row.reminder.title, text)
              : channel.provider === 'pushplus'
                ? await sendPushplus(channel.configuration, row.reminder.title, text)
                : channel.provider === 'bark'
                  ? await sendBark(channel.configuration, row.reminder.title, text)
                  : await sendWebhook(channel.configuration, {
                      event: 'chronicle.reminder',
                      deliveryId: row.delivery.id,
                      reminderId: row.reminder.id,
                      occurrenceId: row.occurrence.id,
                      title: row.reminder.title,
                      description: row.reminder.description,
                      assetName: row.assetName,
                      dueAt: row.occurrence.dueAt.toISOString(),
                      taskMode: row.reminder.taskMode,
                      kind: row.delivery.kind,
                    });
      const attemptCount = row.delivery.attemptCount + 1;
      await db.transaction(async (transaction) => {
        await transaction
          .update(reminderDeliveries)
          .set({
            status: 'sent',
            attemptCount,
            httpStatus: result.status,
            responseExcerpt: result.excerpt,
            sentAt: now,
            lockedAt: null,
            lockedBy: null,
            updatedAt: now,
          })
          .where(eq(reminderDeliveries.id, claimed.id));
        await transaction
          .update(reminderOccurrences)
          .set({
            lastNotifiedAt: now,
            ...(row.delivery.kind === 'repeat'
              ? { repeatCount: row.occurrence.repeatCount + 1 }
              : {}),
            ...(row.delivery.kind === 'snooze' ? { snoozedUntil: null } : {}),
            updatedAt: now,
          })
          .where(eq(reminderOccurrences.id, row.occurrence.id));
      });
      sentDeliveries += 1;
      await completeOrdinaryOccurrence(db, row.occurrence.id, now);
    } catch (error) {
      const attemptCount = row.delivery.attemptCount + 1;
      const exhausted = attemptCount >= row.delivery.maxAttempts;
      failedDeliveries += 1;
      await db
        .update(reminderDeliveries)
        .set({
          status: 'failed',
          attemptCount,
          nextAttemptAt: exhausted ? now : nextAttemptBackoff(attemptCount, now),
          lastError:
            error instanceof Error ? error.message.slice(0, 1_000) : '通知发送失败',
          lockedAt: null,
          lockedBy: null,
          updatedAt: now,
        })
        .where(eq(reminderDeliveries.id, claimed.id));
      if (exhausted) await completeOrdinaryOccurrence(db, row.occurrence.id, now);
    }
  }

  return { claimedDeliveries, sentDeliveries, failedDeliveries };
}

export async function runReminderCycle(
  db: Database,
  config: RuntimeConfig,
  now: Date = new Date(),
): Promise<ReminderCycleStats> {
  const expanded = await expandSchedules(db, config, now);
  const snoozed = await expandSnoozes(db, config, now);
  const repeats = await expandRepeats(db, config, now);
  const processed = await processDeliveries(db, config, now);
  return {
    expandedOccurrences: expanded.expandedOccurrences,
    queuedDeliveries: expanded.queuedDeliveries + snoozed + repeats,
    ...processed,
  };
}

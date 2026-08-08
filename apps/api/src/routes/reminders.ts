import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { RuntimeConfig } from '@thingcost/config';
import {
  createNotificationChannelSchema,
  createReminderSchema,
  testNotificationChannelInputSchema,
  testNotificationChannelResultSchema,
  notificationChannelListSchema,
  notificationChannelSchema,
  reminderDetailSchema,
  reminderListSchema,
  reminderOccurrenceListSchema,
  reminderOccurrenceSchema,
  snoozeReminderOccurrenceSchema,
  updateNotificationChannelSchema,
  updateReminderSchema,
  uuidSchema,
} from '@thingcost/contracts';
import {
  appSettings,
  assets,
  notificationChannels,
  reminderDeliveries,
  reminderOccurrences,
  reminders,
  subscriptions,
  type Database,
} from '@thingcost/database';
import { localDateTimeParts, zonedDateTimeToUtc } from '@thingcost/domain';

import { requireAuth, sendApiError } from '../lib/http.js';
import {
  createNotificationChannel as createChannel,
  listNotificationChannels,
  resolveChannel,
  updateNotificationChannel,
} from '../services/notification-channels.js';
import {
  getReminder,
  listReminders,
  listUpcomingReminderOccurrences,
} from '../services/reminders.js';
import { sendNotificationChannelTest } from '../services/notification-delivery.js';

interface ReminderRouteOptions {
  db: Database;
  config: RuntimeConfig;
}

const reminderParamsSchema = z.object({ id: uuidSchema });
const occurrenceParamsSchema = z.object({ occurrenceId: uuidSchema });
const channelParamsSchema = z.object({ id: uuidSchema });
const upcomingQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  until: z.iso.datetime().optional(),
});

function reminderAnchor(
  trigger: z.infer<typeof createReminderSchema>['trigger'],
  timeZone: string,
): { anchorDate: string; anchorTime: string; anchorAt: Date } {
  if (trigger.mode === 'date') {
    return {
      anchorDate: trigger.dueDate,
      anchorTime: trigger.timeOfDay,
      anchorAt: zonedDateTimeToUtc(trigger.dueDate, trigger.timeOfDay, timeZone),
    };
  }

  const anchorAt = new Date(trigger.dueAt);
  if (Number.isNaN(anchorAt.getTime()))
    throw new RangeError('Invalid reminder datetime.');
  const local = localDateTimeParts(anchorAt, timeZone);
  return { anchorDate: local.date, anchorTime: local.time, anchorAt };
}

function reminderOccurrenceFromDetail(
  detail: Awaited<ReturnType<typeof getReminder>>,
  id: string,
) {
  return detail?.occurrences.find((occurrence) => occurrence.id === id) ?? null;
}

export function registerReminderRoutes(
  app: FastifyInstance,
  options: ReminderRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/api/v1/reminders',
    { schema: { response: { 200: reminderListSchema } } },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:read'] }))
      )
        return reply;
      return listReminders(options.db);
    },
  );

  typedApp.get(
    '/api/v1/reminders/upcoming',
    {
      schema: {
        querystring: upcomingQuerySchema,
        response: { 200: reminderOccurrenceListSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:read'] }))
      )
        return reply;
      const from = request.query.from ? new Date(request.query.from) : new Date();
      const until = request.query.until
        ? new Date(request.query.until)
        : new Date(from.getTime() + 90 * 86_400_000);
      return listUpcomingReminderOccurrences(options.db, from, until);
    },
  );

  typedApp.get(
    '/api/v1/reminders/:id',
    {
      schema: {
        params: reminderParamsSchema,
        response: { 200: reminderDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:read'] }))
      )
        return reply;
      const reminder = await getReminder(options.db, request.params.id);
      return reminder ?? sendApiError(reply, 404, 'REMINDER_NOT_FOUND', '没有找到该提醒');
    },
  );

  typedApp.post(
    '/api/v1/reminders',
    {
      schema: {
        body: createReminderSchema,
        response: { 201: reminderDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:manage'] }))
      )
        return reply;
      const [settings] = await options.db.select().from(appSettings).limit(1);
      if (!settings) throw new Error('Chronicle has not been initialized.');

      if (request.body.assetId) {
        const [asset] = await options.db
          .select({ id: assets.id })
          .from(assets)
          .where(and(eq(assets.id, request.body.assetId), isNull(assets.deletedAt)))
          .limit(1);
        if (!asset) return sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
      }
      if (request.body.subscriptionId) {
        const [subscription] = await options.db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.id, request.body.subscriptionId),
              isNull(subscriptions.deletedAt),
            ),
          )
          .limit(1);
        if (!subscription) {
          return sendApiError(
            reply,
            404,
            'SUBSCRIPTION_NOT_FOUND',
            '没有找到该订阅或许可',
          );
        }
      }

      const anchor = reminderAnchor(request.body.trigger, settings.timeZone);
      const channelKeys = [...new Set(request.body.channelKeys)];
      if (request.body.channelMode === 'override') {
        const available = await listNotificationChannels(options.db, options.config);
        const validKeys = new Set(
          available.filter((channel) => channel.enabled).map((channel) => channel.key),
        );
        if (channelKeys.some((key) => !validKeys.has(key))) {
          return sendApiError(
            reply,
            422,
            'INVALID_CHANNEL',
            '一个或多个通知渠道不存在或未启用',
          );
        }
      }

      const recurrence = request.body.recurrence;
      const [created] = await options.db
        .insert(reminders)
        .values({
          assetId: request.body.assetId ?? null,
          subscriptionId: request.body.subscriptionId ?? null,
          kind: request.body.kind,
          title: request.body.title,
          description: request.body.description ?? null,
          triggerMode: request.body.trigger.mode,
          anchorDate: anchor.anchorDate,
          anchorTime: anchor.anchorTime,
          anchorAt: anchor.anchorAt,
          timeZone: settings.timeZone,
          recurrenceKind: recurrence.kind,
          frequency: recurrence.kind === 'recurring' ? recurrence.frequency : null,
          recurrenceInterval:
            recurrence.kind === 'recurring' ? recurrence.interval : null,
          endsOn: recurrence.kind === 'recurring' ? (recurrence.endsOn ?? null) : null,
          occurrenceLimit:
            recurrence.kind === 'recurring' ? (recurrence.occurrenceLimit ?? null) : null,
          leadMinutes: [...request.body.leadMinutes].sort((a, b) => b - a),
          taskMode: request.body.taskMode,
          repeatIntervalMinutes: request.body.repeatIntervalMinutes,
          maxRepeats: request.body.maxRepeats,
          channelMode: request.body.channelMode,
          channelKeys,
          nextSequence: 0,
          nextOccurrenceAt: anchor.anchorAt,
        })
        .returning({ id: reminders.id });
      if (!created) throw new Error('Unable to create reminder.');

      const detail = await getReminder(options.db, created.id);
      if (!detail) throw new Error('Created reminder could not be loaded.');
      return reply.code(201).send(detail);
    },
  );

  typedApp.patch(
    '/api/v1/reminders/:id',
    {
      schema: {
        params: reminderParamsSchema,
        body: updateReminderSchema,
        response: { 200: reminderDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:manage'] }))
      )
        return reply;
      const [existing] = await options.db
        .select()
        .from(reminders)
        .where(eq(reminders.id, request.params.id))
        .limit(1);
      if (!existing)
        return sendApiError(reply, 404, 'REMINDER_NOT_FOUND', '没有找到该提醒');

      const channelMode = request.body.channelMode ?? existing.channelMode;
      const channelKeys = request.body.channelKeys ?? existing.channelKeys;
      if (channelMode === 'override') {
        const available = await listNotificationChannels(options.db, options.config);
        const validKeys = new Set(
          available.filter((channel) => channel.enabled).map((channel) => channel.key),
        );
        if (channelKeys.length === 0 || channelKeys.some((key) => !validKeys.has(key))) {
          return sendApiError(
            reply,
            422,
            'INVALID_CHANNEL',
            '一个或多个通知渠道不存在或未启用',
          );
        }
      }
      await options.db
        .update(reminders)
        .set({
          ...(request.body.title === undefined ? {} : { title: request.body.title }),
          ...(request.body.description === undefined
            ? {}
            : { description: request.body.description }),
          ...(request.body.leadMinutes === undefined
            ? {}
            : {
                leadMinutes: [...new Set(request.body.leadMinutes)].sort((a, b) => b - a),
              }),
          channelMode,
          channelKeys: channelMode === 'override' ? [...new Set(channelKeys)] : [],
          ...(request.body.status === undefined ? {} : { status: request.body.status }),
          updatedAt: new Date(),
        })
        .where(eq(reminders.id, request.params.id));

      const detail = await getReminder(options.db, request.params.id);
      if (!detail) throw new Error('Updated reminder could not be loaded.');
      return detail;
    },
  );

  typedApp.post(
    '/api/v1/reminder-occurrences/:occurrenceId/acknowledge',
    {
      schema: {
        params: occurrenceParamsSchema,
        response: { 200: reminderOccurrenceSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:manage'] }))
      )
        return reply;
      return resolveOccurrence(
        options.db,
        request.params.occurrenceId,
        'acknowledged',
        reply,
      );
    },
  );

  typedApp.post(
    '/api/v1/reminder-occurrences/:occurrenceId/dismiss',
    {
      schema: {
        params: occurrenceParamsSchema,
        response: { 200: reminderOccurrenceSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:manage'] }))
      )
        return reply;
      return resolveOccurrence(
        options.db,
        request.params.occurrenceId,
        'dismissed',
        reply,
      );
    },
  );

  typedApp.post(
    '/api/v1/reminder-occurrences/:occurrenceId/snooze',
    {
      schema: {
        params: occurrenceParamsSchema,
        body: snoozeReminderOccurrenceSchema,
        response: { 200: reminderOccurrenceSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:manage'] }))
      )
        return reply;
      const [occurrence] = await options.db
        .select()
        .from(reminderOccurrences)
        .where(eq(reminderOccurrences.id, request.params.occurrenceId))
        .limit(1);
      if (!occurrence)
        return sendApiError(reply, 404, 'OCCURRENCE_NOT_FOUND', '没有找到该提醒实例');
      if (occurrence.status !== 'pending') {
        return sendApiError(reply, 409, 'OCCURRENCE_RESOLVED', '该提醒实例已经处理完成');
      }
      const snoozedUntil = new Date(Date.now() + request.body.durationMinutes * 60_000);
      await options.db.transaction(async (transaction) => {
        await transaction
          .update(reminderOccurrences)
          .set({
            snoozedUntil,
            snoozeCount: occurrence.snoozeCount + 1,
            updatedAt: new Date(),
          })
          .where(eq(reminderOccurrences.id, occurrence.id));
        await transaction
          .update(reminderDeliveries)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(
            and(
              eq(reminderDeliveries.occurrenceId, occurrence.id),
              inArray(reminderDeliveries.status, ['queued', 'failed']),
            ),
          );
      });
      const detail = await getReminder(options.db, occurrence.reminderId);
      const result = reminderOccurrenceFromDetail(detail, occurrence.id);
      if (!result) throw new Error('Snoozed occurrence could not be loaded.');
      return result;
    },
  );

  typedApp.get(
    '/api/v1/notification-channels',
    { schema: { response: { 200: notificationChannelListSchema } } },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:read'] }))
      )
        return reply;
      return listNotificationChannels(options.db, options.config);
    },
  );

  typedApp.post(
    '/api/v1/notification-channels/test',
    {
      schema: {
        body: testNotificationChannelInputSchema,
        response: { 200: testNotificationChannelResultSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true })))
        return reply;
      const channel = await resolveChannel(options.db, options.config, request.body.key);
      if (!channel) {
        return sendApiError(reply, 404, 'CHANNEL_NOT_FOUND', '没有找到该通知渠道');
      }
      if (!channel.enabled) {
        return sendApiError(reply, 409, 'CHANNEL_DISABLED', '该通知渠道已停用');
      }
      try {
        return await sendNotificationChannelTest(channel);
      } catch (error) {
        const message = error instanceof Error ? error.message : '通知发送失败';
        return sendApiError(reply, 502, 'NOTIFICATION_TEST_FAILED', message);
      }
    },
  );

  typedApp.post(
    '/api/v1/notification-channels',
    {
      schema: {
        body: createNotificationChannelSchema,
        response: { 201: notificationChannelSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:manage'] }))
      )
        return reply;
      try {
        return reply
          .code(201)
          .send(await createChannel(options.db, options.config, request.body));
      } catch (error) {
        if (error instanceof Error && error.message === 'APP_MASTER_KEY_REQUIRED') {
          return sendApiError(
            reply,
            422,
            'APP_MASTER_KEY_REQUIRED',
            '请先配置 APP_MASTER_KEY',
          );
        }
        throw error;
      }
    },
  );

  typedApp.patch(
    '/api/v1/notification-channels/:id',
    {
      schema: {
        params: channelParamsSchema,
        body: updateNotificationChannelSchema,
        response: { 200: notificationChannelSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:manage'] }))
      )
        return reply;
      try {
        const updated = await updateNotificationChannel(
          options.db,
          options.config,
          request.params.id,
          request.body,
        );
        return (
          updated ?? sendApiError(reply, 404, 'CHANNEL_NOT_FOUND', '没有找到该通知渠道')
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'APP_MASTER_KEY_REQUIRED') {
          return sendApiError(
            reply,
            422,
            'APP_MASTER_KEY_REQUIRED',
            '请先配置 APP_MASTER_KEY',
          );
        }
        throw error;
      }
    },
  );

  typedApp.delete(
    '/api/v1/notification-channels/:id',
    { schema: { params: channelParamsSchema } },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['reminders:manage'] }))
      )
        return reply;
      const [deleted] = await options.db
        .delete(notificationChannels)
        .where(eq(notificationChannels.id, request.params.id))
        .returning({ id: notificationChannels.id });
      if (!deleted)
        return sendApiError(reply, 404, 'CHANNEL_NOT_FOUND', '没有找到该通知渠道');
      return reply.code(204).send();
    },
  );
}

async function resolveOccurrence(
  db: Database,
  occurrenceId: string,
  status: 'acknowledged' | 'dismissed',
  reply: Parameters<typeof sendApiError>[0],
) {
  const [occurrence] = await db
    .select()
    .from(reminderOccurrences)
    .where(eq(reminderOccurrences.id, occurrenceId))
    .limit(1);
  if (!occurrence)
    return sendApiError(reply, 404, 'OCCURRENCE_NOT_FOUND', '没有找到该提醒实例');
  if (occurrence.status !== 'pending') {
    return sendApiError(reply, 409, 'OCCURRENCE_RESOLVED', '该提醒实例已经处理完成');
  }

  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction
      .update(reminderOccurrences)
      .set({ status, resolvedAt: now, snoozedUntil: null, updatedAt: now })
      .where(eq(reminderOccurrences.id, occurrenceId));
    await transaction
      .update(reminderDeliveries)
      .set({ status: 'cancelled', updatedAt: now })
      .where(
        and(
          eq(reminderDeliveries.occurrenceId, occurrenceId),
          inArray(reminderDeliveries.status, ['queued', 'failed']),
        ),
      );
  });

  const detail = await getReminder(db, occurrence.reminderId);
  const result = reminderOccurrenceFromDetail(detail, occurrenceId);
  if (!result) throw new Error('Resolved occurrence could not be loaded.');
  return result;
}

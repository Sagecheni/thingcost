import { z } from 'zod';

import { isoDateSchema, uuidSchema } from './common.js';

export const reminderKindSchema = z.enum([
  'general',
  'warranty_expiry',
  'maintenance',
  'loan_return',
  'renewal',
]);
export const reminderTriggerModeSchema = z.enum(['date', 'datetime']);
export const reminderFrequencySchema = z.enum(['day', 'week', 'month', 'year']);
export const reminderTaskModeSchema = z.enum(['notification', 'actionable']);
export const reminderStatusSchema = z.enum(['active', 'paused', 'archived']);
export const reminderChannelModeSchema = z.enum(['default', 'override', 'none']);
export const reminderOccurrenceStatusSchema = z.enum([
  'pending',
  'acknowledged',
  'dismissed',
  'completed',
]);
export const notificationProviderSchema = z.enum([
  'telegram',
  'webhook',
  'wecom',
  'serverchan',
  'pushplus',
  'bark',
]);
export const notificationChannelSourceSchema = z.enum(['environment', 'database']);
export const deliveryKindSchema = z.enum(['lead', 'repeat', 'snooze']);
export const deliveryStatusSchema = z.enum([
  'queued',
  'processing',
  'sent',
  'failed',
  'cancelled',
]);

export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);
export const channelKeySchema = z.string().trim().min(1).max(120);
export const leadMinutesSchema = z.number().int().min(0).max(525_600);

export const reminderTriggerSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('date'),
    dueDate: isoDateSchema,
    timeOfDay: timeOfDaySchema.default('09:00'),
  }),
  z.object({
    mode: z.literal('datetime'),
    dueAt: z.iso.datetime(),
  }),
]);

export const reminderRecurrenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once') }),
  z
    .object({
      kind: z.literal('recurring'),
      frequency: reminderFrequencySchema,
      interval: z.number().int().min(1).max(365).default(1),
      endsOn: isoDateSchema.optional(),
      occurrenceLimit: z.number().int().min(1).max(10_000).optional(),
    })
    .refine(
      (input) => input.endsOn !== undefined || input.occurrenceLimit !== undefined,
      {
        message: '周期提醒必须设置结束日期或次数上限',
      },
    ),
]);

export const createReminderSchema = z
  .object({
    assetId: uuidSchema.optional(),
    subscriptionId: uuidSchema.optional(),
    kind: reminderKindSchema.default('general'),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).optional(),
    trigger: reminderTriggerSchema,
    recurrence: reminderRecurrenceSchema.default({ kind: 'once' }),
    leadMinutes: z.array(leadMinutesSchema).min(1).max(10).default([0]),
    taskMode: reminderTaskModeSchema.default('notification'),
    repeatIntervalMinutes: z.number().int().min(10).max(43_200).default(1_440),
    maxRepeats: z.number().int().min(0).max(20).default(0),
    channelMode: reminderChannelModeSchema.default('default'),
    channelKeys: z.array(channelKeySchema).max(10).default([]),
  })
  .superRefine((input, context) => {
    if (input.assetId && input.subscriptionId) {
      context.addIssue({
        code: 'custom',
        path: ['subscriptionId'],
        message: '提醒只能关联物品或订阅中的一个',
      });
    }
    if (new Set(input.leadMinutes).size !== input.leadMinutes.length) {
      context.addIssue({
        code: 'custom',
        path: ['leadMinutes'],
        message: '提前量不能重复',
      });
    }
    if (input.channelMode === 'override' && input.channelKeys.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['channelKeys'],
        message: '覆盖默认渠道时至少选择一个渠道',
      });
    }
    if (input.channelMode !== 'override' && input.channelKeys.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['channelKeys'],
        message: '只有覆盖模式可以指定渠道',
      });
    }
    if (input.taskMode === 'notification' && input.maxRepeats > 0) {
      context.addIssue({
        code: 'custom',
        path: ['maxRepeats'],
        message: '普通通知不支持待确认重复发送',
      });
    }
  });

export const updateReminderSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).nullable(),
    leadMinutes: z.array(leadMinutesSchema).min(1).max(10),
    channelMode: reminderChannelModeSchema,
    channelKeys: z.array(channelKeySchema).max(10),
    status: reminderStatusSchema,
  })
  .partial()
  .superRefine((input, context) => {
    if (
      input.channelMode === 'override' &&
      (!input.channelKeys || input.channelKeys.length === 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['channelKeys'],
        message: '覆盖默认渠道时至少选择一个渠道',
      });
    }
    if (
      input.channelMode !== undefined &&
      input.channelMode !== 'override' &&
      input.channelKeys
    ) {
      if (input.channelKeys.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['channelKeys'],
          message: '只有覆盖模式可以指定渠道',
        });
      }
    }
  });

export const reminderAssetSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  coverThumbnailUrl: z.string().nullable(),
});
export const reminderSubscriptionSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: z.enum(['subscription', 'digital_license']),
});

export const reminderSummarySchema = z.object({
  id: uuidSchema,
  asset: reminderAssetSummarySchema.nullable(),
  subscription: reminderSubscriptionSummarySchema.nullable(),
  kind: reminderKindSchema,
  title: z.string(),
  description: z.string().nullable(),
  triggerMode: reminderTriggerModeSchema,
  anchorDate: isoDateSchema,
  anchorTime: timeOfDaySchema,
  anchorAt: z.iso.datetime(),
  timeZone: z.string(),
  recurrenceKind: z.enum(['once', 'recurring']),
  frequency: reminderFrequencySchema.nullable(),
  recurrenceInterval: z.number().int().positive().nullable(),
  endsOn: isoDateSchema.nullable(),
  occurrenceLimit: z.number().int().positive().nullable(),
  leadMinutes: z.array(leadMinutesSchema),
  taskMode: reminderTaskModeSchema,
  repeatIntervalMinutes: z.number().int().positive(),
  maxRepeats: z.number().int().nonnegative(),
  channelMode: reminderChannelModeSchema,
  channelKeys: z.array(channelKeySchema),
  status: reminderStatusSchema,
  nextOccurrenceAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const reminderDeliverySchema = z.object({
  id: uuidSchema,
  channelKey: channelKeySchema,
  provider: notificationProviderSchema,
  kind: deliveryKindSchema,
  scheduledAt: z.iso.datetime(),
  status: deliveryStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  lastError: z.string().nullable(),
  sentAt: z.iso.datetime().nullable(),
});

export const reminderOccurrenceSchema = z.object({
  id: uuidSchema,
  reminderId: uuidSchema,
  sequence: z.number().int().nonnegative(),
  dueAt: z.iso.datetime(),
  status: reminderOccurrenceStatusSchema,
  snoozedUntil: z.iso.datetime().nullable(),
  repeatCount: z.number().int().nonnegative(),
  lastNotifiedAt: z.iso.datetime().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  deliveries: z.array(reminderDeliverySchema).optional(),
});

export const reminderDetailSchema = reminderSummarySchema.extend({
  occurrences: z.array(reminderOccurrenceSchema),
});
export const reminderListSchema = z.array(reminderSummarySchema);
export const reminderOccurrenceListSchema = z.array(
  reminderOccurrenceSchema.extend({ reminder: reminderSummarySchema }),
);

export const snoozeReminderOccurrenceSchema = z.object({
  durationMinutes: z.number().int().min(10).max(43_200),
});

export const notificationChannelSchema = z.object({
  key: channelKeySchema,
  id: uuidSchema.nullable(),
  provider: notificationProviderSchema,
  source: notificationChannelSourceSchema,
  name: z.string(),
  enabled: z.boolean(),
  isDefault: z.boolean(),
  configurationSummary: z.string(),
  editable: z.boolean(),
  createdAt: z.iso.datetime().nullable(),
});
export const notificationChannelListSchema = z.array(notificationChannelSchema);

export const createNotificationChannelSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('telegram'),
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    botToken: z.string().trim().min(20).max(300),
    chatId: z.string().trim().min(1).max(120),
  }),
  z.object({
    provider: z.literal('webhook'),
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    url: z.url(),
    secret: z.string().trim().max(500).optional(),
  }),
  z.object({
    provider: z.literal('wecom'),
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    /** Enterprise WeChat group robot webhook URL. */
    webhookUrl: z.url(),
  }),
  z.object({
    provider: z.literal('serverchan'),
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    /** Server酱 SendKey — never logged in plaintext. */
    sendKey: z.string().trim().min(8).max(200),
  }),
  z.object({
    provider: z.literal('pushplus'),
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    /** PushPlus token — never logged in plaintext. */
    token: z.string().trim().min(8).max(300),
    topic: z.string().trim().max(120).optional(),
  }),
  z.object({
    provider: z.literal('bark'),
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    /** Bark server base URL, including self-hosted instances. */
    serverUrl: z.url(),
    /** Device Key shown by the Bark iOS app — encrypted at rest. */
    deviceKey: z.string().trim().min(4).max(300),
    group: z.string().trim().max(120).optional(),
    sound: z.string().trim().max(120).optional(),
  }),
]);

export const updateNotificationChannelSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  botToken: z.string().trim().min(20).max(300).optional(),
  chatId: z.string().trim().min(1).max(120).optional(),
  url: z.url().optional(),
  secret: z.string().trim().max(500).optional(),
  webhookUrl: z.url().optional(),
  sendKey: z.string().trim().min(8).max(200).optional(),
  token: z.string().trim().min(8).max(300).optional(),
  topic: z.string().trim().max(120).optional(),
  serverUrl: z.url().optional(),
  deviceKey: z.string().trim().min(4).max(300).optional(),
  group: z.string().trim().max(120).optional(),
  sound: z.string().trim().max(120).optional(),
});

export const testNotificationChannelInputSchema = z.object({
  key: z.string().min(1).max(200),
});

export const testNotificationChannelResultSchema = z.object({
  success: z.literal(true),
  provider: notificationProviderSchema,
  status: z.number().int().min(100).max(599),
  message: z.string(),
});

export type ReminderKind = z.infer<typeof reminderKindSchema>;
export type ReminderFrequency = z.infer<typeof reminderFrequencySchema>;
export type ReminderTaskMode = z.infer<typeof reminderTaskModeSchema>;
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
export type ReminderSummary = z.infer<typeof reminderSummarySchema>;
export type ReminderDetail = z.infer<typeof reminderDetailSchema>;
export type ReminderOccurrence = z.infer<typeof reminderOccurrenceSchema>;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type TestNotificationChannelInput = z.infer<
  typeof testNotificationChannelInputSchema
>;
export type TestNotificationChannelResult = z.infer<
  typeof testNotificationChannelResultSchema
>;
export type CreateNotificationChannelInput = z.infer<
  typeof createNotificationChannelSchema
>;
export type UpdateNotificationChannelInput = z.infer<
  typeof updateNotificationChannelSchema
>;

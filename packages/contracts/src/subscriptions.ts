import { z } from 'zod';

import {
  currencyCodeSchema,
  isoDateSchema,
  nonNegativeMinorUnitSchema,
  uuidSchema,
} from './common.js';

export const subscriptionKindSchema = z.enum(['subscription', 'digital_license']);
export const subscriptionBillingCycleSchema = z.enum([
  'monthly',
  'yearly',
  'custom',
  'one_time',
]);
export const subscriptionStatusSchema = z.enum([
  'trial',
  'active',
  'paused',
  'cancelled',
  'expired',
]);
export const subscriptionChargeKindSchema = z.enum(['planned', 'actual']);
export const subscriptionChargeStatusSchema = z.enum([
  'planned',
  'succeeded',
  'failed',
  'refunded',
  'waived',
]);
export const subscriptionPriceChangeKindSchema = z.enum([
  'initial',
  'discount',
  'price_change',
]);
export const subscriptionActionSchema = z.enum([
  'convert_trial',
  'pause',
  'resume',
  'cancel',
  'renew',
]);

export const subscriptionTagSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  color: z.string().nullable(),
});

export const subscriptionAttachmentSchema = z.object({
  id: uuidSchema,
  subscriptionId: uuidSchema,
  kind: z.enum(['photo', 'document']),
  originalName: z.string(),
  mediaType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  caption: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  contentUrl: z.string(),
  thumbnailUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const subscriptionSchema = z.object({
  id: uuidSchema,
  kind: subscriptionKindSchema,
  name: z.string().min(1).max(160),
  vendor: z.string().nullable(),
  categoryLabel: z.string().nullable(),
  status: subscriptionStatusSchema,
  billingCycle: subscriptionBillingCycleSchema,
  customIntervalDays: z.number().int().positive().nullable(),
  currency: currencyCodeSchema,
  amountMinor: nonNegativeMinorUnitSchema,
  discountMinor: nonNegativeMinorUnitSchema,
  discountEndsOn: isoDateSchema.nullable(),
  autoRenew: z.boolean(),
  seats: z.number().int().positive().nullable(),
  startedOn: isoDateSchema.nullable(),
  trialEndsOn: isoDateSchema.nullable(),
  nextBillingOn: isoDateSchema.nullable(),
  cancelledOn: isoDateSchema.nullable(),
  expiresOn: isoDateSchema.nullable(),
  /** Public account identifier only — never a password or license key. */
  accountHint: z.string().nullable(),
  /** External password-manager reference URL, optional. */
  passwordManagerUrl: z.string().nullable(),
  notes: z.string().nullable(),
  tags: z.array(subscriptionTagSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const subscriptionPriceChangeSchema = z.object({
  id: uuidSchema,
  subscriptionId: uuidSchema,
  kind: subscriptionPriceChangeKindSchema,
  amountMinor: nonNegativeMinorUnitSchema,
  discountMinor: nonNegativeMinorUnitSchema,
  effectiveOn: isoDateSchema,
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const subscriptionChargeSchema = z.object({
  id: uuidSchema,
  subscriptionId: uuidSchema,
  kind: subscriptionChargeKindSchema,
  status: subscriptionChargeStatusSchema,
  currency: currencyCodeSchema,
  amountMinor: nonNegativeMinorUnitSchema,
  occurredOn: isoDateSchema,
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const subscriptionMetricsSchema = z.object({
  projectedMonthlyMinor: nonNegativeMinorUnitSchema,
  projectedYearlyMinor: nonNegativeMinorUnitSchema,
  actualSpendMinor: nonNegativeMinorUnitSchema,
  plannedSpendMinor: nonNegativeMinorUnitSchema,
  failedChargeCount: z.number().int().nonnegative(),
});

export const subscriptionDetailSchema = subscriptionSchema.extend({
  metrics: subscriptionMetricsSchema,
  charges: z.array(subscriptionChargeSchema),
  priceChanges: z.array(subscriptionPriceChangeSchema),
  attachments: z.array(subscriptionAttachmentSchema),
});

export const subscriptionListSchema = z.object({
  items: z.array(
    subscriptionSchema.extend({
      metrics: subscriptionMetricsSchema,
    }),
  ),
  totals: z.object({
    activeCount: z.number().int().nonnegative(),
    projectedMonthlyMinor: nonNegativeMinorUnitSchema,
    projectedYearlyMinor: nonNegativeMinorUnitSchema,
    actualSpendMinor: nonNegativeMinorUnitSchema,
  }),
});

const subscriptionFieldsSchema = z.object({
  kind: subscriptionKindSchema.default('subscription'),
  name: z.string().trim().min(1).max(160),
  vendor: z.string().trim().max(120).optional(),
  categoryLabel: z.string().trim().max(80).optional(),
  status: subscriptionStatusSchema.default('active'),
  billingCycle: subscriptionBillingCycleSchema,
  customIntervalDays: z.number().int().min(1).max(3660).optional(),
  currency: currencyCodeSchema.default('CNY'),
  amountMinor: nonNegativeMinorUnitSchema,
  discountMinor: nonNegativeMinorUnitSchema.optional(),
  discountEndsOn: isoDateSchema.optional(),
  autoRenew: z.boolean().default(true),
  seats: z.number().int().min(1).max(100_000).optional(),
  startedOn: isoDateSchema.optional(),
  trialEndsOn: isoDateSchema.optional(),
  nextBillingOn: isoDateSchema.optional(),
  cancelledOn: isoDateSchema.optional(),
  expiresOn: isoDateSchema.optional(),
  accountHint: z.string().trim().max(160).optional(),
  passwordManagerUrl: z.url().optional(),
  notes: z.string().trim().max(4_000).optional(),
  tagIds: z.array(uuidSchema).max(50).optional(),
});

export const createSubscriptionSchema = subscriptionFieldsSchema.superRefine(
  (input, context) => {
    if (input.kind === 'digital_license' && input.billingCycle !== 'one_time') {
      context.addIssue({
        code: 'custom',
        path: ['billingCycle'],
        message: '数字许可请使用 one_time 计费周期',
      });
    }
    if (input.kind === 'subscription' && input.billingCycle === 'one_time') {
      context.addIssue({
        code: 'custom',
        path: ['billingCycle'],
        message: '周期订阅不能使用 one_time',
      });
    }
    if (input.billingCycle === 'custom' && input.customIntervalDays === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['customIntervalDays'],
        message: '自定义周期必须填写间隔天数',
      });
    }
  },
);

export const updateSubscriptionSchema = subscriptionFieldsSchema
  .partial()
  .superRefine((input, context) => {
    if (
      input.kind === 'digital_license' &&
      input.billingCycle !== undefined &&
      input.billingCycle !== 'one_time'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['billingCycle'],
        message: '数字许可请使用 one_time 计费周期',
      });
    }
    if (input.kind === 'subscription' && input.billingCycle === 'one_time') {
      context.addIssue({
        code: 'custom',
        path: ['billingCycle'],
        message: '周期订阅不能使用 one_time',
      });
    }
    if (input.billingCycle === 'custom' && input.customIntervalDays === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['customIntervalDays'],
        message: '自定义周期必须填写间隔天数',
      });
    }
  });

export const createSubscriptionPriceChangeSchema = z.object({
  kind: subscriptionPriceChangeKindSchema.exclude(['initial']),
  amountMinor: nonNegativeMinorUnitSchema,
  discountMinor: nonNegativeMinorUnitSchema.optional(),
  discountEndsOn: isoDateSchema.nullable().optional(),
  effectiveOn: isoDateSchema,
  note: z.string().trim().max(500).optional(),
});

export const subscriptionActionInputSchema = z.object({
  action: subscriptionActionSchema,
  effectiveOn: isoDateSchema,
  nextBillingOn: isoDateSchema.optional(),
});

export const createSubscriptionChargeSchema = z.object({
  kind: subscriptionChargeKindSchema,
  status: subscriptionChargeStatusSchema.optional(),
  currency: currencyCodeSchema.optional(),
  amountMinor: nonNegativeMinorUnitSchema,
  occurredOn: isoDateSchema,
  note: z.string().trim().max(500).optional(),
});

export type SubscriptionKind = z.infer<typeof subscriptionKindSchema>;
export type SubscriptionBillingCycle = z.infer<typeof subscriptionBillingCycleSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type Subscription = z.infer<typeof subscriptionSchema>;
export type SubscriptionTag = z.infer<typeof subscriptionTagSchema>;
export type SubscriptionAttachment = z.infer<typeof subscriptionAttachmentSchema>;
export type SubscriptionPriceChange = z.infer<typeof subscriptionPriceChangeSchema>;
export type SubscriptionCharge = z.infer<typeof subscriptionChargeSchema>;
export type SubscriptionDetail = z.infer<typeof subscriptionDetailSchema>;
export type SubscriptionList = z.infer<typeof subscriptionListSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type CreateSubscriptionPriceChangeInput = z.infer<
  typeof createSubscriptionPriceChangeSchema
>;
export type SubscriptionActionInput = z.infer<typeof subscriptionActionInputSchema>;
export type CreateSubscriptionChargeInput = z.infer<
  typeof createSubscriptionChargeSchema
>;

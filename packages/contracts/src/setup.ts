import { z } from 'zod';

import { currencyCodeSchema } from './common.js';

export const setupStatusSchema = z.object({
  initialized: z.boolean(),
});

export const initializeApplicationSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(12).max(256),
  timeZone: z.string().trim().min(1).max(100).default('Asia/Shanghai'),
  baseCurrency: currencyCodeSchema.default('CNY'),
});

export const applicationSettingsSchema = z.object({
  timeZone: z.string(),
  baseCurrency: currencyCodeSchema,
  baseCurrencyLocked: z.boolean().default(false),
  personalApiTokensEnabled: z.boolean().default(false),
  initializedAt: z.iso.datetime(),
});

export const updateApplicationSettingsSchema = z
  .object({
    timeZone: z.string().trim().min(1).max(100).optional(),
    baseCurrency: currencyCodeSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, '至少需要修改一个设置');

export type InitializeApplicationInput = z.infer<typeof initializeApplicationSchema>;
export type ApplicationSettings = z.infer<typeof applicationSettingsSchema>;
export type UpdateApplicationSettingsInput = z.infer<
  typeof updateApplicationSettingsSchema
>;

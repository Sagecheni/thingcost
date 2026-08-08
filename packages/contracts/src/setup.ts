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
  personalApiTokensEnabled: z.boolean().default(false),
  initializedAt: z.iso.datetime(),
});

export type InitializeApplicationInput = z.infer<typeof initializeApplicationSchema>;
export type ApplicationSettings = z.infer<typeof applicationSettingsSchema>;

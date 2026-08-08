import { z } from 'zod';

export * from './asset-activity.js';
export * from './asset-relationships.js';
export * from './assets.js';
export * from './attachments.js';
export * from './auth.js';
export * from './common.js';
export * from './dashboard.js';
export * from './exports.js';
export * from './imports.js';
export * from './api-tokens.js';
export * from './orders.js';
export * from './reminders.js';
export * from './setup.js';
export * from './wishlists.js';
export * from './valuations.js';
export * from './subscriptions.js';

export const apiVersion = 'v1' as const;

export const applicationMetaSchema = z.object({
  name: z.literal('物纪'),
  englishName: z.literal('Chronicle'),
  apiVersion: z.literal(apiVersion),
});

export type ApplicationMeta = z.infer<typeof applicationMetaSchema>;

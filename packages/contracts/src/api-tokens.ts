import { z } from 'zod';

export const apiTokenScopeSchema = z.enum([
  'assets:read',
  'assets:write',
  'orders:read',
  'wishlist:read',
  'wishlist:write',
  'reminders:read',
  'reminders:manage',
  'attachments:read',
]);

export const apiTokenScopes = apiTokenScopeSchema.options;

export const personalApiSettingsSchema = z.object({
  enabled: z.boolean(),
});

export const updatePersonalApiSettingsSchema = z.object({
  enabled: z.boolean(),
});

export const personalAccessTokenSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  tokenPrefix: z.string().min(4).max(16),
  scopes: z.array(apiTokenScopeSchema).min(1),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const createPersonalAccessTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(apiTokenScopeSchema).min(1),
  expiresAt: z.iso.datetime().optional().nullable(),
});

export const createdPersonalAccessTokenSchema = personalAccessTokenSchema.extend({
  token: z.string().min(20),
});

export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;
export type PersonalApiSettings = z.infer<typeof personalApiSettingsSchema>;
export type UpdatePersonalApiSettingsInput = z.infer<
  typeof updatePersonalApiSettingsSchema
>;
export type PersonalAccessToken = z.infer<typeof personalAccessTokenSchema>;
export type CreatePersonalAccessTokenInput = z.infer<
  typeof createPersonalAccessTokenSchema
>;
export type CreatedPersonalAccessToken = z.infer<typeof createdPersonalAccessTokenSchema>;

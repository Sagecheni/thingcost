import { z } from 'zod';

import { uuidSchema } from './common.js';

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const authenticatedAdminSchema = z.object({
  id: uuidSchema,
  username: z.string(),
});

export const sessionResponseSchema = z.object({
  admin: authenticatedAdminSchema,
  expiresAt: z.iso.datetime(),
});

export const authenticationStatusSchema = z.object({
  authenticated: z.boolean(),
  admin: authenticatedAdminSchema.nullable(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type AuthenticatedAdmin = z.infer<typeof authenticatedAdminSchema>;

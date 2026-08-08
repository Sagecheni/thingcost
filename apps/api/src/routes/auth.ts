import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import type { RuntimeConfig } from '@thingcost/config';
import {
  authenticationStatusSchema,
  loginSchema,
  sessionResponseSchema,
} from '@thingcost/contracts';
import { adminUsers, type Database } from '@thingcost/database';

import { requireSession, sendApiError } from '../lib/http.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  findSession,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from '../services/session.js';

interface AuthRouteOptions {
  db: Database;
  config: RuntimeConfig;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/api/v1/auth/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '10 minutes',
        },
      },
      schema: {
        body: loginSchema,
        response: { 200: sessionResponseSchema },
      },
    },
    async (request, reply) => {
      const [admin] = await options.db
        .select({
          id: adminUsers.id,
          username: adminUsers.username,
          passwordHash: adminUsers.passwordHash,
        })
        .from(adminUsers)
        .where(sql`lower(${adminUsers.username}) = lower(${request.body.username})`)
        .limit(1);

      const passwordMatches = admin
        ? await verifyPassword(admin.passwordHash, request.body.password)
        : (await hashPassword(request.body.password)) && false;

      if (!admin || !passwordMatches) {
        return sendApiError(reply, 401, 'INVALID_CREDENTIALS', '用户名或密码错误');
      }

      const session = await createSession(options.db, admin.id);
      setSessionCookie(reply, options.config, session.token, session.expiresAt);

      return {
        admin: {
          id: admin.id,
          username: admin.username,
        },
        expiresAt: session.expiresAt.toISOString(),
      };
    },
  );

  typedApp.get(
    '/api/v1/auth/session',
    {
      schema: {
        response: { 200: authenticationStatusSchema },
      },
    },
    async (request) => {
      const session = await findSession(options.db, request);
      return {
        authenticated: Boolean(session),
        admin: session?.admin ?? null,
      };
    },
  );

  typedApp.post('/api/v1/auth/logout', async (request, reply) => {
    const session = await requireSession(options.db, request, reply);

    if (!session) {
      clearSessionCookie(reply, options.config);
      return reply;
    }

    await destroySession(options.db, session.sessionId);
    clearSessionCookie(reply, options.config);
    return reply.code(204).send();
  });
}

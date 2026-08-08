import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import type { RuntimeConfig } from '@thingcost/config';
import {
  applicationSettingsSchema,
  initializeApplicationSchema,
  sessionResponseSchema,
  setupStatusSchema,
} from '@thingcost/contracts';
import {
  adminUsers,
  appSettings,
  assetStatuses,
  categories,
  defaultAssetStatuses,
  defaultCategories,
  type Database,
} from '@thingcost/database';

import { isValidTimeZone } from '../lib/dates.js';
import { sendApiError } from '../lib/http.js';
import { createSession, hashPassword, setSessionCookie } from '../services/session.js';

interface SetupRouteOptions {
  db: Database;
  config: RuntimeConfig;
}

export function registerSetupRoutes(
  app: FastifyInstance,
  options: SetupRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/api/v1/setup/status',
    {
      schema: {
        response: { 200: setupStatusSchema },
      },
    },
    async () => {
      const [settings] = await options.db
        .select({ id: appSettings.id })
        .from(appSettings)
        .limit(1);
      return { initialized: Boolean(settings) };
    },
  );

  typedApp.post(
    '/api/v1/setup',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '10 minutes',
        },
      },
      schema: {
        body: initializeApplicationSchema,
        response: {
          201: sessionResponseSchema.extend({
            settings: applicationSettingsSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      if (!isValidTimeZone(request.body.timeZone)) {
        return sendApiError(reply, 400, 'INVALID_TIME_ZONE', '无效的 IANA 时区');
      }

      const passwordHash = await hashPassword(request.body.password);
      const initializedAt = new Date();

      const result = await options.db.transaction(async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtext('chronicle:initialize'))`,
        );

        const [existingSettings] = await transaction
          .select({ id: appSettings.id })
          .from(appSettings)
          .limit(1);

        if (existingSettings) {
          return null;
        }

        const [admin] = await transaction
          .insert(adminUsers)
          .values({
            username: request.body.username,
            passwordHash,
          })
          .returning({ id: adminUsers.id, username: adminUsers.username });

        if (!admin) {
          throw new Error('Unable to initialize the administrator.');
        }

        await transaction.insert(appSettings).values({
          timeZone: request.body.timeZone,
          baseCurrency: request.body.baseCurrency,
          initializedAt,
        });

        await transaction.insert(assetStatuses).values(
          defaultAssetStatuses.map((status) => ({
            ...status,
            isSystem: true,
          })),
        );

        await transaction.insert(categories).values(
          defaultCategories.map((category) => ({
            ...category,
            isSystem: true,
          })),
        );

        return admin;
      });

      if (!result) {
        return sendApiError(reply, 409, 'ALREADY_INITIALIZED', '应用已经完成初始化');
      }

      const session = await createSession(options.db, result.id);
      setSessionCookie(reply, options.config, session.token, session.expiresAt);

      return reply.code(201).send({
        admin: result,
        expiresAt: session.expiresAt.toISOString(),
        settings: {
          timeZone: request.body.timeZone,
          baseCurrency: request.body.baseCurrency,
          personalApiTokensEnabled: false,
          initializedAt: initializedAt.toISOString(),
        },
      });
    },
  );
}

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  createPersonalAccessTokenSchema,
  createdPersonalAccessTokenSchema,
  personalAccessTokenSchema,
  personalApiSettingsSchema,
  updatePersonalApiSettingsSchema,
} from '@thingcost/contracts';
import type { Database } from '@thingcost/database';

import { requireSession, sendApiError } from '../lib/http.js';
import {
  ApiTokenError,
  createPersonalAccessToken,
  getPersonalApiSettings,
  listPersonalAccessTokens,
  revokePersonalAccessToken,
  setPersonalApiSettings,
} from '../services/api-tokens.js';

interface ApiTokenRouteOptions {
  db: Database;
}

function mapError(error: ApiTokenError): {
  status: number;
  code: string;
  message: string;
} {
  switch (error.code) {
    case 'TOKENS_DISABLED':
      return { status: 409, code: error.code, message: error.message };
    case 'TOKEN_NOT_FOUND':
      return { status: 404, code: error.code, message: error.message };
    case 'INVALID_EXPIRY':
      return { status: 400, code: error.code, message: error.message };
    default:
      return { status: 500, code: error.code, message: error.message };
  }
}

export function registerApiTokenRoutes(
  app: FastifyInstance,
  options: ApiTokenRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/api/v1/settings/personal-api',
    {
      schema: {
        response: { 200: personalApiSettingsSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireSession(options.db, request, reply))) return reply;
      try {
        return await getPersonalApiSettings(options.db);
      } catch (error) {
        if (error instanceof ApiTokenError) {
          const mapped = mapError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        throw error;
      }
    },
  );

  typedApp.patch(
    '/api/v1/settings/personal-api',
    {
      schema: {
        body: updatePersonalApiSettingsSchema,
        response: { 200: personalApiSettingsSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireSession(options.db, request, reply))) return reply;
      try {
        return await setPersonalApiSettings(options.db, request.body.enabled);
      } catch (error) {
        if (error instanceof ApiTokenError) {
          const mapped = mapError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        throw error;
      }
    },
  );

  typedApp.get(
    '/api/v1/personal-access-tokens',
    {
      schema: {
        response: { 200: personalAccessTokenSchema.array() },
      },
    },
    async (request, reply) => {
      const session = await requireSession(options.db, request, reply);
      if (!session) return reply;
      return listPersonalAccessTokens(options.db, session.admin.id);
    },
  );

  typedApp.post(
    '/api/v1/personal-access-tokens',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '10 minutes',
        },
      },
      schema: {
        body: createPersonalAccessTokenSchema,
        response: { 201: createdPersonalAccessTokenSchema },
      },
    },
    async (request, reply) => {
      const session = await requireSession(options.db, request, reply);
      if (!session) return reply;
      try {
        const created = await createPersonalAccessToken(
          options.db,
          session.admin.id,
          request.body,
        );
        return reply.code(201).send(created);
      } catch (error) {
        if (error instanceof ApiTokenError) {
          const mapped = mapError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        throw error;
      }
    },
  );

  typedApp.delete(
    '/api/v1/personal-access-tokens/:tokenId',
    {
      schema: {
        params: z.object({ tokenId: z.uuid() }),
        response: { 200: personalAccessTokenSchema },
      },
    },
    async (request, reply) => {
      const session = await requireSession(options.db, request, reply);
      if (!session) return reply;
      try {
        return await revokePersonalAccessToken(
          options.db,
          session.admin.id,
          request.params.tokenId,
        );
      } catch (error) {
        if (error instanceof ApiTokenError) {
          const mapped = mapError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        throw error;
      }
    },
  );
}

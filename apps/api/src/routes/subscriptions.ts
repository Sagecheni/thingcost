import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  createSubscriptionChargeSchema,
  createSubscriptionPriceChangeSchema,
  createSubscriptionSchema,
  subscriptionActionInputSchema,
  subscriptionChargeSchema,
  subscriptionDetailSchema,
  subscriptionListSchema,
  updateSubscriptionSchema,
} from '@thingcost/contracts';
import type { Database } from '@thingcost/database';

import { requireAuth, sendApiError } from '../lib/http.js';
import {
  addSubscriptionCharge,
  applySubscriptionAction,
  changeSubscriptionPrice,
  createSubscription,
  getSubscriptionDetail,
  listSubscriptions,
  softDeleteSubscription,
  SubscriptionServiceError,
  updateSubscription,
} from '../services/subscriptions.js';

interface SubscriptionRouteOptions {
  db: Database;
}

const idParamsSchema = z.object({ id: z.uuid() });

export function registerSubscriptionRoutes(
  app: FastifyInstance,
  options: SubscriptionRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/api/v1/subscriptions',
    {
      schema: {
        tags: ['Subscriptions'],
        response: { 200: subscriptionListSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }
      return listSubscriptions(options.db);
    },
  );

  typedApp.post(
    '/api/v1/subscriptions',
    {
      schema: {
        tags: ['Subscriptions'],
        body: createSubscriptionSchema,
        response: { 201: subscriptionDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, {
          sessionOnly: true,
        }))
      ) {
        return reply;
      }
      const created = await createSubscription(options.db, request.body);
      return reply.code(201).send(created);
    },
  );

  typedApp.get(
    '/api/v1/subscriptions/:id',
    {
      schema: {
        tags: ['Subscriptions'],
        params: idParamsSchema,
        response: { 200: subscriptionDetailSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }
      const detail = await getSubscriptionDetail(options.db, request.params.id);
      if (!detail) {
        return sendApiError(reply, 404, 'SUBSCRIPTION_NOT_FOUND', '没有找到该订阅或许可');
      }
      return detail;
    },
  );

  typedApp.patch(
    '/api/v1/subscriptions/:id',
    {
      schema: {
        tags: ['Subscriptions'],
        params: idParamsSchema,
        body: updateSubscriptionSchema,
        response: { 200: subscriptionDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, {
          sessionOnly: true,
        }))
      ) {
        return reply;
      }
      const updated = await updateSubscription(
        options.db,
        request.params.id,
        request.body,
      );
      if (!updated) {
        return sendApiError(reply, 404, 'SUBSCRIPTION_NOT_FOUND', '没有找到该订阅或许可');
      }
      return updated;
    },
  );

  typedApp.delete(
    '/api/v1/subscriptions/:id',
    {
      schema: {
        tags: ['Subscriptions'],
        params: idParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, {
          sessionOnly: true,
        }))
      ) {
        return reply;
      }
      const deleted = await softDeleteSubscription(options.db, request.params.id);
      if (!deleted) {
        return sendApiError(reply, 404, 'SUBSCRIPTION_NOT_FOUND', '没有找到该订阅或许可');
      }
      return reply.code(204).send(null);
    },
  );

  typedApp.post(
    '/api/v1/subscriptions/:id/price-changes',
    {
      schema: {
        tags: ['Subscriptions'],
        params: idParamsSchema,
        body: createSubscriptionPriceChangeSchema,
        response: { 200: subscriptionDetailSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }
      try {
        return await changeSubscriptionPrice(options.db, request.params.id, request.body);
      } catch (error) {
        if (error instanceof SubscriptionServiceError) {
          return sendApiError(
            reply,
            error.code === 'NOT_FOUND' ? 404 : 422,
            error.code,
            error.message,
          );
        }
        throw error;
      }
    },
  );

  typedApp.post(
    '/api/v1/subscriptions/:id/actions',
    {
      schema: {
        tags: ['Subscriptions'],
        params: idParamsSchema,
        body: subscriptionActionInputSchema,
        response: { 200: subscriptionDetailSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }
      try {
        return await applySubscriptionAction(options.db, request.params.id, request.body);
      } catch (error) {
        if (error instanceof SubscriptionServiceError) {
          const status =
            error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422;
          return sendApiError(reply, status, error.code, error.message);
        }
        throw error;
      }
    },
  );

  typedApp.post(
    '/api/v1/subscriptions/:id/charges',
    {
      schema: {
        tags: ['Subscriptions'],
        params: idParamsSchema,
        body: createSubscriptionChargeSchema,
        response: { 201: subscriptionChargeSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, {
          sessionOnly: true,
        }))
      ) {
        return reply;
      }
      try {
        const charge = await addSubscriptionCharge(
          options.db,
          request.params.id,
          request.body,
        );
        return reply.code(201).send(charge);
      } catch (error) {
        if (error instanceof SubscriptionServiceError) {
          return sendApiError(reply, 404, error.code, error.message);
        }
        throw error;
      }
    },
  );
}

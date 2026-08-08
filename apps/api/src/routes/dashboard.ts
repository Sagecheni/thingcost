import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { dashboardSchema } from '@thingcost/contracts';
import type { Database } from '@thingcost/database';

import { requireAuth } from '../lib/http.js';
import { getDashboard } from '../services/dashboard.js';

interface DashboardRouteOptions {
  db: Database;
}

const dashboardQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(7).max(365).default(30),
});

export function registerDashboardRoutes(
  app: FastifyInstance,
  options: DashboardRouteOptions,
): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/v1/dashboard',
    {
      schema: {
        querystring: dashboardQuerySchema,
        response: { 200: dashboardSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }

      return getDashboard(options.db, request.query.periodDays);
    },
  );
}

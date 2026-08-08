import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { RuntimeConfig } from '@thingcost/config';
import {
  confirmValuationInputSchema,
  runValuationInputSchema,
  updateValuationScheduleInputSchema,
  valuationAnalyticsSchema,
  valuationPreviewSchema,
  valuationReportListSchema,
  valuationReportSchema,
  valuationScheduleSchema,
  valuationSnapshotListSchema,
  valuationSnapshotSchema,
} from '@thingcost/contracts';
import type { Database } from '@thingcost/database';

import { requireAuth, sendApiError } from '../lib/http.js';
import type { AiProvider } from '../services/ai-providers.js';
import type { SearchProvider } from '../services/search-providers.js';
import {
  confirmValuationReport,
  getValuationAnalytics,
  getValuationPreview,
  getValuationSchedule,
  listValuationReports,
  listValuationSnapshots,
  runManualValuation,
  updateValuationSchedule,
  ValuationServiceError,
} from '../services/valuations.js';

interface ValuationRouteOptions {
  db: Database;
  config: RuntimeConfig;
  searchProvider?: SearchProvider | null | undefined;
  aiProvider?: AiProvider | null | undefined;
}

const assetParamsSchema = z.object({ id: z.uuid() });
const reportParamsSchema = z.object({
  id: z.uuid(),
  reportId: z.uuid(),
});

function mapError(error: ValuationServiceError): {
  status: number;
  code: string;
  message: string;
} {
  switch (error.code) {
    case 'ASSET_NOT_FOUND':
    case 'REPORT_NOT_FOUND':
      return { status: 404, code: error.code, message: error.message };
    case 'NOT_CONFIGURED':
      return { status: 503, code: error.code, message: error.message };
    case 'OUTBOUND_NOT_CONFIRMED':
    case 'REPORT_NOT_READY':
    case 'INVALID_VALUE':
    case 'NOT_ADOPTABLE':
      return { status: 400, code: error.code, message: error.message };
    case 'BUDGET_EXCEEDED':
      return { status: 429, code: error.code, message: error.message };
    default:
      return { status: 502, code: error.code, message: error.message };
  }
}

export function registerValuationRoutes(
  app: FastifyInstance,
  options: ValuationRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const dependencies = {
    ...(options.searchProvider !== undefined
      ? { searchProvider: options.searchProvider }
      : {}),
    ...(options.aiProvider !== undefined ? { aiProvider: options.aiProvider } : {}),
  };

  typedApp.get(
    '/api/v1/assets/:id/valuations/preview',
    {
      schema: {
        tags: ['Valuations'],
        params: assetParamsSchema,
        response: { 200: valuationPreviewSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }
      try {
        return await getValuationPreview(
          options.db,
          options.config,
          request.params.id,
          dependencies,
        );
      } catch (error) {
        if (error instanceof ValuationServiceError) {
          const mapped = mapError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        throw error;
      }
    },
  );

  typedApp.get(
    '/api/v1/assets/:id/valuations/reports',
    {
      schema: {
        tags: ['Valuations'],
        params: assetParamsSchema,
        response: { 200: valuationReportListSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }
      const items = await listValuationReports(options.db, request.params.id);
      return { items };
    },
  );

  typedApp.get(
    '/api/v1/assets/:id/valuations/snapshots',
    {
      schema: {
        tags: ['Valuations'],
        params: assetParamsSchema,
        response: { 200: valuationSnapshotListSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }
      const items = await listValuationSnapshots(options.db, request.params.id);
      return { items };
    },
  );

  typedApp.get(
    '/api/v1/assets/:id/valuations/schedule',
    {
      schema: {
        tags: ['Valuations'],
        params: assetParamsSchema,
        response: { 200: valuationScheduleSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }
      try {
        return await getValuationSchedule(options.db, request.params.id);
      } catch (error) {
        if (error instanceof ValuationServiceError) {
          const mapped = mapError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        throw error;
      }
    },
  );

  typedApp.put(
    '/api/v1/assets/:id/valuations/schedule',
    {
      schema: {
        tags: ['Valuations'],
        params: assetParamsSchema,
        body: updateValuationScheduleInputSchema,
        response: { 200: valuationScheduleSchema },
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
        return await updateValuationSchedule(options.db, request.params.id, request.body);
      } catch (error) {
        if (error instanceof ValuationServiceError) {
          const mapped = mapError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        throw error;
      }
    },
  );

  typedApp.get(
    '/api/v1/assets/:id/valuations/analytics',
    {
      schema: {
        tags: ['Valuations'],
        params: assetParamsSchema,
        response: { 200: valuationAnalyticsSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }
      try {
        return await getValuationAnalytics(options.db, request.params.id);
      } catch (error) {
        if (error instanceof ValuationServiceError) {
          const mapped = mapError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        throw error;
      }
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/valuations/runs',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '10 minutes',
        },
      },
      schema: {
        tags: ['Valuations'],
        params: assetParamsSchema,
        body: runValuationInputSchema,
        response: { 201: valuationReportSchema },
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
        const report = await runManualValuation(
          options.db,
          options.config,
          request.params.id,
          request.body.confirmOutboundSummary,
          dependencies,
        );
        return reply.code(201).send(report);
      } catch (error) {
        if (error instanceof ValuationServiceError) {
          const mapped = mapError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        throw error;
      }
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/valuations/reports/:reportId/confirm',
    {
      schema: {
        tags: ['Valuations'],
        params: reportParamsSchema,
        body: confirmValuationInputSchema,
        response: {
          200: z.object({
            report: valuationReportSchema,
            snapshot: valuationSnapshotSchema,
          }),
        },
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
        return await confirmValuationReport(
          options.db,
          request.params.id,
          request.params.reportId,
          request.body,
        );
      } catch (error) {
        if (error instanceof ValuationServiceError) {
          const mapped = mapError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        throw error;
      }
    },
  );
}

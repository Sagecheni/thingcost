import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { RuntimeConfig } from '@thingcost/config';
import {
  currencyCodeSchema,
  exchangeRateQuoteSchema,
  isoDateSchema,
} from '@thingcost/contracts';
import type { Database } from '@thingcost/database';

import { requireAuth, sendApiError } from '../lib/http.js';
import {
  ExchangeRateProviderError,
  FrankfurterExchangeRateProvider,
} from '../services/exchange-rates.js';

const quoteQuerySchema = z.object({
  base: currencyCodeSchema,
  quote: currencyCodeSchema,
  date: isoDateSchema,
});

export function registerExchangeRateRoutes(
  app: FastifyInstance,
  options: { db: Database; config: RuntimeConfig },
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const provider = new FrankfurterExchangeRateProvider(options.config);
  typedApp.get(
    '/api/v1/exchange-rates/quote',
    {
      schema: {
        querystring: quoteQuerySchema,
        response: { 200: exchangeRateQuoteSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] })))
        return reply;
      try {
        return await provider.quote(
          request.query.base,
          request.query.quote,
          request.query.date,
        );
      } catch (error) {
        if (error instanceof ExchangeRateProviderError) {
          return sendApiError(reply, 503, 'EXCHANGE_RATE_UNAVAILABLE', error.message);
        }
        request.log.error(error, 'Exchange rate lookup failed');
        return sendApiError(
          reply,
          503,
          'EXCHANGE_RATE_UNAVAILABLE',
          '汇率服务暂时不可用',
        );
      }
    },
  );
}

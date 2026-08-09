import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  appSettings,
  financialEvents,
  purchaseOrders,
  type Database,
} from '@thingcost/database';
import {
  applicationSettingsSchema,
  updateApplicationSettingsSchema,
} from '@thingcost/contracts';

import { isValidTimeZone } from '../lib/dates.js';
import { requireAuth, sendApiError } from '../lib/http.js';

interface SettingsRouteOptions {
  db: Database;
}

async function hasFinancialHistory(db: Database): Promise<boolean> {
  const [financialEvent] = await db
    .select({ id: financialEvents.id })
    .from(financialEvents)
    .limit(1);
  if (financialEvent) return true;

  const [purchaseOrder] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .limit(1);
  return Boolean(purchaseOrder);
}

async function readApplicationSettings(db: Database) {
  const [settings] = await db
    .select({
      timeZone: appSettings.timeZone,
      baseCurrency: appSettings.baseCurrency,
      personalApiTokensEnabled: appSettings.personalApiTokensEnabled,
      initializedAt: appSettings.initializedAt,
    })
    .from(appSettings)
    .where(eq(appSettings.id, 'default'))
    .limit(1);

  if (!settings) return null;

  return {
    ...settings,
    baseCurrencyLocked: await hasFinancialHistory(db),
    initializedAt: settings.initializedAt.toISOString(),
  };
}

export function registerSettingsRoutes(
  app: FastifyInstance,
  options: SettingsRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/api/v1/settings/application',
    { schema: { response: { 200: applicationSettingsSchema } } },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }

      const settings = await readApplicationSettings(options.db);
      if (!settings) {
        return sendApiError(reply, 404, 'SETTINGS_MISSING', '应用尚未初始化');
      }
      return settings;
    },
  );

  typedApp.patch(
    '/api/v1/settings/application',
    {
      schema: {
        body: updateApplicationSettingsSchema,
        response: { 200: applicationSettingsSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }

      const [current] = await options.db
        .select({
          timeZone: appSettings.timeZone,
          baseCurrency: appSettings.baseCurrency,
        })
        .from(appSettings)
        .where(eq(appSettings.id, 'default'))
        .limit(1);
      if (!current) {
        return sendApiError(reply, 404, 'SETTINGS_MISSING', '应用尚未初始化');
      }

      const timeZone = request.body.timeZone ?? current.timeZone;
      const baseCurrency = request.body.baseCurrency ?? current.baseCurrency;
      if (!isValidTimeZone(timeZone)) {
        return sendApiError(reply, 422, 'INVALID_TIME_ZONE', '请输入有效的 IANA 时区');
      }

      if (
        baseCurrency !== current.baseCurrency &&
        (await hasFinancialHistory(options.db))
      ) {
        return sendApiError(
          reply,
          409,
          'BASE_CURRENCY_LOCKED',
          '已有财务记录，基础币种已锁定；请在空库中调整基础币种以避免改变历史金额口径',
        );
      }

      await options.db
        .update(appSettings)
        .set({ timeZone, baseCurrency, updatedAt: new Date() })
        .where(eq(appSettings.id, 'default'));

      const updated = await readApplicationSettings(options.db);
      if (!updated) {
        return sendApiError(reply, 404, 'SETTINGS_MISSING', '应用尚未初始化');
      }
      return updated;
    },
  );
}

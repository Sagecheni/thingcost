import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  assetDetailSchema,
  completeRepairSchema,
  createConditionEventSchema,
  createLoanSchema,
  createRepairSchema,
  returnLoanSchema,
  uuidSchema,
} from '@thingcost/contracts';
import {
  appSettings,
  assets,
  assetStatuses,
  conditionDefects,
  conditionEvents,
  financialEvents,
  lifecycleEvents,
  loans,
  repairs,
  type Database,
} from '@thingcost/database';

import { currentDateInTimeZone } from '../lib/dates.js';
import { requireAuth, sendApiError } from '../lib/http.js';
import { getAssetDetail } from '../services/assets.js';
import { convertMinorAmount } from '../services/exchange-rates.js';

interface ActivityRouteOptions {
  db: Database;
}

const assetParamsSchema = z.object({ id: uuidSchema });
const loanParamsSchema = z.object({ id: uuidSchema, loanId: uuidSchema });
const repairParamsSchema = z.object({ id: uuidSchema, repairId: uuidSchema });

async function getOperationalContext(db: Database, assetId: string) {
  const [[asset], [settings], [latestLifecycle]] = await Promise.all([
    db
      .select({
        id: assets.id,
        acquisitionDate: assets.acquisitionDate,
        currentStatusId: assets.currentStatusId,
        ownershipState: assetStatuses.ownershipState,
      })
      .from(assets)
      .innerJoin(assetStatuses, eq(assets.currentStatusId, assetStatuses.id))
      .where(and(eq(assets.id, assetId), isNull(assets.deletedAt)))
      .limit(1),
    db
      .select({
        timeZone: appSettings.timeZone,
        baseCurrency: appSettings.baseCurrency,
      })
      .from(appSettings)
      .limit(1),
    db
      .select({ effectiveDate: lifecycleEvents.effectiveDate })
      .from(lifecycleEvents)
      .where(and(eq(lifecycleEvents.assetId, assetId), isNull(lifecycleEvents.voidedAt)))
      .orderBy(desc(lifecycleEvents.effectiveDate), desc(lifecycleEvents.createdAt))
      .limit(1),
  ]);

  if (!settings) {
    throw new Error('Chronicle has not been initialized.');
  }

  return {
    asset: asset ?? null,
    settings,
    latestLifecycleDate: latestLifecycle?.effectiveDate ?? null,
    today: currentDateInTimeZone(settings.timeZone),
  };
}

function validateOperationalDate(
  date: string,
  acquisitionDate: string,
  today: string,
): boolean {
  return date >= acquisitionDate && date <= today;
}

async function loadHeldStatus(db: Database, statusId: string) {
  const [status] = await db
    .select({
      id: assetStatuses.id,
      code: assetStatuses.code,
      ownershipState: assetStatuses.ownershipState,
    })
    .from(assetStatuses)
    .where(eq(assetStatuses.id, statusId))
    .limit(1);
  return status ?? null;
}

async function loadSystemStatus(db: Database, code: 'lent' | 'in_repair') {
  const [status] = await db
    .select({ id: assetStatuses.id })
    .from(assetStatuses)
    .where(eq(assetStatuses.code, code))
    .limit(1);

  if (!status) {
    throw new Error(`Missing required lifecycle status: ${code}`);
  }

  return status;
}

async function sendUpdatedAsset(
  db: Database,
  assetId: string,
  reply: Parameters<typeof sendApiError>[0],
  statusCode: 200 | 201,
) {
  const detail = await getAssetDetail(db, assetId);

  if (!detail) {
    throw new Error('Updated asset could not be loaded.');
  }

  return reply.code(statusCode).send(detail);
}

export function registerAssetActivityRoutes(
  app: FastifyInstance,
  options: ActivityRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/api/v1/assets/:id/condition-events',
    {
      schema: {
        params: assetParamsSchema,
        body: createConditionEventSchema,
        response: { 201: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }

      const context = await getOperationalContext(options.db, request.params.id);
      const asset = context.asset;

      if (!asset) {
        return sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
      }

      if (
        !validateOperationalDate(
          request.body.observedOn,
          asset.acquisitionDate,
          context.today,
        )
      ) {
        return sendApiError(
          reply,
          400,
          'INVALID_CONDITION_DATE',
          '成色日期必须介于取得日期与今天之间',
        );
      }

      await options.db.transaction(async (transaction) => {
        const [event] = await transaction
          .insert(conditionEvents)
          .values({
            assetId: asset.id,
            grade: request.body.grade,
            observedOn: request.body.observedOn,
            note: request.body.note,
          })
          .returning({ id: conditionEvents.id });

        if (!event) {
          throw new Error('Unable to create a condition event.');
        }

        if (request.body.defects.length > 0) {
          await transaction.insert(conditionDefects).values(
            request.body.defects.map((defect) => ({
              conditionEventId: event.id,
              type: defect.type,
              description: defect.description,
            })),
          );
        }

        await transaction
          .update(assets)
          .set({ updatedAt: new Date() })
          .where(eq(assets.id, asset.id));
      });

      return sendUpdatedAsset(options.db, asset.id, reply, 201);
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/loans',
    {
      schema: {
        params: assetParamsSchema,
        body: createLoanSchema,
        response: { 201: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }

      const context = await getOperationalContext(options.db, request.params.id);
      const asset = context.asset;

      if (!asset) {
        return sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
      }

      if (asset.ownershipState === 'disposed') {
        return sendApiError(reply, 409, 'ASSET_ALREADY_DISPOSED', '已处置物品不能借出');
      }

      if (
        !validateOperationalDate(
          request.body.lentOn,
          asset.acquisitionDate,
          context.today,
        ) ||
        (context.latestLifecycleDate !== null &&
          request.body.lentOn < context.latestLifecycleDate)
      ) {
        return sendApiError(
          reply,
          400,
          'INVALID_LOAN_DATE',
          '借出日期不在有效时间线范围内',
        );
      }

      const [[openLoan], [openRepair], lentStatus] = await Promise.all([
        options.db
          .select({ id: loans.id })
          .from(loans)
          .where(and(eq(loans.assetId, asset.id), isNull(loans.returnedOn)))
          .limit(1),
        options.db
          .select({ id: repairs.id })
          .from(repairs)
          .where(and(eq(repairs.assetId, asset.id), isNull(repairs.completedOn)))
          .limit(1),
        loadSystemStatus(options.db, 'lent'),
      ]);

      if (openLoan) {
        return sendApiError(reply, 409, 'LOAN_ALREADY_OPEN', '该物品已有未归还借出记录');
      }

      if (openRepair) {
        return sendApiError(reply, 409, 'ASSET_IN_REPAIR', '维修中的物品不能借出');
      }

      await options.db.transaction(async (transaction) => {
        await transaction.insert(loans).values({
          assetId: asset.id,
          borrower: request.body.borrower,
          lentOn: request.body.lentOn,
          dueOn: request.body.dueOn,
          note: request.body.note,
        });
        await transaction.insert(lifecycleEvents).values({
          assetId: asset.id,
          statusId: lentStatus.id,
          effectiveDate: request.body.lentOn,
          note: `借给 ${request.body.borrower}`,
        });
        await transaction
          .update(assets)
          .set({ currentStatusId: lentStatus.id, updatedAt: new Date() })
          .where(eq(assets.id, asset.id));
      });

      return sendUpdatedAsset(options.db, asset.id, reply, 201);
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/loans/:loanId/return',
    {
      schema: {
        params: loanParamsSchema,
        body: returnLoanSchema,
        response: { 200: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }

      const context = await getOperationalContext(options.db, request.params.id);
      const asset = context.asset;
      const [[loan], returnStatus] = await Promise.all([
        options.db
          .select({ id: loans.id, lentOn: loans.lentOn, returnedOn: loans.returnedOn })
          .from(loans)
          .where(
            and(
              eq(loans.id, request.params.loanId),
              eq(loans.assetId, request.params.id),
            ),
          )
          .limit(1),
        loadHeldStatus(options.db, request.body.statusId),
      ]);

      if (!asset || !loan) {
        return sendApiError(reply, 404, 'OPEN_LOAN_NOT_FOUND', '没有找到该借出记录');
      }

      if (loan.returnedOn) {
        return sendApiError(reply, 409, 'LOAN_ALREADY_RETURNED', '该借出记录已经归还');
      }

      if (
        !returnStatus ||
        returnStatus.ownershipState !== 'held' ||
        returnStatus.code === 'lent'
      ) {
        return sendApiError(reply, 400, 'INVALID_RETURN_STATUS', '归还后状态无效');
      }

      if (
        request.body.returnedOn < loan.lentOn ||
        request.body.returnedOn > context.today ||
        (context.latestLifecycleDate !== null &&
          request.body.returnedOn < context.latestLifecycleDate)
      ) {
        return sendApiError(
          reply,
          400,
          'INVALID_RETURN_DATE',
          '归还日期不在有效时间线范围内',
        );
      }

      await options.db.transaction(async (transaction) => {
        await transaction
          .update(loans)
          .set({
            returnedOn: request.body.returnedOn,
            returnNote: request.body.note,
            updatedAt: new Date(),
          })
          .where(eq(loans.id, loan.id));
        await transaction.insert(lifecycleEvents).values({
          assetId: asset.id,
          statusId: returnStatus.id,
          effectiveDate: request.body.returnedOn,
          note: request.body.note ?? '归还',
        });
        await transaction
          .update(assets)
          .set({ currentStatusId: returnStatus.id, updatedAt: new Date() })
          .where(eq(assets.id, asset.id));
      });

      return sendUpdatedAsset(options.db, asset.id, reply, 200);
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/repairs',
    {
      schema: {
        params: assetParamsSchema,
        body: createRepairSchema,
        response: { 201: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }

      const context = await getOperationalContext(options.db, request.params.id);
      const asset = context.asset;

      if (!asset) {
        return sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
      }

      if (asset.ownershipState === 'disposed') {
        return sendApiError(reply, 409, 'ASSET_ALREADY_DISPOSED', '已处置物品不能送修');
      }

      if (
        !validateOperationalDate(
          request.body.sentOn,
          asset.acquisitionDate,
          context.today,
        ) ||
        (context.latestLifecycleDate !== null &&
          request.body.sentOn < context.latestLifecycleDate)
      ) {
        return sendApiError(
          reply,
          400,
          'INVALID_REPAIR_DATE',
          '送修日期不在有效时间线范围内',
        );
      }

      const repairCurrency = request.body.currency ?? context.settings.baseCurrency;
      const isBaseCurrency = repairCurrency === context.settings.baseCurrency;
      const exchangeRate = request.body.exchangeRate ?? (isBaseCurrency ? '1' : null);
      if (request.body.costAmountMinor && !exchangeRate) {
        return sendApiError(
          reply,
          422,
          'EXCHANGE_RATE_REQUIRED',
          '外币维修费用需要填写锁定汇率',
        );
      }
      const exchangeRateDate = request.body.exchangeRateDate ?? request.body.sentOn;
      if (exchangeRateDate > request.body.sentOn) {
        return sendApiError(
          reply,
          400,
          'INVALID_EXCHANGE_RATE_DATE',
          '汇率参考日期不能晚于送修日期',
        );
      }

      const [[openRepair], [openLoan], repairStatus] = await Promise.all([
        options.db
          .select({ id: repairs.id })
          .from(repairs)
          .where(and(eq(repairs.assetId, asset.id), isNull(repairs.completedOn)))
          .limit(1),
        options.db
          .select({ id: loans.id })
          .from(loans)
          .where(and(eq(loans.assetId, asset.id), isNull(loans.returnedOn)))
          .limit(1),
        loadSystemStatus(options.db, 'in_repair'),
      ]);

      if (openRepair) {
        return sendApiError(reply, 409, 'REPAIR_ALREADY_OPEN', '该物品已有未完成维修');
      }

      if (openLoan) {
        return sendApiError(reply, 409, 'ASSET_ON_LOAN', '借出中的物品不能送修');
      }

      await options.db.transaction(async (transaction) => {
        let costFinancialEventId: string | null = null;

        if (request.body.costAmountMinor) {
          const amountMinor = BigInt(request.body.costAmountMinor);
          const [event] = await transaction
            .insert(financialEvents)
            .values({
              assetId: asset.id,
              type: 'repair',
              direction: 'outflow',
              amountMinor,
              currency: repairCurrency,
              baseAmountMinor: isBaseCurrency
                ? amountMinor
                : convertMinorAmount(amountMinor, exchangeRate!),
              baseCurrency: context.settings.baseCurrency,
              exchangeRate: exchangeRate!,
              exchangeRateSource:
                request.body.exchangeRateSource ?? (isBaseCurrency ? 'manual' : 'manual'),
              exchangeRateDate,
              exchangeRateFallback: request.body.exchangeRateFallback ?? false,
              occurredOn: request.body.sentOn,
              includeInNetCost: request.body.includeInNetCost,
              note: request.body.issue,
            })
            .returning({ id: financialEvents.id });
          costFinancialEventId = event?.id ?? null;
        }

        await transaction.insert(repairs).values({
          assetId: asset.id,
          issue: request.body.issue,
          provider: request.body.provider,
          sentOn: request.body.sentOn,
          costFinancialEventId,
          note: request.body.note,
        });
        await transaction.insert(lifecycleEvents).values({
          assetId: asset.id,
          statusId: repairStatus.id,
          effectiveDate: request.body.sentOn,
          note: `送修：${request.body.issue}`,
        });
        await transaction
          .update(assets)
          .set({ currentStatusId: repairStatus.id, updatedAt: new Date() })
          .where(eq(assets.id, asset.id));
      });

      return sendUpdatedAsset(options.db, asset.id, reply, 201);
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/repairs/:repairId/complete',
    {
      schema: {
        params: repairParamsSchema,
        body: completeRepairSchema,
        response: { 200: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }

      const context = await getOperationalContext(options.db, request.params.id);
      const asset = context.asset;
      const [[repair], returnStatus] = await Promise.all([
        options.db
          .select({
            id: repairs.id,
            sentOn: repairs.sentOn,
            completedOn: repairs.completedOn,
          })
          .from(repairs)
          .where(
            and(
              eq(repairs.id, request.params.repairId),
              eq(repairs.assetId, request.params.id),
            ),
          )
          .limit(1),
        loadHeldStatus(options.db, request.body.statusId),
      ]);

      if (!asset || !repair) {
        return sendApiError(reply, 404, 'OPEN_REPAIR_NOT_FOUND', '没有找到该维修记录');
      }

      if (repair.completedOn) {
        return sendApiError(reply, 409, 'REPAIR_ALREADY_COMPLETED', '该维修已经完成');
      }

      if (
        !returnStatus ||
        returnStatus.ownershipState !== 'held' ||
        returnStatus.code === 'in_repair'
      ) {
        return sendApiError(reply, 400, 'INVALID_REPAIR_STATUS', '维修完成后的状态无效');
      }

      if (
        request.body.completedOn < repair.sentOn ||
        request.body.completedOn > context.today ||
        (context.latestLifecycleDate !== null &&
          request.body.completedOn < context.latestLifecycleDate)
      ) {
        return sendApiError(
          reply,
          400,
          'INVALID_COMPLETION_DATE',
          '取回日期不在有效时间线范围内',
        );
      }

      await options.db.transaction(async (transaction) => {
        await transaction
          .update(repairs)
          .set({
            completedOn: request.body.completedOn,
            completionNote: request.body.note,
            updatedAt: new Date(),
          })
          .where(eq(repairs.id, repair.id));
        await transaction.insert(lifecycleEvents).values({
          assetId: asset.id,
          statusId: returnStatus.id,
          effectiveDate: request.body.completedOn,
          note: request.body.note ?? '维修完成',
        });
        await transaction
          .update(assets)
          .set({ currentStatusId: returnStatus.id, updatedAt: new Date() })
          .where(eq(assets.id, asset.id));
      });

      return sendUpdatedAsset(options.db, asset.id, reply, 200);
    },
  );
}

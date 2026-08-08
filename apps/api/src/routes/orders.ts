import { and, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  createPurchaseOrderSchema,
  purchaseOrderDetailSchema,
  purchaseOrderListSchema,
  uuidSchema,
} from '@thingcost/contracts';
import {
  appSettings,
  assets,
  assetStatuses,
  assetTags,
  categories,
  financialEvents,
  lifecycleEvents,
  purchaseOrderItems,
  purchaseOrders,
  tags,
  type Database,
} from '@thingcost/database';
import { allocateByLargestRemainder, allocateOrder } from '@thingcost/domain';

import { currentDateInTimeZone } from '../lib/dates.js';
import { requireAuth, sendApiError } from '../lib/http.js';
import { convertMinorAmount } from '../services/exchange-rates.js';
import { getPurchaseOrder, listPurchaseOrders } from '../services/orders.js';

interface OrderRouteOptions {
  db: Database;
}

const orderParamsSchema = z.object({ id: uuidSchema });

export function registerOrderRoutes(
  app: FastifyInstance,
  options: OrderRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/api/v1/orders',
    { schema: { response: { 200: purchaseOrderListSchema } } },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['orders:read'] })))
        return reply;
      return listPurchaseOrders(options.db);
    },
  );

  typedApp.get(
    '/api/v1/orders/:id',
    {
      schema: {
        params: orderParamsSchema,
        response: { 200: purchaseOrderDetailSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['orders:read'] })))
        return reply;
      const order = await getPurchaseOrder(options.db, request.params.id);
      return order ?? sendApiError(reply, 404, 'ORDER_NOT_FOUND', '没有找到该订单');
    },
  );

  typedApp.post(
    '/api/v1/orders',
    {
      schema: {
        body: createPurchaseOrderSchema,
        response: { 201: purchaseOrderDetailSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true })))
        return reply;

      const [settings] = await options.db
        .select({
          baseCurrency: appSettings.baseCurrency,
          timeZone: appSettings.timeZone,
        })
        .from(appSettings)
        .limit(1);
      if (!settings) throw new Error('Chronicle has not been initialized.');

      if (request.body.orderedOn > currentDateInTimeZone(settings.timeZone)) {
        return sendApiError(reply, 400, 'FUTURE_ORDER_DATE', '下单日期不能晚于今天');
      }
      const isBaseCurrency = request.body.currency === settings.baseCurrency;
      const exchangeRate = request.body.exchangeRate ?? (isBaseCurrency ? '1' : null);
      if (!exchangeRate) {
        return sendApiError(
          reply,
          422,
          'EXCHANGE_RATE_REQUIRED',
          '外币订单需要填写锁定汇率',
        );
      }
      const exchangeRateDate = request.body.exchangeRateDate ?? request.body.orderedOn;
      if (exchangeRateDate > request.body.orderedOn) {
        return sendApiError(
          reply,
          400,
          'INVALID_EXCHANGE_RATE_DATE',
          '汇率参考日期不能晚于下单日期',
        );
      }

      const categoryIds = [...new Set(request.body.items.map((item) => item.categoryId))];
      const statusIds = [
        ...new Set(request.body.items.map((item) => item.initialStatusId)),
      ];
      const tagIds = [...new Set(request.body.items.flatMap((item) => item.tagIds))];
      const [categoryRows, statusRows, tagRows] = await Promise.all([
        options.db
          .select({ id: categories.id, name: categories.name })
          .from(categories)
          .where(and(inArray(categories.id, categoryIds), isNull(categories.deletedAt))),
        options.db
          .select({
            id: assetStatuses.id,
            code: assetStatuses.code,
            name: assetStatuses.name,
            ownershipState: assetStatuses.ownershipState,
          })
          .from(assetStatuses)
          .where(
            and(inArray(assetStatuses.id, statusIds), isNull(assetStatuses.deletedAt)),
          ),
        tagIds.length === 0
          ? Promise.resolve([])
          : options.db
              .select({ id: tags.id })
              .from(tags)
              .where(and(inArray(tags.id, tagIds), isNull(tags.deletedAt))),
      ]);

      if (categoryRows.length !== categoryIds.length) {
        return sendApiError(reply, 400, 'INVALID_CATEGORY', '一个或多个商品分类不存在');
      }
      if (
        statusRows.length !== statusIds.length ||
        statusRows.some(
          (status) =>
            status.ownershipState === 'disposed' ||
            ['lent', 'in_repair'].includes(status.code),
        )
      ) {
        return sendApiError(
          reply,
          400,
          'INVALID_INITIAL_STATUS',
          '商品初始状态必须仍在持有',
        );
      }
      if (tagRows.length !== tagIds.length) {
        return sendApiError(reply, 400, 'INVALID_TAG', '一个或多个标签不存在');
      }

      const categoryNames = new Map(categoryRows.map((row) => [row.id, row.name]));
      const statusNames = new Map(statusRows.map((row) => [row.id, row.name]));

      const allocation = allocateOrder(
        request.body.items.map((item) => ({
          listedPriceMinor: BigInt(item.listedPriceMinor),
          ...(item.allocatedAmountMinor === undefined
            ? {}
            : { manualAllocatedAmountMinor: BigInt(item.allocatedAmountMinor) }),
        })),
        {
          discountMinor: BigInt(request.body.discountMinor),
          shippingMinor: BigInt(request.body.shippingMinor),
          taxMinor: BigInt(request.body.taxMinor),
          feeMinor: BigInt(request.body.feeMinor),
        },
        request.body.allocationMethod,
      );

      const baseTotalPaidMinor = isBaseCurrency
        ? allocation.totalPaidMinor
        : convertMinorAmount(allocation.totalPaidMinor, exchangeRate);
      const baseLineAmounts = allocateByLargestRemainder(
        baseTotalPaidMinor,
        allocation.lines.map((line) => line.allocatedAmountMinor),
      );

      const orderId = await options.db.transaction(async (transaction) => {
        const [createdOrder] = await transaction
          .insert(purchaseOrders)
          .values({
            merchant: request.body.merchant || null,
            orderNumber: request.body.orderNumber || null,
            orderedOn: request.body.orderedOn,
            currency: request.body.currency,
            subtotalMinor: allocation.subtotalMinor,
            discountMinor: BigInt(request.body.discountMinor),
            shippingMinor: BigInt(request.body.shippingMinor),
            taxMinor: BigInt(request.body.taxMinor),
            feeMinor: BigInt(request.body.feeMinor),
            totalPaidMinor: allocation.totalPaidMinor,
            baseTotalPaidMinor,
            baseCurrency: settings.baseCurrency,
            exchangeRate,
            exchangeRateSource:
              request.body.exchangeRateSource ?? (isBaseCurrency ? 'manual' : 'manual'),
            exchangeRateDate,
            exchangeRateFallback: request.body.exchangeRateFallback ?? false,
            allocationMethod: request.body.allocationMethod,
            note: request.body.note || null,
          })
          .returning({ id: purchaseOrders.id });
        if (!createdOrder) throw new Error('Unable to create purchase order.');

        for (const [index, item] of request.body.items.entries()) {
          const lineAllocation = allocation.lines[index];
          if (!lineAllocation) throw new Error('Order allocation is incomplete.');

          const [createdAsset] = await transaction
            .insert(assets)
            .values({
              name: item.name,
              categoryId: item.categoryId,
              acquisitionType: 'purchase',
              acquisitionDate: request.body.orderedOn,
              costKnowledge:
                lineAllocation.allocatedAmountMinor === 0n
                  ? 'known_zero'
                  : 'known_amount',
              priceCurrency: request.body.currency,
              originalPriceMinor: lineAllocation.listedPriceMinor,
              discountMinor: lineAllocation.allocatedDiscountMinor,
              brand: item.brand || null,
              model: item.model || null,
              currentStatusId: item.initialStatusId,
            })
            .returning({ id: assets.id });
          if (!createdAsset) throw new Error('Unable to create order asset.');

          await transaction.insert(lifecycleEvents).values({
            assetId: createdAsset.id,
            statusId: item.initialStatusId,
            effectiveDate: request.body.orderedOn,
            note: request.body.orderNumber
              ? `由订单 ${request.body.orderNumber} 创建`
              : '由订单创建',
          });
          if (item.tagIds.length > 0) {
            await transaction
              .insert(assetTags)
              .values(item.tagIds.map((tagId) => ({ assetId: createdAsset.id, tagId })));
          }

          let acquisitionFinancialEventId: string | null = null;
          if (lineAllocation.allocatedAmountMinor > 0n) {
            const [event] = await transaction
              .insert(financialEvents)
              .values({
                assetId: createdAsset.id,
                type: 'acquisition',
                direction: 'outflow',
                amountMinor: lineAllocation.allocatedAmountMinor,
                currency: request.body.currency,
                baseAmountMinor: baseLineAmounts[index] ?? 0n,
                baseCurrency: settings.baseCurrency,
                exchangeRate,
                exchangeRateSource:
                  request.body.exchangeRateSource ??
                  (isBaseCurrency ? 'manual' : 'manual'),
                exchangeRateDate,
                exchangeRateFallback: request.body.exchangeRateFallback ?? false,
                occurredOn: request.body.orderedOn,
                includeInNetCost: true,
                note: request.body.orderNumber
                  ? `订单 ${request.body.orderNumber} 分摊取得成本`
                  : '订单分摊取得成本',
              })
              .returning({ id: financialEvents.id });
            acquisitionFinancialEventId = event?.id ?? null;
          }

          await transaction.insert(purchaseOrderItems).values({
            orderId: createdOrder.id,
            assetId: createdAsset.id,
            assetNameSnapshot: item.name,
            categoryNameSnapshot: categoryNames.get(item.categoryId) ?? '已删除分类',
            statusNameSnapshot: statusNames.get(item.initialStatusId) ?? '已删除状态',
            acquisitionFinancialEventId,
            listedPriceMinor: lineAllocation.listedPriceMinor,
            allocatedDiscountMinor: lineAllocation.allocatedDiscountMinor,
            allocatedShippingMinor: lineAllocation.allocatedShippingMinor,
            allocatedTaxMinor: lineAllocation.allocatedTaxMinor,
            allocatedFeeMinor: lineAllocation.allocatedFeeMinor,
            allocationAdjustmentMinor: lineAllocation.allocationAdjustmentMinor,
            allocatedAmountMinor: lineAllocation.allocatedAmountMinor,
            sortOrder: index,
          });
        }

        return createdOrder.id;
      });

      const created = await getPurchaseOrder(options.db, orderId);
      if (!created) throw new Error('Created order could not be loaded.');
      return reply.code(201).send(created);
    },
  );
}

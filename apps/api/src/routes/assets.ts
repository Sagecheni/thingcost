import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { RuntimeConfig } from '@thingcost/config';
import {
  assetDetailSchema,
  assetListQuerySchema,
  assetListSchema,
  correctFinancialEventSchema,
  correctLifecycleEventSchema,
  createAssetSchema,
  createFinancialEventSchema,
  permanentDeleteAssetInputSchema,
  recycleBinSchema,
  transitionAssetSchema,
  updateAssetSchema,
  uuidSchema,
} from '@thingcost/contracts';
import {
  appSettings,
  assetAttachments,
  assets,
  assetStatuses,
  assetTags,
  categories,
  financialEvents,
  lifecycleEvents,
  purchaseOrderItems,
  repairs,
  tags,
  type Database,
} from '@thingcost/database';

import { currentDateInTimeZone } from '../lib/dates.js';
import { convertMinorAmount } from '../services/exchange-rates.js';
import { requireAuth, sendApiError } from '../lib/http.js';
import { AttachmentStorage } from '../services/attachment-storage.js';
import { getAssetDetail, listAssetSummaries } from '../services/assets.js';

interface AssetRouteOptions {
  db: Database;
  config: RuntimeConfig;
  storage?: AttachmentStorage;
}

const assetParamsSchema = z.object({ id: uuidSchema });
const assetEventParamsSchema = z.object({ id: uuidSchema, eventId: uuidSchema });

async function getSettings(db: Database) {
  const [settings] = await db
    .select({
      baseCurrency: appSettings.baseCurrency,
      timeZone: appSettings.timeZone,
    })
    .from(appSettings)
    .limit(1);

  if (!settings) {
    throw new Error('Chronicle has not been initialized.');
  }

  return settings;
}

export function registerAssetRoutes(
  app: FastifyInstance,
  options: AssetRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const storage =
    options.storage ??
    new AttachmentStorage(
      options.config.ATTACHMENTS_DIR,
      options.config.ATTACHMENT_MAX_BYTES,
    );

  typedApp.get(
    '/api/v1/assets',
    {
      schema: {
        querystring: assetListQuerySchema,
        response: { 200: assetListSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }

      const items = await listAssetSummaries(options.db, request.query);
      return { items, total: items.length };
    },
  );

  typedApp.get(
    '/api/v1/assets/recycle-bin',
    {
      schema: { response: { 200: recycleBinSchema } },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }

      const rows = await options.db
        .select({
          id: assets.id,
          name: assets.name,
          acquisitionDate: assets.acquisitionDate,
          deletedAt: assets.deletedAt,
          purgeAfter: assets.purgeAfter,
          category: {
            id: categories.id,
            name: categories.name,
            color: categories.color,
            icon: categories.icon,
            isSystem: categories.isSystem,
            sortOrder: categories.sortOrder,
          },
        })
        .from(assets)
        .innerJoin(categories, eq(assets.categoryId, categories.id))
        .where(isNotNull(assets.deletedAt))
        .orderBy(desc(assets.deletedAt));

      const items = rows.flatMap((row) =>
        row.deletedAt
          ? [
              {
                ...row,
                deletedAt: row.deletedAt.toISOString(),
                purgeAfter: row.purgeAfter?.toISOString() ?? null,
              },
            ]
          : [],
      );
      return { items, total: items.length };
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/restore',
    {
      schema: { params: assetParamsSchema, response: { 200: assetDetailSchema } },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }

      const [restored] = await options.db
        .update(assets)
        .set({ deletedAt: null, purgeAfter: null, updatedAt: new Date() })
        .where(and(eq(assets.id, request.params.id), isNotNull(assets.deletedAt)))
        .returning({ id: assets.id });
      if (!restored) {
        return sendApiError(reply, 404, 'RECYCLED_ASSET_NOT_FOUND', '回收站中没有该物品');
      }

      const asset = await getAssetDetail(options.db, restored.id);
      if (!asset) throw new Error('Restored asset could not be loaded.');
      return asset;
    },
  );

  typedApp.delete(
    '/api/v1/assets/:id/permanent',
    {
      schema: {
        params: assetParamsSchema,
        body: permanentDeleteAssetInputSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }

      const [asset] = await options.db
        .select({ id: assets.id, name: assets.name })
        .from(assets)
        .where(and(eq(assets.id, request.params.id), isNotNull(assets.deletedAt)))
        .limit(1);
      if (!asset) {
        return sendApiError(reply, 404, 'RECYCLED_ASSET_NOT_FOUND', '回收站中没有该物品');
      }
      if (request.body.assetName !== asset.name) {
        return sendApiError(
          reply,
          400,
          'DELETE_CONFIRMATION_MISMATCH',
          '物品名称确认不匹配',
        );
      }

      const attachmentRows = await options.db
        .select({
          storageKey: assetAttachments.storageKey,
          thumbnailStorageKey: assetAttachments.thumbnailStorageKey,
        })
        .from(assetAttachments)
        .where(eq(assetAttachments.assetId, asset.id));

      await options.db.delete(assets).where(eq(assets.id, asset.id));
      try {
        await storage.remove(
          attachmentRows.flatMap((item) => [item.storageKey, item.thumbnailStorageKey]),
        );
      } catch (error) {
        request.log.error(error, 'Permanent asset deletion left orphaned files');
      }
      return reply.code(204).send(null);
    },
  );

  typedApp.get(
    '/api/v1/assets/:id',
    {
      schema: {
        params: assetParamsSchema,
        response: { 200: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }

      const asset = await getAssetDetail(options.db, request.params.id);
      return asset ?? sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
    },
  );

  typedApp.post(
    '/api/v1/assets',
    {
      schema: {
        body: createAssetSchema,
        response: { 201: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }

      const settings = await getSettings(options.db);
      const today = currentDateInTimeZone(settings.timeZone);

      if (request.body.acquisitionDate > today) {
        return sendApiError(
          reply,
          400,
          'FUTURE_ACQUISITION_DATE',
          '取得日期不能晚于今天',
        );
      }

      const [[category], [initialStatus]] = await Promise.all([
        options.db
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(eq(categories.id, request.body.categoryId), isNull(categories.deletedAt)),
          )
          .limit(1),
        options.db
          .select({
            id: assetStatuses.id,
            code: assetStatuses.code,
            ownershipState: assetStatuses.ownershipState,
          })
          .from(assetStatuses)
          .where(
            and(
              eq(assetStatuses.id, request.body.initialStatusId),
              isNull(assetStatuses.deletedAt),
            ),
          )
          .limit(1),
      ]);

      if (!category) {
        return sendApiError(reply, 400, 'INVALID_CATEGORY', '所选分类不存在');
      }

      if (
        !initialStatus ||
        initialStatus.ownershipState === 'disposed' ||
        ['lent', 'in_repair'].includes(initialStatus.code)
      ) {
        return sendApiError(
          reply,
          400,
          'INVALID_INITIAL_STATUS',
          '初始状态必须仍在持有，借出与维修状态需通过对应工作流进入',
        );
      }

      const validTagRows =
        request.body.tagIds.length === 0
          ? []
          : await options.db
              .select({ id: tags.id })
              .from(tags)
              .where(and(inArray(tags.id, request.body.tagIds), isNull(tags.deletedAt)));

      if (validTagRows.length !== new Set(request.body.tagIds).size) {
        return sendApiError(reply, 400, 'INVALID_TAG', '一个或多个标签不存在');
      }

      const acquisitionCurrency = request.body.priceCurrency ?? settings.baseCurrency;
      const isBaseAcquisition = acquisitionCurrency === settings.baseCurrency;
      const acquisitionRate =
        request.body.exchangeRate ?? (isBaseAcquisition ? '1' : null);
      if (request.body.costKnowledge === 'known_amount' && !acquisitionRate) {
        return sendApiError(
          reply,
          422,
          'EXCHANGE_RATE_REQUIRED',
          '外币取得成本需要填写锁定汇率',
        );
      }
      const acquisitionRateDate =
        request.body.exchangeRateDate ?? request.body.acquisitionDate;
      if (acquisitionRateDate > request.body.acquisitionDate) {
        return sendApiError(
          reply,
          400,
          'INVALID_EXCHANGE_RATE_DATE',
          '汇率参考日期不能晚于取得日期',
        );
      }
      const assetId = await options.db.transaction(async (transaction) => {
        const [createdAsset] = await transaction
          .insert(assets)
          .values({
            name: request.body.name,
            description: request.body.description,
            categoryId: request.body.categoryId,
            acquisitionType: request.body.acquisitionType,
            acquisitionDate: request.body.acquisitionDate,
            costKnowledge: request.body.costKnowledge,
            priceCurrency: request.body.priceCurrency ?? null,
            originalPriceMinor: request.body.originalPriceMinor
              ? BigInt(request.body.originalPriceMinor)
              : null,
            discountMinor: request.body.discountMinor
              ? BigInt(request.body.discountMinor)
              : null,
            brand: request.body.brand,
            model: request.body.model,
            serialNumber: request.body.serialNumber,
            purchaseChannel: request.body.purchaseChannel,
            orderNumber: request.body.orderNumber,
            warrantyStartDate: request.body.warrantyStartDate,
            warrantyEndDate: request.body.warrantyEndDate,
            extendedWarrantyEndDate: request.body.extendedWarrantyEndDate,
            extendedWarrantyProvider: request.body.extendedWarrantyProvider,
            currentStatusId: request.body.initialStatusId,
          })
          .returning({ id: assets.id });

        if (!createdAsset) {
          throw new Error('Unable to create an asset.');
        }

        await transaction.insert(lifecycleEvents).values({
          assetId: createdAsset.id,
          statusId: request.body.initialStatusId,
          effectiveDate: request.body.acquisitionDate,
          note: request.body.note,
        });

        if (request.body.tagIds.length > 0) {
          await transaction.insert(assetTags).values(
            request.body.tagIds.map((tagId) => ({
              assetId: createdAsset.id,
              tagId,
            })),
          );
        }

        if (
          request.body.costKnowledge === 'known_amount' &&
          request.body.acquisitionAmountMinor
        ) {
          const amountMinor = BigInt(request.body.acquisitionAmountMinor);
          await transaction.insert(financialEvents).values({
            assetId: createdAsset.id,
            type: 'acquisition',
            direction: 'outflow',
            amountMinor,
            currency: acquisitionCurrency,
            baseAmountMinor: isBaseAcquisition
              ? amountMinor
              : convertMinorAmount(amountMinor, acquisitionRate!),
            baseCurrency: settings.baseCurrency,
            exchangeRate: acquisitionRate!,
            exchangeRateSource:
              request.body.exchangeRateSource ??
              (isBaseAcquisition ? 'manual' : 'manual'),
            exchangeRateDate: acquisitionRateDate,
            exchangeRateFallback: request.body.exchangeRateFallback ?? false,
            occurredOn: request.body.acquisitionDate,
            includeInNetCost: true,
            note: '取得成本',
          });
        }

        return createdAsset.id;
      });

      const created = await getAssetDetail(options.db, assetId);

      if (!created) {
        throw new Error('Created asset could not be loaded.');
      }

      return reply.code(201).send(created);
    },
  );

  typedApp.patch(
    '/api/v1/assets/:id',
    {
      schema: {
        params: assetParamsSchema,
        body: updateAssetSchema,
        response: { 200: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }

      const [existing] = await options.db
        .select({
          id: assets.id,
          originalPriceMinor: assets.originalPriceMinor,
          discountMinor: assets.discountMinor,
          warrantyStartDate: assets.warrantyStartDate,
          warrantyEndDate: assets.warrantyEndDate,
          extendedWarrantyEndDate: assets.extendedWarrantyEndDate,
        })
        .from(assets)
        .where(and(eq(assets.id, request.params.id), isNull(assets.deletedAt)))
        .limit(1);

      if (!existing) {
        return sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
      }

      if (request.body.categoryId) {
        const [category] = await options.db
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(eq(categories.id, request.body.categoryId), isNull(categories.deletedAt)),
          )
          .limit(1);

        if (!category) {
          return sendApiError(reply, 400, 'INVALID_CATEGORY', '所选分类不存在');
        }
      }

      if (request.body.tagIds) {
        const validTagRows =
          request.body.tagIds.length === 0
            ? []
            : await options.db
                .select({ id: tags.id })
                .from(tags)
                .where(
                  and(inArray(tags.id, request.body.tagIds), isNull(tags.deletedAt)),
                );

        if (validTagRows.length !== new Set(request.body.tagIds).size) {
          return sendApiError(reply, 400, 'INVALID_TAG', '一个或多个标签不存在');
        }
      }

      const nextOriginalPrice =
        request.body.originalPriceMinor === undefined
          ? existing.originalPriceMinor
          : request.body.originalPriceMinor === null
            ? null
            : BigInt(request.body.originalPriceMinor);
      const nextDiscount =
        request.body.discountMinor === undefined
          ? existing.discountMinor
          : request.body.discountMinor === null
            ? null
            : BigInt(request.body.discountMinor);

      if (
        nextOriginalPrice !== null &&
        nextDiscount !== null &&
        nextDiscount > nextOriginalPrice
      ) {
        return sendApiError(reply, 400, 'INVALID_DISCOUNT', '优惠金额不能大于原价');
      }

      const nextWarrantyStart =
        request.body.warrantyStartDate === undefined
          ? existing.warrantyStartDate
          : request.body.warrantyStartDate;
      const nextWarrantyEnd =
        request.body.warrantyEndDate === undefined
          ? existing.warrantyEndDate
          : request.body.warrantyEndDate;
      const nextExtendedWarrantyEnd =
        request.body.extendedWarrantyEndDate === undefined
          ? existing.extendedWarrantyEndDate
          : request.body.extendedWarrantyEndDate;
      if (nextWarrantyStart && nextWarrantyEnd && nextWarrantyEnd < nextWarrantyStart) {
        return sendApiError(
          reply,
          400,
          'INVALID_WARRANTY_RANGE',
          '保修结束日期不能早于开始日期',
        );
      }
      if (
        nextWarrantyEnd &&
        nextExtendedWarrantyEnd &&
        nextExtendedWarrantyEnd < nextWarrantyEnd
      ) {
        return sendApiError(
          reply,
          400,
          'INVALID_EXTENDED_WARRANTY_RANGE',
          '延保结束日期不能早于原保修结束日期',
        );
      }

      await options.db.transaction(async (transaction) => {
        await transaction
          .update(assets)
          .set({
            name: request.body.name,
            description: request.body.description,
            categoryId: request.body.categoryId,
            brand: request.body.brand,
            model: request.body.model,
            serialNumber: request.body.serialNumber,
            purchaseChannel: request.body.purchaseChannel,
            orderNumber: request.body.orderNumber,
            warrantyStartDate: request.body.warrantyStartDate,
            warrantyEndDate: request.body.warrantyEndDate,
            extendedWarrantyEndDate: request.body.extendedWarrantyEndDate,
            extendedWarrantyProvider: request.body.extendedWarrantyProvider,
            originalPriceMinor:
              request.body.originalPriceMinor === undefined
                ? undefined
                : nextOriginalPrice,
            discountMinor:
              request.body.discountMinor === undefined ? undefined : nextDiscount,
            updatedAt: new Date(),
          })
          .where(eq(assets.id, existing.id));

        if (request.body.tagIds) {
          await transaction.delete(assetTags).where(eq(assetTags.assetId, existing.id));

          if (request.body.tagIds.length > 0) {
            await transaction.insert(assetTags).values(
              request.body.tagIds.map((tagId) => ({
                assetId: existing.id,
                tagId,
              })),
            );
          }
        }
      });

      const updated = await getAssetDetail(options.db, existing.id);
      return updated ?? sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/lifecycle-events',
    {
      schema: {
        params: assetParamsSchema,
        body: transitionAssetSchema,
        response: { 201: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }

      const settings = await getSettings(options.db);
      const today = currentDateInTimeZone(settings.timeZone);

      const [[asset], [targetStatus], [latestEvent]] = await Promise.all([
        options.db
          .select({
            id: assets.id,
            acquisitionDate: assets.acquisitionDate,
            currentStatusId: assets.currentStatusId,
            currentStatusCode: assetStatuses.code,
          })
          .from(assets)
          .innerJoin(assetStatuses, eq(assets.currentStatusId, assetStatuses.id))
          .where(and(eq(assets.id, request.params.id), isNull(assets.deletedAt)))
          .limit(1),
        options.db
          .select({ id: assetStatuses.id, code: assetStatuses.code })
          .from(assetStatuses)
          .where(
            and(
              eq(assetStatuses.id, request.body.statusId),
              isNull(assetStatuses.deletedAt),
            ),
          )
          .limit(1),
        options.db
          .select({
            statusId: lifecycleEvents.statusId,
            effectiveDate: lifecycleEvents.effectiveDate,
            ownershipState: assetStatuses.ownershipState,
          })
          .from(lifecycleEvents)
          .innerJoin(assetStatuses, eq(lifecycleEvents.statusId, assetStatuses.id))
          .where(
            and(
              eq(lifecycleEvents.assetId, request.params.id),
              isNull(lifecycleEvents.voidedAt),
            ),
          )
          .orderBy(desc(lifecycleEvents.effectiveDate), desc(lifecycleEvents.createdAt))
          .limit(1),
      ]);

      if (!asset) {
        return sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
      }

      if (!targetStatus) {
        return sendApiError(reply, 400, 'INVALID_STATUS', '所选状态不存在');
      }

      if (['lent', 'in_repair'].includes(targetStatus.code)) {
        return sendApiError(
          reply,
          409,
          'MANAGED_STATUS_REQUIRES_WORKFLOW',
          '借出或维修状态必须通过对应流程创建',
        );
      }

      if (['lent', 'in_repair'].includes(asset.currentStatusCode)) {
        return sendApiError(
          reply,
          409,
          'MANAGED_STATUS_REQUIRES_WORKFLOW',
          '请先完成当前借出或维修流程',
        );
      }

      if (latestEvent?.ownershipState === 'disposed') {
        return sendApiError(
          reply,
          409,
          'ASSET_ALREADY_DISPOSED',
          '已处置物品不能继续切换状态',
        );
      }

      if (
        request.body.effectiveDate < asset.acquisitionDate ||
        request.body.effectiveDate > today
      ) {
        return sendApiError(
          reply,
          400,
          'INVALID_LIFECYCLE_DATE',
          '状态日期必须介于取得日期与今天之间',
        );
      }

      if (latestEvent && request.body.effectiveDate < latestEvent.effectiveDate) {
        return sendApiError(
          reply,
          409,
          'BACKDATED_TRANSITION_UNSUPPORTED',
          '当前版本不能在已有状态事件之前插入新状态',
        );
      }

      if (asset.currentStatusId === request.body.statusId) {
        return sendApiError(reply, 409, 'STATUS_UNCHANGED', '物品已经处于该状态');
      }

      await options.db.transaction(async (transaction) => {
        await transaction.insert(lifecycleEvents).values({
          assetId: asset.id,
          statusId: request.body.statusId,
          effectiveDate: request.body.effectiveDate,
          note: request.body.note,
        });
        await transaction
          .update(assets)
          .set({ currentStatusId: request.body.statusId, updatedAt: new Date() })
          .where(eq(assets.id, asset.id));
      });

      const updated = await getAssetDetail(options.db, asset.id);

      if (!updated) {
        throw new Error('Updated asset could not be loaded.');
      }

      return reply.code(201).send(updated);
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/lifecycle-events/:eventId/correct',
    {
      schema: {
        params: assetEventParamsSchema,
        body: correctLifecycleEventSchema,
        response: { 200: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }
      const settings = await getSettings(options.db);
      const today = currentDateInTimeZone(settings.timeZone);
      const [[asset], [original], activeRows] = await Promise.all([
        options.db
          .select({ id: assets.id, acquisitionDate: assets.acquisitionDate })
          .from(assets)
          .where(and(eq(assets.id, request.params.id), isNull(assets.deletedAt)))
          .limit(1),
        options.db
          .select({ id: lifecycleEvents.id, voidedAt: lifecycleEvents.voidedAt })
          .from(lifecycleEvents)
          .where(
            and(
              eq(lifecycleEvents.id, request.params.eventId),
              eq(lifecycleEvents.assetId, request.params.id),
            ),
          )
          .limit(1),
        options.db
          .select({ id: lifecycleEvents.id })
          .from(lifecycleEvents)
          .where(
            and(
              eq(lifecycleEvents.assetId, request.params.id),
              isNull(lifecycleEvents.voidedAt),
            ),
          ),
      ]);
      if (!asset || !original) {
        return sendApiError(
          reply,
          404,
          'LIFECYCLE_EVENT_NOT_FOUND',
          '没有找到该状态事件',
        );
      }
      if (original.voidedAt) {
        return sendApiError(reply, 409, 'EVENT_ALREADY_VOIDED', '该状态事件已经作废');
      }
      if (!request.body.replacement && activeRows.length <= 1) {
        return sendApiError(
          reply,
          409,
          'INITIAL_LIFECYCLE_EVENT_REQUIRED',
          '物品必须至少保留一条有效状态事件',
        );
      }
      if (request.body.replacement) {
        if (
          request.body.replacement.effectiveDate < asset.acquisitionDate ||
          request.body.replacement.effectiveDate > today
        ) {
          return sendApiError(
            reply,
            400,
            'INVALID_LIFECYCLE_DATE',
            '更正后的状态日期必须介于取得日期与今天之间',
          );
        }
        const [status] = await options.db
          .select({ id: assetStatuses.id })
          .from(assetStatuses)
          .where(
            and(
              eq(assetStatuses.id, request.body.replacement.statusId),
              isNull(assetStatuses.deletedAt),
            ),
          )
          .limit(1);
        if (!status) {
          return sendApiError(reply, 400, 'INVALID_STATUS', '更正后的状态不存在');
        }
      }

      await options.db.transaction(async (transaction) => {
        await transaction
          .update(lifecycleEvents)
          .set({ voidedAt: new Date(), voidReason: request.body.reason })
          .where(eq(lifecycleEvents.id, original.id));
        if (request.body.replacement) {
          await transaction.insert(lifecycleEvents).values({
            assetId: asset.id,
            statusId: request.body.replacement.statusId,
            effectiveDate: request.body.replacement.effectiveDate,
            note: request.body.replacement.note,
            correctionOfId: original.id,
          });
        }
        const [latest] = await transaction
          .select({ statusId: lifecycleEvents.statusId })
          .from(lifecycleEvents)
          .where(
            and(eq(lifecycleEvents.assetId, asset.id), isNull(lifecycleEvents.voidedAt)),
          )
          .orderBy(desc(lifecycleEvents.effectiveDate), desc(lifecycleEvents.createdAt))
          .limit(1);
        if (!latest) throw new Error('Lifecycle correction removed all active events.');
        await transaction
          .update(assets)
          .set({ currentStatusId: latest.statusId, updatedAt: new Date() })
          .where(eq(assets.id, asset.id));
      });

      const updated = await getAssetDetail(options.db, asset.id);
      if (!updated) throw new Error('Corrected asset could not be loaded.');
      return updated;
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/financial-events/:eventId/correct',
    {
      schema: {
        params: assetEventParamsSchema,
        body: correctFinancialEventSchema,
        response: { 200: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }
      const settings = await getSettings(options.db);
      const today = currentDateInTimeZone(settings.timeZone);
      const [[asset], [original], [orderLine]] = await Promise.all([
        options.db
          .select({ id: assets.id, acquisitionDate: assets.acquisitionDate })
          .from(assets)
          .where(and(eq(assets.id, request.params.id), isNull(assets.deletedAt)))
          .limit(1),
        options.db
          .select({ id: financialEvents.id, voidedAt: financialEvents.voidedAt })
          .from(financialEvents)
          .where(
            and(
              eq(financialEvents.id, request.params.eventId),
              eq(financialEvents.assetId, request.params.id),
            ),
          )
          .limit(1),
        options.db
          .select({ id: purchaseOrderItems.id })
          .from(purchaseOrderItems)
          .where(
            eq(purchaseOrderItems.acquisitionFinancialEventId, request.params.eventId),
          )
          .limit(1),
      ]);
      if (!asset || !original) {
        return sendApiError(
          reply,
          404,
          'FINANCIAL_EVENT_NOT_FOUND',
          '没有找到该资金事件',
        );
      }
      if (original.voidedAt) {
        return sendApiError(reply, 409, 'EVENT_ALREADY_VOIDED', '该资金事件已经作废');
      }
      if (orderLine) {
        return sendApiError(
          reply,
          409,
          'ORDER_EVENT_IMMUTABLE',
          '订单分摊产生的取得成本属于已过账订单，不能单独更正',
        );
      }

      let replacementValues:
        (typeof financialEvents.$inferInsert & { correctionOfId: string }) | null = null;
      if (request.body.replacement) {
        const replacement = request.body.replacement;
        if (
          replacement.occurredOn < asset.acquisitionDate ||
          replacement.occurredOn > today
        ) {
          return sendApiError(
            reply,
            400,
            'INVALID_FINANCIAL_DATE',
            '更正后的资金日期必须介于取得日期与今天之间',
          );
        }
        const expectedDirection =
          replacement.type === 'refund' || replacement.type === 'sale_proceeds'
            ? 'inflow'
            : replacement.type === 'other'
              ? replacement.direction
              : 'outflow';
        if (replacement.direction !== expectedDirection) {
          return sendApiError(reply, 400, 'INVALID_DIRECTION', '更正后的收支方向不正确');
        }
        const amountMinor = BigInt(replacement.amountMinor);
        const isBaseCurrency = replacement.currency === settings.baseCurrency;
        const exchangeRate = replacement.exchangeRate ?? (isBaseCurrency ? '1' : null);
        if (!exchangeRate) {
          return sendApiError(
            reply,
            422,
            'EXCHANGE_RATE_REQUIRED',
            '外币资金事件需要填写锁定汇率',
          );
        }
        const exchangeRateDate = replacement.exchangeRateDate ?? replacement.occurredOn;
        if (exchangeRateDate > replacement.occurredOn) {
          return sendApiError(
            reply,
            400,
            'INVALID_EXCHANGE_RATE_DATE',
            '汇率参考日期不能晚于资金日期',
          );
        }
        replacementValues = {
          assetId: asset.id,
          type: replacement.type,
          direction: replacement.direction,
          amountMinor,
          currency: replacement.currency,
          baseAmountMinor: isBaseCurrency
            ? amountMinor
            : convertMinorAmount(amountMinor, exchangeRate),
          baseCurrency: settings.baseCurrency,
          exchangeRate,
          exchangeRateSource:
            replacement.exchangeRateSource ?? (isBaseCurrency ? 'manual' : 'manual'),
          exchangeRateDate,
          exchangeRateFallback: replacement.exchangeRateFallback ?? false,
          occurredOn: replacement.occurredOn,
          includeInNetCost: replacement.includeInNetCost,
          note: replacement.note,
          correctionOfId: original.id,
        };
      }

      await options.db.transaction(async (transaction) => {
        await transaction
          .update(financialEvents)
          .set({ voidedAt: new Date(), voidReason: request.body.reason })
          .where(eq(financialEvents.id, original.id));
        let replacementId: string | null = null;
        if (replacementValues) {
          const [replacement] = await transaction
            .insert(financialEvents)
            .values(replacementValues)
            .returning({ id: financialEvents.id });
          replacementId = replacement?.id ?? null;
        }
        await transaction
          .update(repairs)
          .set({ costFinancialEventId: replacementId, updatedAt: new Date() })
          .where(eq(repairs.costFinancialEventId, original.id));
        await transaction
          .update(assets)
          .set({ updatedAt: new Date() })
          .where(eq(assets.id, asset.id));
      });

      const updated = await getAssetDetail(options.db, asset.id);
      if (!updated) throw new Error('Corrected asset could not be loaded.');
      return updated;
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/financial-events',
    {
      schema: {
        params: assetParamsSchema,
        body: createFinancialEventSchema,
        response: { 201: assetDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }

      const settings = await getSettings(options.db);
      const today = currentDateInTimeZone(settings.timeZone);
      const [asset] = await options.db
        .select({ id: assets.id, acquisitionDate: assets.acquisitionDate })
        .from(assets)
        .where(and(eq(assets.id, request.params.id), isNull(assets.deletedAt)))
        .limit(1);

      if (!asset) {
        return sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
      }

      if (
        request.body.occurredOn < asset.acquisitionDate ||
        request.body.occurredOn > today
      ) {
        return sendApiError(
          reply,
          400,
          'INVALID_FINANCIAL_DATE',
          '资金日期必须介于取得日期与今天之间',
        );
      }

      const expectedDirection =
        request.body.type === 'refund' || request.body.type === 'sale_proceeds'
          ? 'inflow'
          : request.body.type === 'other'
            ? request.body.direction
            : 'outflow';

      if (request.body.direction !== expectedDirection) {
        return sendApiError(
          reply,
          400,
          'INVALID_DIRECTION',
          '该资金类型的收支方向不正确',
        );
      }

      const amountMinor = BigInt(request.body.amountMinor);
      const isBaseCurrency = request.body.currency === settings.baseCurrency;
      const exchangeRate = request.body.exchangeRate ?? (isBaseCurrency ? '1' : null);
      if (!exchangeRate) {
        return sendApiError(
          reply,
          422,
          'EXCHANGE_RATE_REQUIRED',
          '外币资金事件需要填写锁定汇率',
        );
      }
      const exchangeRateDate = request.body.exchangeRateDate ?? request.body.occurredOn;
      if (exchangeRateDate > request.body.occurredOn) {
        return sendApiError(
          reply,
          400,
          'INVALID_EXCHANGE_RATE_DATE',
          '汇率参考日期不能晚于资金日期',
        );
      }
      const baseAmountMinor = isBaseCurrency
        ? amountMinor
        : convertMinorAmount(amountMinor, exchangeRate);
      await options.db.insert(financialEvents).values({
        assetId: asset.id,
        type: request.body.type,
        direction: request.body.direction,
        amountMinor,
        currency: request.body.currency,
        baseAmountMinor,
        baseCurrency: settings.baseCurrency,
        exchangeRate,
        exchangeRateSource:
          request.body.exchangeRateSource ?? (isBaseCurrency ? 'manual' : 'manual'),
        exchangeRateDate,
        exchangeRateFallback: request.body.exchangeRateFallback ?? false,
        occurredOn: request.body.occurredOn,
        includeInNetCost: request.body.includeInNetCost,
        note: request.body.note,
      });
      await options.db
        .update(assets)
        .set({ updatedAt: new Date() })
        .where(eq(assets.id, asset.id));

      const updated = await getAssetDetail(options.db, asset.id);

      if (!updated) {
        throw new Error('Updated asset could not be loaded.');
      }

      return reply.code(201).send(updated);
    },
  );

  typedApp.delete(
    '/api/v1/assets/:id',
    {
      schema: { params: assetParamsSchema },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }

      const deletedAt = new Date();
      const purgeAfter = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1_000);
      const [deleted] = await options.db
        .update(assets)
        .set({ deletedAt, purgeAfter, updatedAt: deletedAt })
        .where(and(eq(assets.id, request.params.id), isNull(assets.deletedAt)))
        .returning({ id: assets.id });

      if (!deleted) {
        return sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
      }

      return reply.code(204).send();
    },
  );
}

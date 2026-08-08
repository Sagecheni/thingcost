import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { RuntimeConfig } from '@thingcost/config';
import {
  createWishlistItemSchema,
  createWishlistLinkSchema,
  createWishlistPriceSnapshotSchema,
  updateWishlistItemSchema,
  uuidSchema,
  wishlistConversionResultSchema,
  wishlistImageSchema,
  wishlistItemDetailSchema,
  wishlistItemListSchema,
  wishlistLinkSchema,
  wishlistListQuerySchema,
  wishlistPriceSnapshotSchema,
  convertWishlistItemSchema,
} from '@thingcost/contracts';
import {
  appSettings,
  assets,
  assetStatuses,
  assetTags,
  categories,
  financialEvents,
  lifecycleEvents,
  tags,
  wishlistImages,
  wishlistItems,
  wishlistMarketplaceLinks,
  wishlistPriceSnapshots,
  type Database,
} from '@thingcost/database';

import { currentDateInTimeZone } from '../lib/dates.js';
import { convertMinorAmount } from '../services/exchange-rates.js';
import { requireAuth, sendApiError } from '../lib/http.js';
import {
  AttachmentStorage,
  AttachmentStorageError,
} from '../services/attachment-storage.js';
import {
  getWishlistItem,
  listWishlistItems,
  mapWishlistImage,
} from '../services/wishlists.js';

const itemParamsSchema = z.object({ id: uuidSchema });
const linkParamsSchema = z.object({ id: uuidSchema, linkId: uuidSchema });

interface WishlistRouteOptions {
  db: Database;
  config: RuntimeConfig;
  storage?: AttachmentStorage;
}

async function getSettings(db: Database) {
  const [settings] = await db
    .select({ timeZone: appSettings.timeZone, baseCurrency: appSettings.baseCurrency })
    .from(appSettings)
    .limit(1);
  if (!settings) throw new Error('Chronicle has not been initialized.');
  return settings;
}

async function activeCategoryExists(db: Database, categoryId: string): Promise<boolean> {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)))
    .limit(1);
  return Boolean(category);
}

async function findWishlistImage(db: Database, itemId: string) {
  const [image] = await db
    .select({ image: wishlistImages })
    .from(wishlistImages)
    .innerJoin(wishlistItems, eq(wishlistImages.wishlistItemId, wishlistItems.id))
    .where(eq(wishlistImages.wishlistItemId, itemId))
    .limit(1);
  return image?.image ?? null;
}

async function sendStorageError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AttachmentStorageError) {
    const status = error.code === 'FILE_TOO_LARGE' ? 413 : 415;
    return sendApiError(reply, status, error.code, error.message);
  }
  if (
    error instanceof Error &&
    'code' in error &&
    error.code === 'FST_REQ_FILE_TOO_LARGE'
  ) {
    return sendApiError(reply, 413, 'FILE_TOO_LARGE', '上传文件超过大小限制');
  }
  request.log.error(error, 'Wishlist image storage operation failed');
  return sendApiError(reply, 500, 'WISHLIST_IMAGE_STORAGE_FAILED', '种草图片存储失败');
}

export async function registerWishlistRoutes(
  app: FastifyInstance,
  options: WishlistRouteOptions,
): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const storage =
    options.storage ??
    new AttachmentStorage(
      options.config.ATTACHMENTS_DIR,
      options.config.ATTACHMENT_MAX_BYTES,
    );
  await storage.initialize();

  typedApp.get(
    '/api/v1/wishlist',
    {
      schema: {
        querystring: wishlistListQuerySchema,
        response: { 200: wishlistItemListSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['wishlist:read'] })))
        return reply;
      return listWishlistItems(options.db, request.query);
    },
  );

  typedApp.get(
    '/api/v1/wishlist/:id',
    { schema: { params: itemParamsSchema, response: { 200: wishlistItemDetailSchema } } },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['wishlist:read'] })))
        return reply;
      const item = await getWishlistItem(options.db, request.params.id);
      return (
        item ??
        sendApiError(reply, 404, 'WISHLIST_ITEM_NOT_FOUND', '没有找到这条种草记录')
      );
    },
  );

  typedApp.post(
    '/api/v1/wishlist',
    {
      schema: {
        body: createWishlistItemSchema,
        response: { 201: wishlistItemDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['wishlist:write'] }))
      )
        return reply;
      if (!(await activeCategoryExists(options.db, request.body.categoryId))) {
        return sendApiError(reply, 400, 'INVALID_CATEGORY', '所选分类不存在');
      }
      if (request.body.currentPriceObservedOn && !request.body.currentPriceMinor) {
        return sendApiError(
          reply,
          400,
          'CURRENT_PRICE_REQUIRED',
          '填写价格日期前需要填写当前价格',
        );
      }
      const settings = await getSettings(options.db);
      const observedOn = request.body.currentPriceMinor
        ? (request.body.currentPriceObservedOn ??
          currentDateInTimeZone(settings.timeZone))
        : null;
      const itemId = await options.db.transaction(async (transaction) => {
        const [created] = await transaction
          .insert(wishlistItems)
          .values({
            name: request.body.name,
            description: request.body.description,
            categoryId: request.body.categoryId,
            currency: request.body.currency,
            currentPriceMinor: request.body.currentPriceMinor
              ? BigInt(request.body.currentPriceMinor)
              : null,
            currentPriceObservedOn: observedOn,
            targetPriceMinor: request.body.targetPriceMinor
              ? BigInt(request.body.targetPriceMinor)
              : null,
            budgetMinor: request.body.budgetMinor
              ? BigInt(request.body.budgetMinor)
              : null,
            priority: request.body.priority,
            plannedPurchaseDate: request.body.plannedPurchaseDate,
          })
          .returning({ id: wishlistItems.id });
        if (!created) throw new Error('Unable to create wishlist item.');
        let createdLinks: Array<{ id: string; sortOrder: number }> = [];
        if (request.body.links.length > 0) {
          createdLinks = await transaction
            .insert(wishlistMarketplaceLinks)
            .values(
              request.body.links.map((link, index) => ({
                wishlistItemId: created.id,
                marketplace: link.marketplace,
                url: link.url,
                note: link.note,
                sortOrder: index,
              })),
            )
            .returning({
              id: wishlistMarketplaceLinks.id,
              sortOrder: wishlistMarketplaceLinks.sortOrder,
            });
        }
        if (request.body.currentPriceMinor && observedOn) {
          await transaction.insert(wishlistPriceSnapshots).values({
            wishlistItemId: created.id,
            amountMinor: BigInt(request.body.currentPriceMinor),
            currency: request.body.currency,
            observedOn,
            marketplaceLinkId: createdLinks.at(0)?.id,
            note: '建立种草记录时的手工价格',
          });
        }
        return created.id;
      });
      const item = await getWishlistItem(options.db, itemId);
      if (!item) throw new Error('Created wishlist item could not be loaded.');
      return reply.code(201).send(item);
    },
  );

  typedApp.patch(
    '/api/v1/wishlist/:id',
    {
      schema: {
        params: itemParamsSchema,
        body: updateWishlistItemSchema,
        response: { 200: wishlistItemDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['wishlist:write'] }))
      )
        return reply;
      const existing = await getWishlistItem(options.db, request.params.id);
      if (!existing)
        return sendApiError(
          reply,
          404,
          'WISHLIST_ITEM_NOT_FOUND',
          '没有找到这条种草记录',
        );
      if (existing.status === 'converted') {
        return sendApiError(
          reply,
          409,
          'WISHLIST_ALREADY_CONVERTED',
          '已转为物品的种草记录不能再修改',
        );
      }
      if (
        request.body.categoryId &&
        !(await activeCategoryExists(options.db, request.body.categoryId))
      ) {
        return sendApiError(reply, 400, 'INVALID_CATEGORY', '所选分类不存在');
      }
      await options.db
        .update(wishlistItems)
        .set({
          ...(request.body.name !== undefined ? { name: request.body.name } : {}),
          ...(request.body.categoryId !== undefined
            ? { categoryId: request.body.categoryId }
            : {}),
          ...(request.body.description !== undefined
            ? { description: request.body.description }
            : {}),
          ...(request.body.targetPriceMinor !== undefined
            ? {
                targetPriceMinor:
                  request.body.targetPriceMinor === null
                    ? null
                    : BigInt(request.body.targetPriceMinor),
              }
            : {}),
          ...(request.body.budgetMinor !== undefined
            ? {
                budgetMinor:
                  request.body.budgetMinor === null
                    ? null
                    : BigInt(request.body.budgetMinor),
              }
            : {}),
          ...(request.body.priority !== undefined
            ? { priority: request.body.priority }
            : {}),
          ...(request.body.plannedPurchaseDate !== undefined
            ? { plannedPurchaseDate: request.body.plannedPurchaseDate }
            : {}),
          ...(request.body.status !== undefined ? { status: request.body.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(wishlistItems.id, request.params.id));
      return (await getWishlistItem(options.db, request.params.id))!;
    },
  );

  typedApp.delete(
    '/api/v1/wishlist/:id',
    { schema: { params: itemParamsSchema, response: { 200: wishlistItemDetailSchema } } },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['wishlist:write'] }))
      )
        return reply;
      const existing = await getWishlistItem(options.db, request.params.id);
      if (!existing)
        return sendApiError(
          reply,
          404,
          'WISHLIST_ITEM_NOT_FOUND',
          '没有找到这条种草记录',
        );
      if (existing.status === 'converted') {
        return sendApiError(
          reply,
          409,
          'WISHLIST_ALREADY_CONVERTED',
          '已转为物品的种草记录不能归档',
        );
      }
      await options.db
        .update(wishlistItems)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(wishlistItems.id, request.params.id));
      return (await getWishlistItem(options.db, request.params.id))!;
    },
  );

  typedApp.post(
    '/api/v1/wishlist/:id/links',
    {
      schema: {
        params: itemParamsSchema,
        body: createWishlistLinkSchema,
        response: { 201: wishlistLinkSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['wishlist:write'] }))
      )
        return reply;
      const existing = await getWishlistItem(options.db, request.params.id);
      if (!existing)
        return sendApiError(
          reply,
          404,
          'WISHLIST_ITEM_NOT_FOUND',
          '没有找到这条种草记录',
        );
      if (existing.status === 'converted')
        return sendApiError(
          reply,
          409,
          'WISHLIST_ALREADY_CONVERTED',
          '已转为物品的记录不能新增链接',
        );
      if (existing.links.length >= 20)
        return sendApiError(
          reply,
          409,
          'WISHLIST_LINK_LIMIT',
          '每条种草记录最多保存 20 个链接',
        );
      const [last] = await options.db
        .select({ sortOrder: wishlistMarketplaceLinks.sortOrder })
        .from(wishlistMarketplaceLinks)
        .where(eq(wishlistMarketplaceLinks.wishlistItemId, request.params.id))
        .orderBy(desc(wishlistMarketplaceLinks.sortOrder))
        .limit(1);
      const [created] = await options.db
        .insert(wishlistMarketplaceLinks)
        .values({
          wishlistItemId: request.params.id,
          marketplace: request.body.marketplace,
          url: request.body.url,
          note: request.body.note,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        })
        .returning();
      if (!created) throw new Error('Unable to create wishlist link.');
      await options.db
        .update(wishlistItems)
        .set({ updatedAt: new Date() })
        .where(eq(wishlistItems.id, request.params.id));
      return reply.code(201).send({
        id: created.id,
        marketplace: created.marketplace,
        url: created.url,
        note: created.note,
        sortOrder: created.sortOrder,
        createdAt: created.createdAt.toISOString(),
      });
    },
  );

  typedApp.delete(
    '/api/v1/wishlist/:id/links/:linkId',
    { schema: { params: linkParamsSchema, response: { 200: wishlistItemDetailSchema } } },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['wishlist:write'] }))
      )
        return reply;
      const [deleted] = await options.db
        .delete(wishlistMarketplaceLinks)
        .where(
          and(
            eq(wishlistMarketplaceLinks.id, request.params.linkId),
            eq(wishlistMarketplaceLinks.wishlistItemId, request.params.id),
          ),
        )
        .returning({ id: wishlistMarketplaceLinks.id });
      if (!deleted)
        return sendApiError(reply, 404, 'WISHLIST_LINK_NOT_FOUND', '没有找到该平台链接');
      await options.db
        .update(wishlistItems)
        .set({ updatedAt: new Date() })
        .where(eq(wishlistItems.id, request.params.id));
      return (await getWishlistItem(options.db, request.params.id))!;
    },
  );

  typedApp.post(
    '/api/v1/wishlist/:id/prices',
    {
      schema: {
        params: itemParamsSchema,
        body: createWishlistPriceSnapshotSchema,
        response: { 201: wishlistPriceSnapshotSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, {
          scopes: ['wishlist:write'],
        }))
      )
        return reply;
      const existing = await getWishlistItem(options.db, request.params.id);
      if (!existing)
        return sendApiError(
          reply,
          404,
          'WISHLIST_ITEM_NOT_FOUND',
          '没有找到这条种草记录',
        );
      if (existing.status === 'converted')
        return sendApiError(
          reply,
          409,
          'WISHLIST_ALREADY_CONVERTED',
          '已转为物品的记录不能继续记价',
        );
      if (
        request.body.marketplaceLinkId &&
        !existing.links.some((link) => link.id === request.body.marketplaceLinkId)
      ) {
        return sendApiError(
          reply,
          400,
          'INVALID_WISHLIST_LINK',
          '价格来源链接不属于这条记录',
        );
      }
      const [created] = await options.db.transaction(async (transaction) => {
        const rows = await transaction
          .insert(wishlistPriceSnapshots)
          .values({
            wishlistItemId: existing.id,
            amountMinor: BigInt(request.body.amountMinor),
            currency: existing.currency,
            observedOn: request.body.observedOn,
            marketplaceLinkId: request.body.marketplaceLinkId,
            note: request.body.note,
          })
          .returning();
        await transaction
          .update(wishlistItems)
          .set({
            currentPriceMinor: BigInt(request.body.amountMinor),
            currentPriceObservedOn: request.body.observedOn,
            updatedAt: new Date(),
          })
          .where(eq(wishlistItems.id, existing.id));
        return rows;
      });
      if (!created) throw new Error('Unable to create price snapshot.');
      const marketplace =
        existing.links.find((link) => link.id === created.marketplaceLinkId)
          ?.marketplace ?? null;
      return reply.code(201).send({
        id: created.id,
        amountMinor: created.amountMinor.toString(),
        currency: created.currency,
        observedOn: created.observedOn,
        marketplaceLinkId: created.marketplaceLinkId,
        marketplace,
        note: created.note,
        createdAt: created.createdAt.toISOString(),
      });
    },
  );

  typedApp.post(
    '/api/v1/wishlist/:id/image',
    { schema: { params: itemParamsSchema, response: { 201: wishlistImageSchema } } },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['wishlist:write'] }))
      )
        return reply;
      const item = await getWishlistItem(options.db, request.params.id);
      if (!item)
        return sendApiError(
          reply,
          404,
          'WISHLIST_ITEM_NOT_FOUND',
          '没有找到这条种草记录',
        );
      if (item.status === 'converted')
        return sendApiError(
          reply,
          409,
          'WISHLIST_ALREADY_CONVERTED',
          '已转为物品的记录不能替换图片',
        );
      if (!request.isMultipart())
        return sendApiError(
          reply,
          415,
          'MULTIPART_REQUIRED',
          '请使用 multipart/form-data 上传',
        );
      let uploaded: Awaited<ReturnType<AttachmentStorage['store']>>;
      try {
        const part = await request.file({
          limits: { files: 1, fileSize: options.config.ATTACHMENT_MAX_BYTES },
        });
        if (!part || part.fieldname !== 'file')
          return sendApiError(reply, 400, 'FILE_REQUIRED', '请选择要上传的图片');
        uploaded = await storage.store(part.file, part.filename);
      } catch (error) {
        return sendStorageError(error, request, reply);
      }
      if (
        uploaded.kind !== 'photo' ||
        !uploaded.thumbnailStorageKey ||
        !uploaded.width ||
        !uploaded.height
      ) {
        await storage.remove([uploaded.storageKey, uploaded.thumbnailStorageKey]);
        return sendApiError(reply, 415, 'IMAGE_REQUIRED', '种草封面必须是图片');
      }
      const previous = await findWishlistImage(options.db, item.id);
      try {
        const [saved] = await options.db
          .insert(wishlistImages)
          .values({
            wishlistItemId: item.id,
            storageKey: uploaded.storageKey,
            thumbnailStorageKey: uploaded.thumbnailStorageKey,
            originalName: uploaded.originalName,
            mediaType: uploaded.mediaType,
            sizeBytes: uploaded.sizeBytes,
            sha256: uploaded.sha256,
            width: uploaded.width,
            height: uploaded.height,
          })
          .onConflictDoUpdate({
            target: wishlistImages.wishlistItemId,
            set: {
              storageKey: uploaded.storageKey,
              thumbnailStorageKey: uploaded.thumbnailStorageKey,
              originalName: uploaded.originalName,
              mediaType: uploaded.mediaType,
              sizeBytes: uploaded.sizeBytes,
              sha256: uploaded.sha256,
              width: uploaded.width,
              height: uploaded.height,
              createdAt: new Date(),
            },
          })
          .returning();
        if (!saved) throw new Error('Unable to save wishlist image.');
        if (previous)
          await storage.remove([previous.storageKey, previous.thumbnailStorageKey]);
        await options.db
          .update(wishlistItems)
          .set({ updatedAt: new Date() })
          .where(eq(wishlistItems.id, item.id));
        return reply.code(201).send(mapWishlistImage(saved));
      } catch (error) {
        await storage.remove([uploaded.storageKey, uploaded.thumbnailStorageKey]);
        throw error;
      }
    },
  );

  for (const variant of ['content', 'thumbnail'] as const) {
    typedApp.get(
      `/api/v1/wishlist/:id/image/${variant}`,
      { schema: { params: itemParamsSchema } },
      async (request, reply) => {
        if (
          !(await requireAuth(options.db, request, reply, { scopes: ['wishlist:read'] }))
        )
          return reply;
        const image = await findWishlistImage(options.db, request.params.id);
        if (!image)
          return sendApiError(reply, 404, 'WISHLIST_IMAGE_NOT_FOUND', '没有找到种草图片');
        const storageKey =
          variant === 'thumbnail' ? image.thumbnailStorageKey : image.storageKey;
        try {
          const size = await storage.fileSize(storageKey);
          reply.header(
            'Content-Type',
            variant === 'thumbnail' ? 'image/webp' : image.mediaType,
          );
          reply.header('Content-Length', String(size));
          reply.header('Cache-Control', 'private, no-store');
          return reply.send(storage.openReadStream(storageKey));
        } catch (error) {
          request.log.error(error, 'Wishlist image read failed');
          return sendApiError(
            reply,
            500,
            'WISHLIST_IMAGE_READ_FAILED',
            '种草图片读取失败',
          );
        }
      },
    );
  }

  typedApp.delete(
    '/api/v1/wishlist/:id/image',
    {
      schema: {
        params: itemParamsSchema,
        response: { 200: z.object({ deleted: z.literal(true) }) },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['wishlist:write'] }))
      )
        return reply;
      const image = await findWishlistImage(options.db, request.params.id);
      if (!image)
        return sendApiError(reply, 404, 'WISHLIST_IMAGE_NOT_FOUND', '没有找到种草图片');
      await options.db.delete(wishlistImages).where(eq(wishlistImages.id, image.id));
      await storage.remove([image.storageKey, image.thumbnailStorageKey]);
      return { deleted: true as const };
    },
  );

  typedApp.post(
    '/api/v1/wishlist/:id/convert',
    {
      schema: {
        params: itemParamsSchema,
        body: convertWishlistItemSchema,
        response: { 201: wishlistConversionResultSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['wishlist:write'] }))
      )
        return reply;
      const item = await getWishlistItem(options.db, request.params.id);
      if (!item)
        return sendApiError(
          reply,
          404,
          'WISHLIST_ITEM_NOT_FOUND',
          '没有找到这条种草记录',
        );
      if (item.status === 'converted')
        return sendApiError(
          reply,
          409,
          'WISHLIST_ALREADY_CONVERTED',
          '这条种草记录已经转为物品',
        );
      if (item.status !== 'active')
        return sendApiError(
          reply,
          409,
          'WISHLIST_NOT_ACTIVE',
          '只有进行中的种草记录可以转为物品',
        );
      const settings = await getSettings(options.db);
      const today = currentDateInTimeZone(settings.timeZone);
      if (request.body.acquisitionDate > today)
        return sendApiError(
          reply,
          400,
          'FUTURE_ACQUISITION_DATE',
          '取得日期不能晚于今天',
        );
      const isBaseCurrency = item.currency === settings.baseCurrency;
      const exchangeRate = request.body.exchangeRate ?? (isBaseCurrency ? '1' : null);
      if (request.body.costKnowledge === 'known_amount' && !exchangeRate) {
        return sendApiError(
          reply,
          422,
          'EXCHANGE_RATE_REQUIRED',
          '外币实付需要填写锁定汇率',
        );
      }
      const exchangeRateDate =
        request.body.exchangeRateDate ?? request.body.acquisitionDate;
      if (exchangeRateDate > request.body.acquisitionDate) {
        return sendApiError(
          reply,
          400,
          'INVALID_EXCHANGE_RATE_DATE',
          '汇率参考日期不能晚于取得日期',
        );
      }
      const [[initialStatus], validTagRows] = await Promise.all([
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
        request.body.tagIds.length === 0
          ? Promise.resolve([])
          : options.db
              .select({ id: tags.id })
              .from(tags)
              .where(and(inArray(tags.id, request.body.tagIds), isNull(tags.deletedAt))),
      ]);
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
      if (validTagRows.length !== new Set(request.body.tagIds).size)
        return sendApiError(reply, 400, 'INVALID_TAG', '一个或多个标签不存在');

      const assetId = await options.db.transaction(async (transaction) => {
        const [locked] = await transaction
          .select({ status: wishlistItems.status })
          .from(wishlistItems)
          .where(eq(wishlistItems.id, item.id))
          .for('update')
          .limit(1);
        if (!locked || locked.status !== 'active') return null;
        const [createdAsset] = await transaction
          .insert(assets)
          .values({
            name: item.name,
            description: item.description,
            categoryId: item.category.id,
            acquisitionType: 'purchase',
            acquisitionDate: request.body.acquisitionDate,
            costKnowledge: request.body.costKnowledge,
            priceCurrency:
              request.body.costKnowledge === 'unknown' ? null : item.currency,
            originalPriceMinor: item.currentPriceMinor
              ? BigInt(item.currentPriceMinor)
              : null,
            currentStatusId: initialStatus.id,
          })
          .returning({ id: assets.id });
        if (!createdAsset) throw new Error('Unable to create asset from wishlist.');
        await transaction.insert(lifecycleEvents).values({
          assetId: createdAsset.id,
          statusId: initialStatus.id,
          effectiveDate: request.body.acquisitionDate,
          note: request.body.note ?? '由种草清单转入',
        });
        if (request.body.tagIds.length > 0)
          await transaction
            .insert(assetTags)
            .values(
              request.body.tagIds.map((tagId) => ({ assetId: createdAsset.id, tagId })),
            );
        if (
          request.body.costKnowledge === 'known_amount' &&
          request.body.paidPriceMinor
        ) {
          const amountMinor = BigInt(request.body.paidPriceMinor);
          await transaction.insert(financialEvents).values({
            assetId: createdAsset.id,
            type: 'acquisition',
            direction: 'outflow',
            amountMinor,
            currency: item.currency,
            baseAmountMinor: isBaseCurrency
              ? amountMinor
              : convertMinorAmount(amountMinor, exchangeRate!),
            baseCurrency: settings.baseCurrency,
            exchangeRate: exchangeRate!,
            exchangeRateSource:
              request.body.exchangeRateSource ?? (isBaseCurrency ? 'manual' : 'manual'),
            exchangeRateDate,
            exchangeRateFallback: request.body.exchangeRateFallback ?? false,
            occurredOn: request.body.acquisitionDate,
            includeInNetCost: true,
            note: '由种草清单转入的取得成本',
          });
        }
        await transaction
          .update(wishlistItems)
          .set({
            status: 'converted',
            convertedAssetId: createdAsset.id,
            convertedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(wishlistItems.id, item.id));
        return createdAsset.id;
      });
      if (!assetId)
        return sendApiError(
          reply,
          409,
          'WISHLIST_ALREADY_CONVERTED',
          '这条种草记录已被转为物品',
        );
      const converted = await getWishlistItem(options.db, item.id);
      if (!converted) throw new Error('Converted wishlist item could not be loaded.');
      return reply.code(201).send({ wishlistItem: converted, assetId });
    },
  );
}

import { randomUUID } from 'node:crypto';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  assetStatusSchema,
  categorySchema,
  createAssetStatusSchema,
  createCategorySchema,
  createTagSchema,
  tagSchema,
  updateAssetStatusSchema,
  updateCategorySchema,
  uuidSchema,
} from '@thingcost/contracts';
import {
  assets,
  assetStatuses,
  categories,
  tags,
  type Database,
} from '@thingcost/database';

import { requireAuth, sendApiError } from '../lib/http.js';

interface CatalogRouteOptions {
  db: Database;
}

const idParamsSchema = z.object({ id: uuidSchema });

export function registerCatalogRoutes(
  app: FastifyInstance,
  options: CatalogRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/api/v1/categories',
    {
      schema: { response: { 200: z.array(categorySchema) } },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }

      return options.db
        .select({
          id: categories.id,
          name: categories.name,
          color: categories.color,
          icon: categories.icon,
          isSystem: categories.isSystem,
          sortOrder: categories.sortOrder,
        })
        .from(categories)
        .where(isNull(categories.deletedAt))
        .orderBy(asc(categories.sortOrder), asc(categories.name));
    },
  );

  typedApp.post(
    '/api/v1/categories',
    {
      schema: { body: createCategorySchema, response: { 201: categorySchema } },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }
      const [existing] = await options.db
        .select({ id: categories.id })
        .from(categories)
        .where(
          sql`${categories.deletedAt} is null and lower(${categories.name}) = lower(${request.body.name})`,
        )
        .limit(1);
      if (existing) {
        return sendApiError(reply, 409, 'CATEGORY_ALREADY_EXISTS', '该分类已经存在');
      }
      const [created] = await options.db
        .insert(categories)
        .values({
          name: request.body.name,
          color: request.body.color,
          icon: request.body.icon,
          isSystem: false,
        })
        .returning({
          id: categories.id,
          name: categories.name,
          color: categories.color,
          icon: categories.icon,
          isSystem: categories.isSystem,
          sortOrder: categories.sortOrder,
        });
      if (!created) throw new Error('Unable to create category.');
      return reply.code(201).send(created);
    },
  );

  typedApp.patch(
    '/api/v1/categories/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateCategorySchema,
        response: { 200: categorySchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }
      const [category] = await options.db
        .select({ id: categories.id, isSystem: categories.isSystem })
        .from(categories)
        .where(and(eq(categories.id, request.params.id), isNull(categories.deletedAt)))
        .limit(1);
      if (!category) {
        return sendApiError(reply, 404, 'CATEGORY_NOT_FOUND', '没有找到该分类');
      }
      if (category.isSystem) {
        return sendApiError(reply, 409, 'SYSTEM_CATEGORY_IMMUTABLE', '系统分类不能修改');
      }
      if (request.body.name) {
        const [duplicate] = await options.db
          .select({ id: categories.id })
          .from(categories)
          .where(
            sql`${categories.deletedAt} is null and ${categories.id} <> ${category.id} and lower(${categories.name}) = lower(${request.body.name})`,
          )
          .limit(1);
        if (duplicate) {
          return sendApiError(reply, 409, 'CATEGORY_ALREADY_EXISTS', '该分类已经存在');
        }
      }
      const [updated] = await options.db
        .update(categories)
        .set({ ...request.body, updatedAt: new Date() })
        .where(eq(categories.id, category.id))
        .returning({
          id: categories.id,
          name: categories.name,
          color: categories.color,
          icon: categories.icon,
          isSystem: categories.isSystem,
          sortOrder: categories.sortOrder,
        });
      if (!updated) throw new Error('Unable to update category.');
      return updated;
    },
  );

  typedApp.delete(
    '/api/v1/categories/:id',
    { schema: { params: idParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }
      const [category] = await options.db
        .select({ id: categories.id, isSystem: categories.isSystem })
        .from(categories)
        .where(and(eq(categories.id, request.params.id), isNull(categories.deletedAt)))
        .limit(1);
      if (!category) {
        return sendApiError(reply, 404, 'CATEGORY_NOT_FOUND', '没有找到该分类');
      }
      if (category.isSystem) {
        return sendApiError(reply, 409, 'SYSTEM_CATEGORY_IMMUTABLE', '系统分类不能删除');
      }
      const [used] = await options.db
        .select({ id: assets.id })
        .from(assets)
        .where(eq(assets.categoryId, category.id))
        .limit(1);
      if (used) {
        return sendApiError(reply, 409, 'CATEGORY_IN_USE', '仍有物品使用该分类');
      }
      await options.db
        .update(categories)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(categories.id, category.id));
      return reply.code(204).send(null);
    },
  );

  typedApp.get(
    '/api/v1/tags',
    {
      schema: { response: { 200: z.array(tagSchema) } },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }

      return options.db
        .select({ id: tags.id, name: tags.name, color: tags.color })
        .from(tags)
        .where(isNull(tags.deletedAt))
        .orderBy(asc(tags.name));
    },
  );

  typedApp.post(
    '/api/v1/tags',
    {
      schema: {
        body: createTagSchema,
        response: { 201: tagSchema },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] }))
      ) {
        return reply;
      }

      const [existing] = await options.db
        .select({ id: tags.id })
        .from(tags)
        .where(
          sql`${tags.deletedAt} is null and lower(${tags.name}) = lower(${request.body.name})`,
        )
        .limit(1);

      if (existing) {
        return sendApiError(reply, 409, 'TAG_ALREADY_EXISTS', '该标签已经存在');
      }

      const [created] = await options.db
        .insert(tags)
        .values({ name: request.body.name, color: request.body.color })
        .returning({ id: tags.id, name: tags.name, color: tags.color });

      if (!created) {
        throw new Error('Unable to create a tag.');
      }

      return reply.code(201).send(created);
    },
  );

  typedApp.post(
    '/api/v1/asset-statuses',
    {
      schema: { body: createAssetStatusSchema, response: { 201: assetStatusSchema } },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }
      const [created] = await options.db
        .insert(assetStatuses)
        .values({
          code: `custom_${randomUUID().replaceAll('-', '')}`,
          name: request.body.name,
          countsTowardService: request.body.countsTowardService,
          ownershipState: request.body.ownershipState,
          isSystem: false,
        })
        .returning({
          id: assetStatuses.id,
          code: assetStatuses.code,
          name: assetStatuses.name,
          countsTowardService: assetStatuses.countsTowardService,
          ownershipState: assetStatuses.ownershipState,
          isSystem: assetStatuses.isSystem,
          sortOrder: assetStatuses.sortOrder,
        });
      if (!created) throw new Error('Unable to create asset status.');
      return reply.code(201).send(created);
    },
  );

  typedApp.patch(
    '/api/v1/asset-statuses/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateAssetStatusSchema,
        response: { 200: assetStatusSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }
      const [status] = await options.db
        .select({ id: assetStatuses.id, isSystem: assetStatuses.isSystem })
        .from(assetStatuses)
        .where(
          and(eq(assetStatuses.id, request.params.id), isNull(assetStatuses.deletedAt)),
        )
        .limit(1);
      if (!status) {
        return sendApiError(reply, 404, 'STATUS_NOT_FOUND', '没有找到该状态');
      }
      if (status.isSystem) {
        return sendApiError(reply, 409, 'SYSTEM_STATUS_IMMUTABLE', '系统状态不能修改');
      }
      const [updated] = await options.db
        .update(assetStatuses)
        .set({ ...request.body, updatedAt: new Date() })
        .where(eq(assetStatuses.id, status.id))
        .returning({
          id: assetStatuses.id,
          code: assetStatuses.code,
          name: assetStatuses.name,
          countsTowardService: assetStatuses.countsTowardService,
          ownershipState: assetStatuses.ownershipState,
          isSystem: assetStatuses.isSystem,
          sortOrder: assetStatuses.sortOrder,
        });
      if (!updated) throw new Error('Unable to update status.');
      return updated;
    },
  );

  typedApp.delete(
    '/api/v1/asset-statuses/:id',
    { schema: { params: idParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }
      const [status] = await options.db
        .select({ id: assetStatuses.id, isSystem: assetStatuses.isSystem })
        .from(assetStatuses)
        .where(
          and(eq(assetStatuses.id, request.params.id), isNull(assetStatuses.deletedAt)),
        )
        .limit(1);
      if (!status) {
        return sendApiError(reply, 404, 'STATUS_NOT_FOUND', '没有找到该状态');
      }
      if (status.isSystem) {
        return sendApiError(reply, 409, 'SYSTEM_STATUS_IMMUTABLE', '系统状态不能删除');
      }
      const [used] = await options.db
        .select({ id: assets.id })
        .from(assets)
        .where(eq(assets.currentStatusId, status.id))
        .limit(1);
      if (used) {
        return sendApiError(reply, 409, 'STATUS_IN_USE', '仍有物品处于该状态');
      }
      await options.db
        .update(assetStatuses)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(assetStatuses.id, status.id));
      return reply.code(204).send(null);
    },
  );

  typedApp.get(
    '/api/v1/asset-statuses',
    {
      schema: { response: { 200: z.array(assetStatusSchema) } },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:read'] }))) {
        return reply;
      }

      return options.db
        .select({
          id: assetStatuses.id,
          code: assetStatuses.code,
          name: assetStatuses.name,
          countsTowardService: assetStatuses.countsTowardService,
          ownershipState: assetStatuses.ownershipState,
          isSystem: assetStatuses.isSystem,
          sortOrder: assetStatuses.sortOrder,
        })
        .from(assetStatuses)
        .where(isNull(assetStatuses.deletedAt))
        .orderBy(asc(assetStatuses.sortOrder));
    },
  );
}

import { and, eq, isNull, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  assetRelationshipSchema,
  createAssetRelationshipSchema,
  uuidSchema,
} from '@thingcost/contracts';
import { assetRelationships, assets, type Database } from '@thingcost/database';

import { requireAuth, sendApiError } from '../lib/http.js';
import { getAssetDetail } from '../services/assets.js';

interface AssetRelationshipRouteOptions {
  db: Database;
}

const assetParamsSchema = z.object({ id: uuidSchema });
const relationshipParamsSchema = z.object({ id: uuidSchema, relationshipId: uuidSchema });

export function registerAssetRelationshipRoutes(
  app: FastifyInstance,
  options: AssetRelationshipRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/api/v1/assets/:id/relationships',
    {
      schema: {
        params: assetParamsSchema,
        body: createAssetRelationshipSchema,
        response: { 201: assetRelationshipSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] })))
        return reply;
      if (request.params.id === request.body.relatedAssetId) {
        return sendApiError(reply, 400, 'SELF_RELATIONSHIP', '物品不能关联自身');
      }

      const activeAssets = await options.db
        .select({ id: assets.id })
        .from(assets)
        .where(
          and(
            or(
              eq(assets.id, request.params.id),
              eq(assets.id, request.body.relatedAssetId),
            ),
            isNull(assets.deletedAt),
          ),
        );
      if (activeAssets.length !== 2) {
        return sendApiError(reply, 404, 'ASSET_NOT_FOUND', '一个或多个物品不存在');
      }

      let sourceAssetId = request.params.id;
      let targetAssetId = request.body.relatedAssetId;
      if (request.body.type === 'paired_with' && sourceAssetId > targetAssetId) {
        [sourceAssetId, targetAssetId] = [targetAssetId, sourceAssetId];
      }

      if (request.body.type === 'belongs_to') {
        const belongsRows = await options.db
          .select({
            sourceAssetId: assetRelationships.sourceAssetId,
            targetAssetId: assetRelationships.targetAssetId,
          })
          .from(assetRelationships)
          .where(eq(assetRelationships.type, 'belongs_to'));
        if (
          belongsRows.some((relationship) => relationship.sourceAssetId === sourceAssetId)
        ) {
          return sendApiError(
            reply,
            409,
            'ACCESSORY_ALREADY_ASSIGNED',
            '该配件已经属于另一件物品',
          );
        }

        const parentByAsset = new Map(
          belongsRows.map((relationship) => [
            relationship.sourceAssetId,
            relationship.targetAssetId,
          ]),
        );
        let cursor: string | undefined = targetAssetId;
        while (cursor) {
          if (cursor === sourceAssetId) {
            return sendApiError(reply, 409, 'RELATIONSHIP_CYCLE', '属于关系不能形成循环');
          }
          cursor = parentByAsset.get(cursor);
        }
      }

      const [duplicate] = await options.db
        .select({ id: assetRelationships.id })
        .from(assetRelationships)
        .where(
          and(
            eq(assetRelationships.sourceAssetId, sourceAssetId),
            eq(assetRelationships.targetAssetId, targetAssetId),
            eq(assetRelationships.type, request.body.type),
          ),
        )
        .limit(1);
      if (duplicate) {
        return sendApiError(reply, 409, 'RELATIONSHIP_EXISTS', '该物品关系已经存在');
      }

      const [created] = await options.db
        .insert(assetRelationships)
        .values({
          sourceAssetId,
          targetAssetId,
          type: request.body.type,
          note: request.body.note || null,
        })
        .returning({ id: assetRelationships.id });
      if (!created) throw new Error('Unable to create asset relationship.');

      const detail = await getAssetDetail(options.db, request.params.id);
      const relationship = detail?.relationships.find((item) => item.id === created.id);
      if (!relationship) throw new Error('Created relationship could not be loaded.');
      return reply.code(201).send(relationship);
    },
  );

  typedApp.delete(
    '/api/v1/assets/:id/relationships/:relationshipId',
    { schema: { params: relationshipParamsSchema } },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { scopes: ['assets:write'] })))
        return reply;

      const [deleted] = await options.db
        .delete(assetRelationships)
        .where(
          and(
            eq(assetRelationships.id, request.params.relationshipId),
            or(
              eq(assetRelationships.sourceAssetId, request.params.id),
              eq(assetRelationships.targetAssetId, request.params.id),
            ),
          ),
        )
        .returning({ id: assetRelationships.id });
      if (!deleted) {
        return sendApiError(reply, 404, 'RELATIONSHIP_NOT_FOUND', '没有找到该物品关系');
      }
      return reply.code(204).send();
    },
  );
}

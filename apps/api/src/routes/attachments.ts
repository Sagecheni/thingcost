import { randomUUID } from 'node:crypto';

import { and, asc, count, desc, eq, isNull, ne } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { RuntimeConfig } from '@thingcost/config';
import {
  assetAttachmentSchema,
  updateAssetAttachmentSchema,
  uuidSchema,
} from '@thingcost/contracts';
import { assetAttachments, assets, type Database } from '@thingcost/database';

import { requireAuth, sendApiError } from '../lib/http.js';
import {
  AttachmentStorage,
  AttachmentStorageError,
} from '../services/attachment-storage.js';
import { mapAssetAttachment } from '../services/attachments.js';

const assetParamsSchema = z.object({ id: uuidSchema });
const attachmentParamsSchema = z.object({ id: uuidSchema, attachmentId: uuidSchema });

interface AttachmentRouteOptions {
  db: Database;
  config: RuntimeConfig;
  storage?: AttachmentStorage;
}

function safeContentDisposition(originalName: string, inline: boolean): string {
  const asciiName = originalName
    .replace(/[\r\n"]/gu, '')
    .replace(/[^\x20-\x7e]/gu, '_')
    .slice(0, 180);
  const encodedName = encodeURIComponent(originalName).replace(
    /['()*]/gu,
    (character) => `%${character.codePointAt(0)?.toString(16).toUpperCase() ?? ''}`,
  );
  return `${inline ? 'inline' : 'attachment'}; filename="${asciiName || 'attachment'}"; filename*=UTF-8''${encodedName}`;
}

async function activeAssetExists(db: Database, assetId: string): Promise<boolean> {
  const [asset] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.id, assetId), isNull(assets.deletedAt)))
    .limit(1);
  return Boolean(asset);
}

async function findAttachment(db: Database, assetId: string, attachmentId: string) {
  const [attachment] = await db
    .select({ attachment: assetAttachments })
    .from(assetAttachments)
    .innerJoin(assets, eq(assetAttachments.assetId, assets.id))
    .where(
      and(
        eq(assetAttachments.id, attachmentId),
        eq(assetAttachments.assetId, assetId),
        isNull(assets.deletedAt),
      ),
    )
    .limit(1);
  return attachment?.attachment ?? null;
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

  request.log.error(error, 'Attachment storage operation failed');
  return sendApiError(reply, 500, 'ATTACHMENT_STORAGE_FAILED', '附件存储失败');
}

export async function registerAttachmentRoutes(
  app: FastifyInstance,
  options: AttachmentRouteOptions,
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
    '/api/v1/assets/:id/attachments',
    {
      schema: {
        params: assetParamsSchema,
        response: { 200: assetAttachmentSchema.array() },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['attachments:read'] }))
      ) {
        return reply;
      }

      if (!(await activeAssetExists(options.db, request.params.id))) {
        return sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
      }

      const rows = await options.db
        .select()
        .from(assetAttachments)
        .where(eq(assetAttachments.assetId, request.params.id))
        .orderBy(
          desc(assetAttachments.isCover),
          asc(assetAttachments.sortOrder),
          asc(assetAttachments.createdAt),
        );
      return rows.map(mapAssetAttachment);
    },
  );

  typedApp.post(
    '/api/v1/assets/:id/attachments',
    {
      schema: {
        params: assetParamsSchema,
        response: { 201: assetAttachmentSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }

      if (!(await activeAssetExists(options.db, request.params.id))) {
        return sendApiError(reply, 404, 'ASSET_NOT_FOUND', '没有找到该物品');
      }

      if (!request.isMultipart()) {
        return sendApiError(
          reply,
          415,
          'MULTIPART_REQUIRED',
          '请使用 multipart/form-data 上传',
        );
      }

      const [{ value: attachmentCount }, [lastAttachment], [currentCover]] =
        await Promise.all([
          options.db
            .select({ value: count() })
            .from(assetAttachments)
            .where(eq(assetAttachments.assetId, request.params.id))
            .then((rows) => rows[0] ?? { value: 0 }),
          options.db
            .select({ sortOrder: assetAttachments.sortOrder })
            .from(assetAttachments)
            .where(eq(assetAttachments.assetId, request.params.id))
            .orderBy(desc(assetAttachments.sortOrder))
            .limit(1),
          options.db
            .select({ id: assetAttachments.id })
            .from(assetAttachments)
            .where(
              and(
                eq(assetAttachments.assetId, request.params.id),
                eq(assetAttachments.isCover, true),
              ),
            )
            .limit(1),
        ]);

      if (attachmentCount >= options.config.ATTACHMENT_MAX_COUNT_PER_ASSET) {
        return sendApiError(
          reply,
          409,
          'ATTACHMENT_LIMIT_REACHED',
          `每件物品最多保存 ${String(options.config.ATTACHMENT_MAX_COUNT_PER_ASSET)} 个附件`,
        );
      }

      let uploaded: Awaited<ReturnType<AttachmentStorage['store']>>;
      try {
        const part = await request.file({
          limits: { files: 1, fileSize: options.config.ATTACHMENT_MAX_BYTES },
        });

        if (!part || part.fieldname !== 'file') {
          return sendApiError(reply, 400, 'FILE_REQUIRED', '请选择要上传的文件');
        }

        uploaded = await storage.store(part.file, part.filename);
      } catch (error) {
        return sendStorageError(error, request, reply);
      }

      try {
        const [created] = await options.db
          .insert(assetAttachments)
          .values({
            id: randomUUID(),
            assetId: request.params.id,
            kind: uploaded.kind,
            storageKey: uploaded.storageKey,
            thumbnailStorageKey: uploaded.thumbnailStorageKey,
            originalName: uploaded.originalName,
            mediaType: uploaded.mediaType,
            sizeBytes: uploaded.sizeBytes,
            sha256: uploaded.sha256,
            width: uploaded.width,
            height: uploaded.height,
            isCover: uploaded.kind === 'photo' && !currentCover,
            sortOrder: (lastAttachment?.sortOrder ?? -1) + 1,
          })
          .returning();

        if (!created) {
          throw new Error('Attachment insert returned no row.');
        }

        return reply.code(201).send(mapAssetAttachment(created));
      } catch (error) {
        await storage.remove([uploaded.storageKey, uploaded.thumbnailStorageKey]);
        request.log.error(error, 'Attachment metadata insert failed');
        return sendApiError(reply, 500, 'ATTACHMENT_CREATE_FAILED', '无法保存附件记录');
      }
    },
  );

  typedApp.patch(
    '/api/v1/assets/:id/attachments/:attachmentId',
    {
      schema: {
        params: attachmentParamsSchema,
        body: updateAssetAttachmentSchema,
        response: { 200: assetAttachmentSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }

      const existing = await findAttachment(
        options.db,
        request.params.id,
        request.params.attachmentId,
      );
      if (!existing) {
        return sendApiError(reply, 404, 'ATTACHMENT_NOT_FOUND', '没有找到该附件');
      }

      if (request.body.isCover === true && existing.kind !== 'photo') {
        return sendApiError(reply, 409, 'DOCUMENT_CANNOT_BE_COVER', '文档不能设为封面');
      }

      const updated = await options.db.transaction(async (transaction) => {
        if (request.body.isCover === true) {
          await transaction
            .update(assetAttachments)
            .set({ isCover: false, updatedAt: new Date() })
            .where(
              and(
                eq(assetAttachments.assetId, request.params.id),
                ne(assetAttachments.id, request.params.attachmentId),
              ),
            );
        }

        const [row] = await transaction
          .update(assetAttachments)
          .set({
            ...(request.body.caption !== undefined
              ? { caption: request.body.caption }
              : {}),
            ...(request.body.isCover !== undefined
              ? { isCover: request.body.isCover }
              : {}),
            ...(request.body.sortOrder !== undefined
              ? { sortOrder: request.body.sortOrder }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(assetAttachments.id, request.params.attachmentId))
          .returning();
        return row;
      });

      if (!updated) {
        return sendApiError(reply, 404, 'ATTACHMENT_NOT_FOUND', '没有找到该附件');
      }

      return mapAssetAttachment(updated);
    },
  );

  typedApp.delete(
    '/api/v1/assets/:id/attachments/:attachmentId',
    { schema: { params: attachmentParamsSchema } },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }

      const existing = await findAttachment(
        options.db,
        request.params.id,
        request.params.attachmentId,
      );
      if (!existing) {
        return sendApiError(reply, 404, 'ATTACHMENT_NOT_FOUND', '没有找到该附件');
      }

      await options.db.transaction(async (transaction) => {
        await transaction
          .delete(assetAttachments)
          .where(eq(assetAttachments.id, existing.id));

        if (existing.isCover) {
          const [nextCover] = await transaction
            .select({ id: assetAttachments.id })
            .from(assetAttachments)
            .where(
              and(
                eq(assetAttachments.assetId, request.params.id),
                eq(assetAttachments.kind, 'photo'),
              ),
            )
            .orderBy(asc(assetAttachments.sortOrder), asc(assetAttachments.createdAt))
            .limit(1);

          if (nextCover) {
            await transaction
              .update(assetAttachments)
              .set({ isCover: true, updatedAt: new Date() })
              .where(eq(assetAttachments.id, nextCover.id));
          }
        }
      });

      try {
        await storage.remove([existing.storageKey, existing.thumbnailStorageKey]);
      } catch (error) {
        request.log.error(error, 'Deleted attachment file cleanup failed');
      }

      return reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/assets/:id/attachments/:attachmentId/content',
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['attachments:read'] }))
      ) {
        return reply;
      }

      const parsedParams = attachmentParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(reply, 400, 'INVALID_ATTACHMENT_ID', '附件地址无效');
      }

      const attachment = await findAttachment(
        options.db,
        parsedParams.data.id,
        parsedParams.data.attachmentId,
      );
      if (!attachment) {
        return sendApiError(reply, 404, 'ATTACHMENT_NOT_FOUND', '没有找到该附件');
      }

      try {
        const size = await storage.fileSize(attachment.storageKey);
        reply
          .header('Content-Type', attachment.mediaType)
          .header('Content-Length', size)
          .header('X-Content-Type-Options', 'nosniff')
          .header('Cache-Control', 'private, max-age=31536000, immutable')
          .header(
            'Content-Disposition',
            safeContentDisposition(attachment.originalName, attachment.kind === 'photo'),
          );
        return reply.send(storage.openReadStream(attachment.storageKey));
      } catch (error) {
        request.log.error(error, 'Attachment file is missing');
        return sendApiError(reply, 404, 'ATTACHMENT_FILE_MISSING', '附件文件已丢失');
      }
    },
  );

  app.get(
    '/api/v1/assets/:id/attachments/:attachmentId/thumbnail',
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['attachments:read'] }))
      ) {
        return reply;
      }

      const parsedParams = attachmentParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(reply, 400, 'INVALID_ATTACHMENT_ID', '附件地址无效');
      }

      const attachment = await findAttachment(
        options.db,
        parsedParams.data.id,
        parsedParams.data.attachmentId,
      );
      if (!attachment?.thumbnailStorageKey) {
        return sendApiError(reply, 404, 'THUMBNAIL_NOT_FOUND', '该附件没有缩略图');
      }

      try {
        const size = await storage.fileSize(attachment.thumbnailStorageKey);
        reply
          .header('Content-Type', 'image/webp')
          .header('Content-Length', size)
          .header('X-Content-Type-Options', 'nosniff')
          .header('Cache-Control', 'private, max-age=31536000, immutable')
          .header('Content-Disposition', 'inline');
        return reply.send(storage.openReadStream(attachment.thumbnailStorageKey));
      } catch (error) {
        request.log.error(error, 'Attachment thumbnail is missing');
        return sendApiError(reply, 404, 'THUMBNAIL_FILE_MISSING', '缩略图文件已丢失');
      }
    },
  );
}

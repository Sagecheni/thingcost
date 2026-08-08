import { randomUUID } from 'node:crypto';

import { asc, and, count, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { RuntimeConfig } from '@thingcost/config';
import { subscriptionAttachmentSchema, uuidSchema } from '@thingcost/contracts';
import {
  subscriptionAttachments,
  subscriptions,
  type Database,
} from '@thingcost/database';

import { requireAuth, sendApiError } from '../lib/http.js';
import {
  AttachmentStorage,
  AttachmentStorageError,
} from '../services/attachment-storage.js';
import { mapSubscriptionAttachment } from '../services/subscriptions.js';

const paramsSchema = z.object({ id: uuidSchema });
const attachmentParamsSchema = z.object({ id: uuidSchema, attachmentId: uuidSchema });

interface Options {
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

async function activeSubscription(db: Database, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), isNull(subscriptions.deletedAt)))
    .limit(1);
  return Boolean(row);
}

async function findAttachment(
  db: Database,
  subscriptionId: string,
  attachmentId: string,
) {
  const [row] = await db
    .select({ attachment: subscriptionAttachments })
    .from(subscriptionAttachments)
    .innerJoin(
      subscriptions,
      eq(subscriptionAttachments.subscriptionId, subscriptions.id),
    )
    .where(
      and(
        eq(subscriptionAttachments.id, attachmentId),
        eq(subscriptionAttachments.subscriptionId, subscriptionId),
        isNull(subscriptions.deletedAt),
      ),
    )
    .limit(1);
  return row?.attachment ?? null;
}

async function storageError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AttachmentStorageError) {
    return sendApiError(
      reply,
      error.code === 'FILE_TOO_LARGE' ? 413 : 415,
      error.code,
      error.message,
    );
  }
  if (
    error instanceof Error &&
    'code' in error &&
    error.code === 'FST_REQ_FILE_TOO_LARGE'
  ) {
    return sendApiError(reply, 413, 'FILE_TOO_LARGE', '上传文件超过大小限制');
  }
  request.log.error(error, 'Subscription attachment operation failed');
  return sendApiError(reply, 500, 'ATTACHMENT_STORAGE_FAILED', '附件存储失败');
}

export async function registerSubscriptionAttachmentRoutes(
  app: FastifyInstance,
  options: Options,
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
    '/api/v1/subscriptions/:id/attachments',
    {
      schema: {
        tags: ['Subscriptions'],
        params: paramsSchema,
        response: { 200: subscriptionAttachmentSchema.array() },
      },
    },
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['attachments:read'] }))
      )
        return reply;
      if (!(await activeSubscription(options.db, request.params.id))) {
        return sendApiError(reply, 404, 'SUBSCRIPTION_NOT_FOUND', '没有找到该订阅或许可');
      }
      const rows = await options.db
        .select()
        .from(subscriptionAttachments)
        .where(eq(subscriptionAttachments.subscriptionId, request.params.id))
        .orderBy(
          asc(subscriptionAttachments.sortOrder),
          desc(subscriptionAttachments.createdAt),
        );
      return rows.map(mapSubscriptionAttachment);
    },
  );

  typedApp.post(
    '/api/v1/subscriptions/:id/attachments',
    {
      schema: {
        tags: ['Subscriptions'],
        params: paramsSchema,
        response: { 201: subscriptionAttachmentSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true })))
        return reply;
      if (!(await activeSubscription(options.db, request.params.id))) {
        return sendApiError(reply, 404, 'SUBSCRIPTION_NOT_FOUND', '没有找到该订阅或许可');
      }
      if (!request.isMultipart())
        return sendApiError(
          reply,
          415,
          'MULTIPART_REQUIRED',
          '请使用 multipart/form-data 上传',
        );
      const [{ value: attachmentCount }, [lastAttachment]] = await Promise.all([
        options.db
          .select({ value: count() })
          .from(subscriptionAttachments)
          .where(eq(subscriptionAttachments.subscriptionId, request.params.id))
          .then((rows) => rows[0] ?? { value: 0 }),
        options.db
          .select({ sortOrder: subscriptionAttachments.sortOrder })
          .from(subscriptionAttachments)
          .where(eq(subscriptionAttachments.subscriptionId, request.params.id))
          .orderBy(desc(subscriptionAttachments.sortOrder))
          .limit(1),
      ]);
      if (attachmentCount >= options.config.ATTACHMENT_MAX_COUNT_PER_ASSET) {
        return sendApiError(
          reply,
          409,
          'ATTACHMENT_LIMIT_REACHED',
          `每个订阅最多保存 ${String(options.config.ATTACHMENT_MAX_COUNT_PER_ASSET)} 个附件`,
        );
      }
      let uploaded: Awaited<ReturnType<AttachmentStorage['store']>>;
      try {
        const part = await request.file({
          limits: { files: 1, fileSize: options.config.ATTACHMENT_MAX_BYTES },
        });
        if (!part || part.fieldname !== 'file')
          return sendApiError(reply, 400, 'FILE_REQUIRED', '请选择要上传的文件');
        uploaded = await storage.store(part.file, part.filename);
      } catch (error) {
        return storageError(error, request, reply);
      }
      try {
        const [created] = await options.db
          .insert(subscriptionAttachments)
          .values({
            id: randomUUID(),
            subscriptionId: request.params.id,
            kind: uploaded.kind,
            storageKey: uploaded.storageKey,
            thumbnailStorageKey: uploaded.thumbnailStorageKey,
            originalName: uploaded.originalName,
            mediaType: uploaded.mediaType,
            sizeBytes: uploaded.sizeBytes,
            sha256: uploaded.sha256,
            width: uploaded.width,
            height: uploaded.height,
            sortOrder: (lastAttachment?.sortOrder ?? -1) + 1,
          })
          .returning();
        if (!created) throw new Error('Attachment insert returned no row.');
        return reply.code(201).send(mapSubscriptionAttachment(created));
      } catch (error) {
        await storage.remove([uploaded.storageKey, uploaded.thumbnailStorageKey]);
        return storageError(error, request, reply);
      }
    },
  );

  typedApp.delete(
    '/api/v1/subscriptions/:id/attachments/:attachmentId',
    { schema: { tags: ['Subscriptions'], params: attachmentParamsSchema } },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true })))
        return reply;
      const existing = await findAttachment(
        options.db,
        request.params.id,
        request.params.attachmentId,
      );
      if (!existing)
        return sendApiError(reply, 404, 'ATTACHMENT_NOT_FOUND', '没有找到该附件');
      await options.db
        .delete(subscriptionAttachments)
        .where(eq(subscriptionAttachments.id, existing.id));
      try {
        await storage.remove([existing.storageKey, existing.thumbnailStorageKey]);
      } catch (error) {
        request.log.error(error, 'Subscription attachment cleanup failed');
      }
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/subscriptions/:id/attachments/:attachmentId/content',
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['attachments:read'] }))
      )
        return reply;
      const parsed = attachmentParamsSchema.safeParse(request.params);
      if (!parsed.success)
        return sendApiError(reply, 400, 'INVALID_ATTACHMENT_ID', '附件地址无效');
      const attachment = await findAttachment(
        options.db,
        parsed.data.id,
        parsed.data.attachmentId,
      );
      if (!attachment)
        return sendApiError(reply, 404, 'ATTACHMENT_NOT_FOUND', '没有找到该附件');
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
        return storageError(error, request, reply);
      }
    },
  );

  app.get(
    '/api/v1/subscriptions/:id/attachments/:attachmentId/thumbnail',
    async (request, reply) => {
      if (
        !(await requireAuth(options.db, request, reply, { scopes: ['attachments:read'] }))
      )
        return reply;
      const parsed = attachmentParamsSchema.safeParse(request.params);
      if (!parsed.success)
        return sendApiError(reply, 400, 'INVALID_ATTACHMENT_ID', '附件地址无效');
      const attachment = await findAttachment(
        options.db,
        parsed.data.id,
        parsed.data.attachmentId,
      );
      if (!attachment?.thumbnailStorageKey)
        return sendApiError(reply, 404, 'THUMBNAIL_NOT_FOUND', '没有找到附件缩略图');
      try {
        const size = await storage.fileSize(attachment.thumbnailStorageKey);
        reply
          .header('Content-Type', 'image/webp')
          .header('Content-Length', size)
          .header('X-Content-Type-Options', 'nosniff')
          .header('Cache-Control', 'private, max-age=31536000, immutable');
        return reply.send(storage.openReadStream(attachment.thumbnailStorageKey));
      } catch (error) {
        return storageError(error, request, reply);
      }
    },
  );
}

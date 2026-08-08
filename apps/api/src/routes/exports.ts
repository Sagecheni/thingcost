import { createReadStream } from 'node:fs';

import type { FastifyInstance } from 'fastify';
import type { RuntimeConfig } from '@thingcost/config';
import type { Database } from '@thingcost/database';

import { requireAuth, sendApiError } from '../lib/http.js';
import { AttachmentStorage } from '../services/attachment-storage.js';
import { createPortableExport } from '../services/portable-export.js';

interface ExportRouteOptions {
  db: Database;
  config: RuntimeConfig;
  storage?: AttachmentStorage;
}

export function registerExportRoutes(
  app: FastifyInstance,
  options: ExportRouteOptions,
): void {
  const storage =
    options.storage ??
    new AttachmentStorage(
      options.config.ATTACHMENTS_DIR,
      options.config.ATTACHMENT_MAX_BYTES,
    );

  app.post('/api/v1/exports/portable', async (request, reply) => {
    if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
      return reply;
    }

    try {
      const portableExport = await createPortableExport(options.db, storage);
      const stream = createReadStream(portableExport.path);
      stream.once('close', () => void portableExport.cleanup());
      stream.once('error', () => void portableExport.cleanup());
      reply.header('Content-Type', 'application/zip');
      reply.header(
        'Content-Disposition',
        `attachment; filename="${portableExport.filename}"`,
      );
      reply.header('Cache-Control', 'no-store');
      return reply.send(stream);
    } catch (error) {
      request.log.error(error, 'Portable export failed');
      return sendApiError(reply, 500, 'EXPORT_FAILED', '导出失败，请检查附件存储后重试');
    }
  });
}

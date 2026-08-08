import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import type { RuntimeConfig } from '@thingcost/config';
import {
  applyPortableImportInputSchema,
  portableImportPreviewSchema,
  portableImportResultSchema,
} from '@thingcost/contracts';
import type { Database } from '@thingcost/database';

import { requireAuth, sendApiError } from '../lib/http.js';
import { AttachmentStorage } from '../services/attachment-storage.js';
import {
  applyPortableImport,
  PortableImportError,
  stagePortableImport,
} from '../services/portable-import.js';

interface ImportRouteOptions {
  db: Database;
  config: RuntimeConfig;
  storage?: AttachmentStorage;
}

const IMPORT_MAX_BYTES = 200 * 1024 * 1024;

function mapImportError(error: PortableImportError): {
  status: number;
  code: string;
  message: string;
} {
  switch (error.code) {
    case 'IMPORT_NOT_FOUND':
    case 'IMPORT_EXPIRED':
      return { status: 404, code: error.code, message: error.message };
    case 'REPLACE_NOT_CONFIRMED':
      return { status: 400, code: error.code, message: error.message };
    case 'INVALID_ARCHIVE':
    case 'UNSUPPORTED_VERSION':
    case 'CHECKSUM_MISMATCH':
    case 'MISSING_ATTACHMENT':
      return { status: 400, code: error.code, message: error.message };
    default:
      return { status: 500, code: 'IMPORT_FAILED', message: error.message };
  }
}

export function registerImportRoutes(
  app: FastifyInstance,
  options: ImportRouteOptions,
): void {
  const storage =
    options.storage ??
    new AttachmentStorage(
      options.config.ATTACHMENTS_DIR,
      options.config.ATTACHMENT_MAX_BYTES,
    );
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/api/v1/imports/portable/preview',
    {
      schema: {
        response: { 200: portableImportPreviewSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }

      const file = await request.file({
        limits: { fileSize: IMPORT_MAX_BYTES },
      });
      if (!file) {
        return sendApiError(reply, 400, 'MISSING_FILE', '请上传 Chronicle Export ZIP');
      }

      try {
        return await stagePortableImport(options.db, file.file);
      } catch (error) {
        if (error instanceof PortableImportError) {
          const mapped = mapImportError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        request.log.error(error, 'Portable import preview failed');
        return sendApiError(reply, 500, 'IMPORT_FAILED', '导入预览失败');
      }
    },
  );

  typedApp.post(
    '/api/v1/imports/portable/apply',
    {
      schema: {
        body: applyPortableImportInputSchema,
        response: { 200: portableImportResultSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireAuth(options.db, request, reply, { sessionOnly: true }))) {
        return reply;
      }

      try {
        return await applyPortableImport(options.db, storage, request.body);
      } catch (error) {
        if (error instanceof PortableImportError) {
          const mapped = mapImportError(error);
          return sendApiError(reply, mapped.status, mapped.code, mapped.message);
        }
        request.log.error(error, 'Portable import apply failed');
        return sendApiError(reply, 500, 'IMPORT_FAILED', '导入应用失败');
      }
    },
  );
}

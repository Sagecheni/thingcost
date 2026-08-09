import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySensible from '@fastify/sensible';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import fastifyStatic from '@fastify/static';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import type { RuntimeConfig } from '@thingcost/config';
import { apiVersion, applicationMetaSchema } from '@thingcost/contracts';
import type { Database } from '@thingcost/database';

import { isRequestOriginAllowed, sendApiError } from './lib/http.js';
import { registerAssetActivityRoutes } from './routes/asset-activity.js';
import { registerAssetRelationshipRoutes } from './routes/asset-relationships.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerAttachmentRoutes } from './routes/attachments.js';
import { registerApiTokenRoutes } from './routes/api-tokens.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCatalogRoutes } from './routes/catalogs.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerExchangeRateRoutes } from './routes/exchange-rates.js';
import { registerExportRoutes } from './routes/exports.js';
import { registerImportRoutes } from './routes/imports.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerReminderRoutes } from './routes/reminders.js';
import { registerSetupRoutes } from './routes/setup.js';
import { registerSettingsRoutes } from './routes/settings.js';
import type { AiProvider } from './services/ai-providers.js';
import type { SearchProvider } from './services/search-providers.js';
import { registerSubscriptionAttachmentRoutes } from './routes/subscription-attachments.js';
import { registerSubscriptionRoutes } from './routes/subscriptions.js';
import { registerValuationRoutes } from './routes/valuations.js';
import { registerWishlistRoutes } from './routes/wishlists.js';

export interface AppDependencies {
  db?: Database;
  valuationSearchProvider?: SearchProvider | null;
  valuationAiProvider?: AiProvider | null;
}

function openApiTagForPath(path: string): string | undefined {
  if (path.startsWith('/health')) return 'Health';
  if (path.includes('/meta')) return 'Meta';
  if (path.includes('/setup') || path.includes('/auth')) return 'Auth';
  if (path.includes('personal-api') || path.includes('personal-access-tokens')) {
    return 'Personal API';
  }
  if (path.includes('/settings')) return 'Settings';
  if (
    path.includes('/categories') ||
    path.includes('/tags') ||
    path.includes('/asset-statuses')
  ) {
    return 'Catalogs';
  }
  if (path.includes('/attachments') || path.includes('/thumbnail')) {
    return 'Attachments';
  }
  if (
    path.includes('/condition') ||
    path.includes('/loans') ||
    path.includes('/repairs')
  ) {
    return 'Asset activity';
  }
  if (path.includes('/relationships')) return 'Deprecated';
  if (path.includes('/assets')) return 'Assets';
  if (path.includes('/dashboard')) return 'Dashboard';
  if (path.includes('/orders')) return 'Orders';
  if (path.includes('/exchange-rates')) return 'Exchange rates';
  if (path.includes('/exports') || path.includes('/imports')) return 'Portable data';
  if (path.includes('/reminders') || path.includes('/notification')) {
    return 'Reminders';
  }
  if (path.includes('/wishlist')) return 'Wishlist';
  if (path.includes('/valuations')) return 'Valuations';
  if (path.includes('/subscriptions')) return 'Subscriptions';
  return undefined;
}

export async function buildApp(
  config: RuntimeConfig,
  dependencies: AppDependencies = {},
) {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              censor: '[Redacted]',
            },
          },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifySensible);
  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: {
      files: 1,
      fields: 0,
      fileSize: config.ATTACHMENT_MAX_BYTES,
    },
    throwFileSizeLimit: true,
  });
  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: '物纪 Chronicle API',
        version: '0.1.0',
        description: [
          '自托管物品生命周期 API（`/api/v1`）。',
          '浏览器会话使用 HttpOnly Cookie `chronicle_session`；',
          '个人访问令牌使用 `Authorization: Bearer ct_…`，默认关闭且需管理员显式启用。',
          '机器可读契约：`GET /api/v1/openapi.json`；交互文档：`/api/docs`。',
        ].join(''),
      },
      tags: [
        { name: 'Health', description: '存活与就绪探测' },
        { name: 'Meta', description: '应用元数据' },
        { name: 'Auth', description: '初始化、登录与会话' },
        { name: 'Personal API', description: '个人访问令牌与开关' },
        { name: 'Settings', description: '应用时区与基础币种设置' },
        { name: 'Catalogs', description: '分类、状态与标签' },
        { name: 'Assets', description: '物品与资金/生命周期事件' },
        { name: 'Asset activity', description: '成色、借出与维修' },
        { name: 'Attachments', description: '私有附件与缩略图' },
        { name: 'Dashboard', description: '组合统计与趋势' },
        { name: 'Orders', description: '购买订单' },
        { name: 'Exchange rates', description: '参考汇率报价' },
        { name: 'Portable data', description: '可移植导出与导入' },
        { name: 'Reminders', description: '提醒与通知渠道' },
        { name: 'Wishlist', description: '种草清单与价格快照' },
        {
          name: 'Valuations',
          description: '旧版本估值兼容接口（已从 Web 产品流程移除）',
        },
        {
          name: 'Subscriptions',
          description: '周期订阅与数字许可（独立于实物资产）',
        },
        {
          name: 'Deprecated',
          description: '兼容保留、产品界面已撤下的端点',
        },
      ],
      // Either auth method is accepted; handlers enforce session-only or scopes.
      security: [{ sessionCookie: [] }, { personalAccessToken: [] }],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: 'apiKey',
            in: 'cookie',
            name: 'chronicle_session',
          },
          personalAccessToken: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'ct_…',
            description:
              '个人访问令牌。需先启用并授予端点所需 Scope；导出/导入与令牌管理仅允许会话。',
          },
        },
      },
    },
    transform: (input) => {
      const transformed = jsonSchemaTransform(input);
      const schema =
        transformed && typeof transformed === 'object' && 'schema' in transformed
          ? transformed.schema
          : undefined;
      let url = '';
      if (transformed && typeof transformed === 'object' && 'url' in transformed) {
        const rawUrl = (transformed as { url?: unknown }).url;
        url = typeof rawUrl === 'string' ? rawUrl : '';
      }
      if (!url && typeof input.url === 'string') url = input.url;

      if (schema && typeof schema === 'object') {
        const tag = openApiTagForPath(url);
        if (tag) {
          const existing = Array.isArray(schema.tags) ? (schema.tags as string[]) : [];
          if (!existing.includes(tag)) {
            schema.tags = [...existing, tag];
          }
        }

        if (url.includes('/relationships')) {
          schema.deprecated = true;
          schema.description =
            typeof schema.description === 'string'
              ? `${schema.description}（产品界面已撤下配件关系，仅兼容旧数据）`
              : '产品界面已撤下配件关系，仅兼容旧数据。';
        }

        // Public probes do not require authentication.
        if (
          url.startsWith('/health') ||
          url.includes('/meta') ||
          url.includes('/setup/status')
        ) {
          schema.security = [];
        }
      }

      return transformed;
    },
  });
  await app.register(fastifySwaggerUi, {
    routePrefix: '/api/docs',
  });

  // Stable machine-readable contract alias (UI remains at /api/docs).
  app.get(`/api/${apiVersion}/openapi.json`, { schema: { hide: true } }, () =>
    app.swagger(),
  );

  app.addHook('onRequest', async (request, reply) => {
    if (!isRequestOriginAllowed(request, config)) {
      return sendApiError(reply, 403, 'ORIGIN_NOT_ALLOWED', '请求来源不受信任');
    }
  });

  app.get('/health/live', () => ({ status: 'ok' as const }));
  app.get('/health/ready', async (request, reply) => {
    if (dependencies.db) {
      try {
        await dependencies.db.execute(sql`select 1`);
      } catch (error) {
        request.log.error(error, 'Database readiness check failed');
        return reply.code(503).send({ status: 'unavailable' as const });
      }
    }

    return { status: 'ok' as const };
  });

  app.withTypeProvider().get(
    `/api/${apiVersion}/meta`,
    {
      schema: {
        response: {
          200: applicationMetaSchema,
        },
      },
    },
    () => ({
      name: '物纪' as const,
      englishName: 'Chronicle' as const,
      apiVersion,
    }),
  );

  if (dependencies.db) {
    registerSetupRoutes(app, { db: dependencies.db, config });
    registerAuthRoutes(app, { db: dependencies.db, config });
    registerApiTokenRoutes(app, { db: dependencies.db });
    registerSettingsRoutes(app, { db: dependencies.db });
    registerCatalogRoutes(app, { db: dependencies.db });
    registerAssetRoutes(app, { db: dependencies.db, config });
    registerAssetActivityRoutes(app, { db: dependencies.db });
    registerAssetRelationshipRoutes(app, { db: dependencies.db });
    await registerAttachmentRoutes(app, { db: dependencies.db, config });
    registerDashboardRoutes(app, { db: dependencies.db });
    registerOrderRoutes(app, { db: dependencies.db });
    registerExchangeRateRoutes(app, { db: dependencies.db, config });
    registerExportRoutes(app, { db: dependencies.db, config });
    registerImportRoutes(app, { db: dependencies.db, config });
    registerReminderRoutes(app, { db: dependencies.db, config });
    await registerWishlistRoutes(app, { db: dependencies.db, config });
    registerSubscriptionRoutes(app, { db: dependencies.db });
    await registerSubscriptionAttachmentRoutes(app, { db: dependencies.db, config });
    registerValuationRoutes(app, {
      db: dependencies.db,
      config,
      ...(dependencies.valuationSearchProvider !== undefined
        ? { searchProvider: dependencies.valuationSearchProvider }
        : {}),
      ...(dependencies.valuationAiProvider !== undefined
        ? { aiProvider: dependencies.valuationAiProvider }
        : {}),
    });
  }

  if (config.WEB_DIST_DIR) {
    const webRoot = resolve(config.WEB_DIST_DIR);

    if (!existsSync(resolve(webRoot, 'index.html'))) {
      throw new Error(`WEB_DIST_DIR does not contain index.html: ${webRoot}`);
    }

    await app.register(fastifyStatic, {
      root: webRoot,
      index: ['index.html'],
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/health/')) {
        return sendApiError(reply, 404, 'ROUTE_NOT_FOUND', '接口不存在');
      }

      return reply.sendFile('index.html');
    });
  }

  return app;
}

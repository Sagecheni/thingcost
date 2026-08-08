import { rm } from 'node:fs/promises';

import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '@thingcost/config';
import {
  assetAttachmentSchema,
  assetDetailSchema,
  assetRelationshipSchema,
  assetListSchema,
  assetStatusSchema,
  categorySchema,
  dashboardSchema,
  portableImportPreviewSchema,
  portableImportResultSchema,
  purchaseOrderDetailSchema,
  purchaseOrderListSchema,
  recycleBinSchema,
  reminderDetailSchema,
  reminderListSchema,
  reminderOccurrenceSchema,
  tagSchema,
  wishlistConversionResultSchema,
  wishlistImageSchema,
  wishlistItemDetailSchema,
  wishlistItemListSchema,
  wishlistPriceSnapshotSchema,
  valuationAnalyticsSchema,
  valuationPreviewSchema,
  valuationReportListSchema,
  valuationReportSchema,
  valuationScheduleSchema,
  valuationSnapshotListSchema,
  confirmValuationResultSchema,
  subscriptionDetailSchema,
  subscriptionListSchema,
} from '@thingcost/contracts';
import { createDatabase, reminderOccurrences } from '@thingcost/database';

import { buildApp } from '../src/app.js';
import { currentDateInTimeZone } from '../src/lib/dates.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const database = testDatabaseUrl ? createDatabase(testDatabaseUrl) : null;
const attachmentTestRoot = '/tmp/chronicle-integration-test-attachments';

const testConfig: RuntimeConfig = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 3000,
  LOG_LEVEL: 'silent',
  DATABASE_URL: testDatabaseUrl ?? 'postgres://unused:unused@localhost:5432/unused',
  APP_TIME_ZONE: 'Asia/Shanghai',
  APP_BASE_CURRENCY: 'CNY',
  FRANKFURTER_BASE_URL: 'https://api.frankfurter.dev/v2',
  COOKIE_SECURE: false,
  ATTACHMENTS_DIR: attachmentTestRoot,
  ATTACHMENT_MAX_BYTES: 20_971_520,
  ATTACHMENT_MAX_COUNT_PER_ASSET: 50,
  REMINDER_POLL_INTERVAL_MS: 10_000,
  REMINDER_EXPANSION_DAYS: 400,
  REMINDER_DELIVERY_MAX_ATTEMPTS: 4,
  REMINDER_CLAIM_LIMIT: 20,
  TAVILY_BASE_URL: 'https://api.tavily.com',
  AI_PROTOCOL: 'chat_completions',
  AI_TIMEOUT_MS: 45_000,
  AI_PROVIDER_NAME: 'fixture',
  AI_MONTHLY_BUDGET: 50,
  AI_CONCURRENCY: 1,
  AI_SEARCH_CACHE_TTL_MS: 86_400_000,
  VALUATION_CLAIM_LIMIT: 5,
};

function sessionCookie(response: {
  headers: Record<string, string | string[] | number | undefined>;
}) {
  const setCookie = response.headers['set-cookie'];
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  if (!value || typeof value !== 'string') {
    throw new Error('Expected a session cookie.');
  }

  return value.split(';')[0];
}

function multipartFile(
  boundary: string,
  filename: string,
  mediaType: string,
  content: Buffer,
): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mediaType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

describe.skipIf(!database)('milestone-one API', () => {
  beforeEach(async () => {
    await rm(attachmentTestRoot, { recursive: true, force: true });
    await database?.db.execute(sql`
      truncate table
        wishlist_price_snapshots,
        wishlist_marketplace_links,
        wishlist_images,
        wishlist_items,
        personal_access_tokens,
        valuation_snapshots,
        valuation_schedules,
        valuation_search_cache,
        valuation_reports,
        subscription_charges,
        subscriptions,
        reminder_deliveries,
        reminder_occurrences,
        reminders,
        notification_channels,
        purchase_order_items,
        purchase_orders,
        asset_relationships,
        asset_attachments,
        condition_defects,
        condition_events,
        repairs,
        loans,
        asset_tags,
        financial_events,
        lifecycle_events,
        assets,
        tags,
        categories,
        asset_statuses,
        sessions,
        admin_users,
        app_settings
      restart identity cascade
    `);
  });

  afterAll(async () => {
    await database?.client.end();
  });

  it('initializes, authenticates, and records a complete asset lifecycle', async () => {
    if (!database) {
      throw new Error('TEST_DATABASE_URL is required.');
    }

    const app = await buildApp(testConfig, { db: database.db });
    const today = currentDateInTimeZone('Asia/Shanghai');

    const initialStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/setup/status',
    });
    expect(initialStatus.json()).toEqual({ initialized: false });

    const initialized = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'chronicle',
        password: 'correct-horse-battery-staple',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    expect(initialized.statusCode).toBe(201);
    const cookie = sessionCookie(initialized);

    const secondInitialization = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'another-admin',
        password: 'another-long-password',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    expect(secondInitialization.statusCode).toBe(409);

    const rejectedLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'chronicle', password: 'not-the-right-password' },
    });
    expect(rejectedLogin.statusCode).toBe(401);

    const acceptedLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'chronicle',
        password: 'correct-horse-battery-staple',
      },
    });
    expect(acceptedLogin.statusCode).toBe(200);

    const categoriesResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/categories',
      headers: { cookie },
    });
    const statusesResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/asset-statuses',
      headers: { cookie },
    });
    const [category] = categorySchema.array().parse(categoriesResponse.json());
    const statuses = assetStatusSchema.array().parse(statusesResponse.json());
    const inUse = statuses.find((status) => status.code === 'in_use');
    const retired = statuses.find((status) => status.code === 'retired');
    const sold = statuses.find((status) => status.code === 'sold');

    if (!category || !inUse || !retired || !sold) {
      throw new Error('Expected default categories and lifecycle statuses.');
    }

    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { cookie },
      payload: {
        name: '测试相机',
        categoryId: category.id,
        acquisitionType: 'purchase',
        acquisitionDate: today,
        costKnowledge: 'known_amount',
        acquisitionAmountMinor: '500000',
        priceCurrency: 'CNY',
        originalPriceMinor: '600000',
        discountMinor: '100000',
        serialNumber: 'SN-CHRONICLE-001',
        purchaseChannel: '品牌官网',
        orderNumber: 'WEB-2026-001',
        warrantyStartDate: today,
        warrantyEndDate: '2028-01-01',
        extendedWarrantyEndDate: '2029-01-01',
        extendedWarrantyProvider: '品牌延保',
        initialStatusId: inUse.id,
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = assetDetailSchema.parse(createdResponse.json());
    expect(created.metrics).toMatchObject({
      holdingDays: 1,
      serviceDays: 1,
      netCostMinor: '500000',
      netDailyCostMinor: '500000',
      currentlyInPortfolio: true,
    });

    const editedResponse = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assets/${created.id}`,
      headers: { cookie },
      payload: { name: '测试相机（已编辑）', brand: 'Chronicle Test' },
    });
    expect(editedResponse.statusCode).toBe(200);
    expect(assetDetailSchema.parse(editedResponse.json())).toMatchObject({
      name: '测试相机（已编辑）',
      brand: 'Chronicle Test',
      serialNumber: 'SN-CHRONICLE-001',
      purchaseChannel: '品牌官网',
      orderNumber: 'WEB-2026-001',
      warrantyStartDate: today,
      warrantyEndDate: '2028-01-01',
      extendedWarrantyEndDate: '2029-01-01',
      extendedWarrantyProvider: '品牌延保',
    });

    const unknownCostResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { cookie },
      payload: {
        name: '旧物赠礼',
        categoryId: category.id,
        acquisitionType: 'gift',
        acquisitionDate: today,
        costKnowledge: 'unknown',
        initialStatusId: inUse.id,
      },
    });
    expect(unknownCostResponse.statusCode).toBe(201);
    expect(assetDetailSchema.parse(unknownCostResponse.json()).metrics).toMatchObject({
      netCostMinor: null,
      netDailyCostMinor: null,
    });

    const retiredResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/lifecycle-events`,
      headers: { cookie },
      payload: {
        statusId: retired.id,
        effectiveDate: today,
        note: '暂时退役',
      },
    });
    expect(retiredResponse.statusCode).toBe(201);
    expect(assetDetailSchema.parse(retiredResponse.json()).metrics).toMatchObject({
      holdingDays: 1,
      serviceDays: 1,
      currentlyInPortfolio: false,
    });

    const resumedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/lifecycle-events`,
      headers: { cookie },
      payload: {
        statusId: inUse.id,
        effectiveDate: today,
        note: '重新启用',
      },
    });
    expect(resumedResponse.statusCode).toBe(201);
    expect(
      assetDetailSchema.parse(resumedResponse.json()).metrics.currentlyInPortfolio,
    ).toBe(true);

    const proceedsResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/financial-events`,
      headers: { cookie },
      payload: {
        type: 'sale_proceeds',
        direction: 'inflow',
        amountMinor: '600000',
        currency: 'CNY',
        occurredOn: today,
        includeInNetCost: true,
      },
    });
    expect(proceedsResponse.statusCode).toBe(201);
    expect(assetDetailSchema.parse(proceedsResponse.json()).metrics).toMatchObject({
      netCostMinor: '-100000',
      netDailyCostMinor: '-100000',
    });

    const foreignEventResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/financial-events`,
      headers: { cookie },
      payload: {
        type: 'fee',
        direction: 'outflow',
        amountMinor: '10000',
        currency: 'USD',
        exchangeRate: '7.2',
        exchangeRateSource: 'manual',
        exchangeRateDate: today,
        occurredOn: today,
        includeInNetCost: true,
      },
    });
    expect(foreignEventResponse.statusCode).toBe(201);
    const foreignEvent = assetDetailSchema
      .parse(foreignEventResponse.json())
      .financialEvents.find((event) => event.currency === 'USD');
    expect(foreignEvent).toMatchObject({
      amountMinor: '10000',
      baseAmountMinor: '72000',
      exchangeRate: '7.2',
      exchangeRateSource: 'manual',
      exchangeRateDate: today,
    });

    const soldResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/lifecycle-events`,
      headers: { cookie },
      payload: {
        statusId: sold.id,
        effectiveDate: today,
      },
    });
    expect(soldResponse.statusCode).toBe(201);
    expect(assetDetailSchema.parse(soldResponse.json()).metrics).toMatchObject({
      disposedOn: today,
      currentlyInPortfolio: false,
    });

    const unauthorized = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${created.id}`,
    });
    expect(unauthorized.statusCode).toBe(401);

    await app.close();
  });

  it('records condition, tags, loans, repairs, filters, and Dashboard history', async () => {
    if (!database) {
      throw new Error('TEST_DATABASE_URL is required.');
    }

    const app = await buildApp(testConfig, { db: database.db });
    const today = currentDateInTimeZone('Asia/Shanghai');
    const initialized = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'chronicle',
        password: 'correct-horse-battery-staple',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    expect(initialized.statusCode).toBe(201);
    const cookie = sessionCookie(initialized);

    const categoriesResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/categories',
      headers: { cookie },
    });
    const statusesResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/asset-statuses',
      headers: { cookie },
    });
    const [category] = categorySchema.array().parse(categoriesResponse.json());
    const statuses = assetStatusSchema.array().parse(statusesResponse.json());
    const inUse = statuses.find((status) => status.code === 'in_use');
    const lent = statuses.find((status) => status.code === 'lent');

    if (!category || !inUse || !lent) {
      throw new Error('Expected initial catalogs.');
    }

    const tagResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { cookie },
      payload: { name: '通勤', color: '#52705b' },
    });
    expect(tagResponse.statusCode).toBe(201);
    const tag = tagSchema.parse(tagResponse.json());

    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { cookie },
      payload: {
        name: '通勤相机',
        categoryId: category.id,
        acquisitionType: 'purchase',
        acquisitionDate: today,
        costKnowledge: 'known_amount',
        acquisitionAmountMinor: '100000',
        priceCurrency: 'CNY',
        initialStatusId: inUse.id,
        tagIds: [tag.id],
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = assetDetailSchema.parse(createdResponse.json());
    expect(created.tags).toEqual([tag]);

    const conditionResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/condition-events`,
      headers: { cookie },
      payload: {
        grade: 'good',
        observedOn: today,
        defects: [{ type: 'scratch', description: '底部轻微划痕' }],
        note: '功能正常',
      },
    });
    expect(conditionResponse.statusCode).toBe(201);
    expect(
      assetDetailSchema.parse(conditionResponse.json()).currentCondition,
    ).toMatchObject({
      grade: 'good',
      defects: [{ type: 'scratch', description: '底部轻微划痕' }],
    });

    const directLentStatus = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/lifecycle-events`,
      headers: { cookie },
      payload: { statusId: lent.id, effectiveDate: today },
    });
    expect(directLentStatus.statusCode).toBe(409);

    const loanResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/loans`,
      headers: { cookie },
      payload: { borrower: '小林', lentOn: today, dueOn: today },
    });
    expect(loanResponse.statusCode).toBe(201);
    const loaned = assetDetailSchema.parse(loanResponse.json());
    expect(loaned.currentStatus.code).toBe('lent');
    expect(loaned.hasOpenLoan).toBe(true);
    const loan = loaned.loans[0];

    if (!loan) {
      throw new Error('Expected an open loan.');
    }

    const returnedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/loans/${loan.id}/return`,
      headers: { cookie },
      payload: { returnedOn: today, statusId: inUse.id, note: '完好归还' },
    });
    expect(returnedResponse.statusCode).toBe(200);
    expect(assetDetailSchema.parse(returnedResponse.json())).toMatchObject({
      hasOpenLoan: false,
      currentStatus: { code: 'in_use' },
    });

    const repairResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/repairs`,
      headers: { cookie },
      payload: {
        issue: '快门按钮松动',
        provider: '本地维修店',
        sentOn: today,
        costAmountMinor: '12345',
        currency: 'USD',
        exchangeRate: '7.25',
        exchangeRateSource: 'manual',
        exchangeRateDate: today,
        includeInNetCost: true,
      },
    });
    expect(repairResponse.statusCode).toBe(201);
    const repairing = assetDetailSchema.parse(repairResponse.json());
    expect(repairing).toMatchObject({
      hasOpenRepair: true,
      currentStatus: { code: 'in_repair' },
      metrics: { netCostMinor: '189501' },
    });
    const repair = repairing.repairs[0];

    if (!repair) {
      throw new Error('Expected an open repair.');
    }
    expect(repair).toMatchObject({
      costAmountMinor: '12345',
      currency: 'USD',
      baseCostAmountMinor: '89501',
      baseCurrency: 'CNY',
      exchangeRate: '7.25',
    });

    const completedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/repairs/${repair.id}/complete`,
      headers: { cookie },
      payload: { completedOn: today, statusId: inUse.id, note: '按钮已固定' },
    });
    expect(completedResponse.statusCode).toBe(200);
    expect(assetDetailSchema.parse(completedResponse.json())).toMatchObject({
      hasOpenRepair: false,
      currentStatus: { code: 'in_use' },
    });

    const filteredResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/assets?tagId=${tag.id}&conditionGrade=good&sort=name_asc`,
      headers: { cookie },
    });
    expect(filteredResponse.statusCode).toBe(200);
    expect(assetListSchema.parse(filteredResponse.json())).toMatchObject({ total: 1 });

    const dashboardResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard?periodDays=30',
      headers: { cookie },
    });
    expect(dashboardResponse.statusCode).toBe(200);
    const dashboard = dashboardSchema.parse(dashboardResponse.json());
    expect(dashboard).toMatchObject({
      heldItemCount: 1,
      serviceItemCount: 1,
      unknownCostCount: 0,
      currentNetInvestmentMinor: '189501',
      periodSpendingMinor: '189501',
    });
    expect(dashboard.trend).toHaveLength(30);
    expect(dashboard.recentActivity.map((activity) => activity.type)).toEqual(
      expect.arrayContaining([
        'condition_recorded',
        'loan_started',
        'loan_returned',
        'repair_started',
        'repair_completed',
      ]),
    );

    await app.close();
  });

  it('stores private photos, thumbnails, covers, and documents', async () => {
    if (!database) {
      throw new Error('TEST_DATABASE_URL is required.');
    }

    const app = await buildApp(testConfig, { db: database.db });
    const today = currentDateInTimeZone('Asia/Shanghai');
    await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'chronicle',
        password: 'correct-horse-battery-staple',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'chronicle',
        password: 'correct-horse-battery-staple',
      },
    });
    const cookie = sessionCookie(login);
    const [categoriesResponse, statusesResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/categories', headers: { cookie } }),
      app.inject({ method: 'GET', url: '/api/v1/asset-statuses', headers: { cookie } }),
    ]);
    const category = categorySchema.array().parse(categoriesResponse.json())[0];
    const inUse = assetStatusSchema
      .array()
      .parse(statusesResponse.json())
      .find((status) => status.code === 'in_use');

    if (!category || !inUse) {
      throw new Error('Expected seeded catalogs.');
    }

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { cookie },
      payload: {
        name: '附件测试相机',
        categoryId: category.id,
        acquisitionType: 'gift',
        acquisitionDate: today,
        costKnowledge: 'known_zero',
        initialStatusId: inUse.id,
        tagIds: [],
      },
    });
    const created = assetDetailSchema.parse(createResponse.json());
    const png = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 3,
        background: { r: 82, g: 112, b: 91 },
      },
    })
      .png()
      .toBuffer();

    const upload = (filename: string, mediaType: string, content: Buffer) => {
      const boundary = `chronicle-${crypto.randomUUID()}`;
      return app.inject({
        method: 'POST',
        url: `/api/v1/assets/${created.id}/attachments`,
        headers: {
          cookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: multipartFile(boundary, filename, mediaType, content),
      });
    };

    const firstPhotoResponse = await upload('正面照片.png', 'image/png', png);
    expect(firstPhotoResponse.statusCode).toBe(201);
    const firstPhoto = assetAttachmentSchema.parse(firstPhotoResponse.json());
    expect(firstPhoto).toMatchObject({
      kind: 'photo',
      mediaType: 'image/png',
      width: 24,
      height: 16,
      isCover: true,
    });
    expect(firstPhoto.thumbnailUrl).toBeTruthy();

    const unauthorizedContent = await app.inject({
      method: 'GET',
      url: firstPhoto.contentUrl,
    });
    expect(unauthorizedContent.statusCode).toBe(401);

    const contentResponse = await app.inject({
      method: 'GET',
      url: firstPhoto.contentUrl,
      headers: { cookie },
    });
    expect(contentResponse.statusCode).toBe(200);
    expect(contentResponse.headers['content-type']).toContain('image/png');
    expect(contentResponse.rawPayload.equals(png)).toBe(true);

    if (!firstPhoto.thumbnailUrl) {
      throw new Error('Expected a photo thumbnail.');
    }
    const thumbnailResponse = await app.inject({
      method: 'GET',
      url: firstPhoto.thumbnailUrl,
      headers: { cookie },
    });
    expect(thumbnailResponse.statusCode).toBe(200);
    expect(thumbnailResponse.headers['content-type']).toContain('image/webp');
    expect(thumbnailResponse.rawPayload.length).toBeGreaterThan(0);

    const documentResponse = await upload(
      '购买凭证.pdf',
      'application/octet-stream',
      Buffer.from('%PDF-1.4\n% Chronicle test receipt\n%%EOF'),
    );
    expect(documentResponse.statusCode).toBe(201);
    const document = assetAttachmentSchema.parse(documentResponse.json());
    expect(document).toMatchObject({
      kind: 'document',
      mediaType: 'application/pdf',
      isCover: false,
      thumbnailUrl: null,
    });

    const documentCoverResponse = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assets/${created.id}/attachments/${document.id}`,
      headers: { cookie },
      payload: { isCover: true },
    });
    expect(documentCoverResponse.statusCode).toBe(409);

    const secondPhotoResponse = await upload('侧面.png', 'image/png', png);
    const secondPhoto = assetAttachmentSchema.parse(secondPhotoResponse.json());
    const setCoverResponse = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assets/${created.id}/attachments/${secondPhoto.id}`,
      headers: { cookie },
      payload: { isCover: true, caption: '侧面细节' },
    });
    expect(setCoverResponse.statusCode).toBe(200);
    expect(assetAttachmentSchema.parse(setCoverResponse.json())).toMatchObject({
      isCover: true,
      caption: '侧面细节',
    });

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${created.id}`,
      headers: { cookie },
    });
    const detail = assetDetailSchema.parse(detailResponse.json());
    expect(detail.attachments).toHaveLength(3);
    expect(detail.coverAttachment?.id).toBe(secondPhoto.id);
    expect(
      detail.attachments.find((attachment) => attachment.id === firstPhoto.id)?.isCover,
    ).toBe(false);

    const invalidResponse = await upload(
      'script.svg',
      'image/svg+xml',
      Buffer.from('<svg onload="alert(1)"></svg>'),
    );
    expect(invalidResponse.statusCode).toBe(415);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${created.id}/attachments/${secondPhoto.id}`,
      headers: { cookie },
    });
    expect(deleteResponse.statusCode).toBe(204);

    const afterDeleteResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${created.id}`,
      headers: { cookie },
    });
    const afterDelete = assetDetailSchema.parse(afterDeleteResponse.json());
    expect(afterDelete.coverAttachment?.id).toBe(firstPhoto.id);
    expect(afterDelete.attachments).toHaveLength(2);

    const deletedContent = await app.inject({
      method: 'GET',
      url: secondPhoto.contentUrl,
      headers: { cookie },
    });
    expect(deletedContent.statusCode).toBe(404);

    await app.close();
  });

  it('manages custom categories and calculation-safe lifecycle statuses', async () => {
    if (!database) throw new Error('TEST_DATABASE_URL is required.');

    const app = await buildApp(testConfig, { db: database.db });
    const today = currentDateInTimeZone('Asia/Shanghai');
    const initialized = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'chronicle',
        password: 'correct-horse-battery-staple',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    const cookie = sessionCookie(initialized);

    const categoryResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: { cookie },
      payload: { name: '咖啡器具', color: '#92400e' },
    });
    expect(categoryResponse.statusCode).toBe(201);
    const category = categorySchema.parse(categoryResponse.json());
    expect(category.isSystem).toBe(false);

    const statusResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/asset-statuses',
      headers: { cookie },
      payload: {
        name: '季节性收纳',
        countsTowardService: false,
        ownershipState: 'held',
      },
    });
    expect(statusResponse.statusCode).toBe(201);
    const status = assetStatusSchema.parse(statusResponse.json());
    expect(status).toMatchObject({
      isSystem: false,
      countsTowardService: false,
      ownershipState: 'held',
    });

    const updatedStatus = assetStatusSchema.parse(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/asset-statuses/${status.id}`,
          headers: { cookie },
          payload: { name: '收藏收纳' },
        })
      ).json(),
    );
    expect(updatedStatus.name).toBe('收藏收纳');

    const assetResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { cookie },
      payload: {
        name: '手冲壶',
        categoryId: category.id,
        acquisitionType: 'gift',
        acquisitionDate: today,
        costKnowledge: 'known_zero',
        initialStatusId: status.id,
        tagIds: [],
      },
    });
    expect(assetResponse.statusCode).toBe(201);
    const asset = assetDetailSchema.parse(assetResponse.json());

    const financialAdded = assetDetailSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/assets/${asset.id}/financial-events`,
          headers: { cookie },
          payload: {
            type: 'other',
            direction: 'outflow',
            amountMinor: '100',
            currency: 'CNY',
            occurredOn: today,
            includeInNetCost: true,
            note: '测试待更正费用',
          },
        })
      ).json(),
    );
    const originalFinancial = financialAdded.financialEvents.find(
      (event) => event.note === '测试待更正费用',
    );
    if (!originalFinancial) throw new Error('Expected financial event.');
    const financialCorrected = assetDetailSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/assets/${asset.id}/financial-events/${originalFinancial.id}/correct`,
          headers: { cookie },
          payload: {
            reason: '录入金额错误',
            replacement: {
              type: 'other',
              direction: 'outflow',
              amountMinor: '150',
              currency: 'CNY',
              occurredOn: today,
              includeInNetCost: true,
              note: '更正后的费用',
            },
          },
        })
      ).json(),
    );
    expect(financialCorrected.metrics.netCostMinor).toBe('150');
    expect(
      financialCorrected.financialEvents.find(
        (event) => event.id === originalFinancial.id,
      ),
    ).toMatchObject({ voidReason: '录入金额错误' });
    expect(
      financialCorrected.financialEvents.find(
        (event) => event.correctionOfId === originalFinancial.id,
      )?.amountMinor,
    ).toBe('150');

    const originalLifecycle = financialCorrected.lifecycleEvents.find(
      (event) => event.voidedAt === null,
    );
    if (!originalLifecycle) throw new Error('Expected lifecycle event.');
    const lifecycleCorrected = assetDetailSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/assets/${asset.id}/lifecycle-events/${originalLifecycle.id}/correct`,
          headers: { cookie },
          payload: {
            reason: '补充审计更正',
            replacement: {
              statusId: status.id,
              effectiveDate: today,
              note: '更正后的状态记录',
            },
          },
        })
      ).json(),
    );
    expect(
      lifecycleCorrected.lifecycleEvents.find(
        (event) => event.id === originalLifecycle.id,
      )?.voidReason,
    ).toBe('补充审计更正');
    expect(
      lifecycleCorrected.lifecycleEvents.find(
        (event) => event.correctionOfId === originalLifecycle.id,
      )?.note,
    ).toBe('更正后的状态记录');

    const usedCategoryDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/categories/${category.id}`,
      headers: { cookie },
    });
    expect(usedCategoryDelete.statusCode).toBe(409);
    const usedStatusDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/asset-statuses/${status.id}`,
      headers: { cookie },
    });
    expect(usedStatusDelete.statusCode).toBe(409);

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${asset.id}`,
      headers: { cookie },
    });
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${asset.id}/permanent`,
      headers: { cookie },
      payload: { confirmPermanentDelete: true, assetName: asset.name },
    });
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/categories/${category.id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/asset-statuses/${status.id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);

    const listedCategories = categorySchema.array().parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/categories',
          headers: { cookie },
        })
      ).json(),
    );
    const listedStatuses = assetStatusSchema.array().parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/asset-statuses',
          headers: { cookie },
        })
      ).json(),
    );
    expect(listedCategories.some((entry) => entry.id === category.id)).toBe(false);
    expect(listedStatuses.some((entry) => entry.id === status.id)).toBe(false);

    await app.close();
  });

  it('creates multi-item orders with exact allocations and independent accessory links', async () => {
    if (!database) throw new Error('TEST_DATABASE_URL is required.');

    const app = await buildApp(testConfig, { db: database.db });
    const today = currentDateInTimeZone('Asia/Shanghai');
    const initialized = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'chronicle',
        password: 'correct-horse-battery-staple',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    const cookie = sessionCookie(initialized);

    const [categoriesResponse, statusesResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/categories', headers: { cookie } }),
      app.inject({ method: 'GET', url: '/api/v1/asset-statuses', headers: { cookie } }),
    ]);
    const [category] = categorySchema.array().parse(categoriesResponse.json());
    const inUse = assetStatusSchema
      .array()
      .parse(statusesResponse.json())
      .find((status) => status.code === 'in_use');
    if (!category || !inUse) throw new Error('Expected default catalogs.');

    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/orders' });
    expect(unauthorized.statusCode).toBe(401);

    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { cookie },
      payload: {
        merchant: '键鼠商店',
        orderNumber: 'ORDER-2026-001',
        orderedOn: today,
        currency: 'CNY',
        discountMinor: '1000',
        shippingMinor: '301',
        taxMinor: '0',
        feeMinor: '99',
        allocationMethod: 'proportional',
        note: '组合订单',
        items: [
          {
            name: '机械键盘',
            categoryId: category.id,
            initialStatusId: inUse.id,
            listedPriceMinor: '6000',
            tagIds: [],
          },
          {
            name: '无线鼠标',
            categoryId: category.id,
            initialStatusId: inUse.id,
            listedPriceMinor: '4000',
            tagIds: [],
          },
        ],
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const order = purchaseOrderDetailSchema.parse(createdResponse.json());
    expect(order).toMatchObject({
      subtotalMinor: '10000',
      totalPaidMinor: '9400',
      itemCount: 2,
      allocationMethod: 'proportional',
    });
    expect(order.items.map((item) => item.allocatedAmountMinor)).toEqual([
      '5640',
      '3760',
    ]);
    expect(
      order.items.reduce((sum, item) => sum + BigInt(item.allocatedAmountMinor), 0n),
    ).toBe(BigInt(order.totalPaidMinor));
    expect(
      order.items.reduce((sum, item) => sum + BigInt(item.allocatedDiscountMinor), 0n),
    ).toBe(BigInt(order.discountMinor));
    expect(
      order.items.reduce((sum, item) => sum + BigInt(item.allocatedShippingMinor), 0n),
    ).toBe(BigInt(order.shippingMinor));

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/orders',
      headers: { cookie },
    });
    expect(purchaseOrderListSchema.parse(listResponse.json())).toHaveLength(1);

    const [keyboardItem, mouseItem] = order.items;
    if (!keyboardItem || !mouseItem) throw new Error('Expected two order items.');
    const [keyboardResponse, mouseResponse] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/v1/assets/${keyboardItem.asset.id}`,
        headers: { cookie },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/assets/${mouseItem.asset.id}`,
        headers: { cookie },
      }),
    ]);
    expect(assetDetailSchema.parse(keyboardResponse.json()).metrics.netCostMinor).toBe(
      keyboardItem.allocatedAmountMinor,
    );
    expect(assetDetailSchema.parse(mouseResponse.json()).metrics.netCostMinor).toBe(
      mouseItem.allocatedAmountMinor,
    );

    const relationshipResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${mouseItem.asset.id}/relationships`,
      headers: { cookie },
      payload: {
        relatedAssetId: keyboardItem.asset.id,
        type: 'belongs_to',
        note: '鼠标作为键盘工作站配件',
      },
    });
    expect(relationshipResponse.statusCode).toBe(201);
    const relationship = assetRelationshipSchema.parse(relationshipResponse.json());
    expect(relationship).toMatchObject({
      role: 'source',
      type: 'belongs_to',
      relatedAsset: { id: keyboardItem.asset.id },
    });

    const parentDetailResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${keyboardItem.asset.id}`,
      headers: { cookie },
    });
    expect(
      assetDetailSchema.parse(parentDetailResponse.json()).relationships[0],
    ).toMatchObject({
      id: relationship.id,
      role: 'target',
      relatedAsset: { id: mouseItem.asset.id },
    });

    const cycleResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${keyboardItem.asset.id}/relationships`,
      headers: { cookie },
      payload: { relatedAssetId: mouseItem.asset.id, type: 'belongs_to' },
    });
    expect(cycleResponse.statusCode).toBe(409);
    expect(cycleResponse.json()).toMatchObject({ code: 'RELATIONSHIP_CYCLE' });

    const deleteRelationshipResponse = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${keyboardItem.asset.id}/relationships/${relationship.id}`,
      headers: { cookie },
    });
    expect(deleteRelationshipResponse.statusCode).toBe(204);

    const foreignOrderResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { cookie },
      payload: {
        merchant: '海外商店',
        orderedOn: today,
        currency: 'USD',
        exchangeRate: '7.25',
        exchangeRateSource: 'manual',
        exchangeRateDate: today,
        allocationMethod: 'proportional',
        items: [
          {
            name: '外币配件 A',
            categoryId: category.id,
            initialStatusId: inUse.id,
            listedPriceMinor: '1',
            tagIds: [],
          },
          {
            name: '外币配件 B',
            categoryId: category.id,
            initialStatusId: inUse.id,
            listedPriceMinor: '1',
            tagIds: [],
          },
        ],
      },
    });
    expect(foreignOrderResponse.statusCode).toBe(201);
    const foreignOrder = purchaseOrderDetailSchema.parse(foreignOrderResponse.json());
    expect(foreignOrder).toMatchObject({
      currency: 'USD',
      totalPaidMinor: '2',
      baseTotalPaidMinor: '15',
      baseCurrency: 'CNY',
      exchangeRate: '7.25',
      exchangeRateSource: 'manual',
    });
    const foreignAssets = await Promise.all(
      foreignOrder.items.map((line) =>
        app.inject({
          method: 'GET',
          url: `/api/v1/assets/${line.asset.id}`,
          headers: { cookie },
        }),
      ),
    );
    expect(
      foreignAssets.reduce((sum, response) => {
        const detail = assetDetailSchema.parse(response.json());
        return sum + BigInt(detail.financialEvents[0]?.baseAmountMinor ?? '0');
      }, 0n),
    ).toBe(15n);

    const invalidManualResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { cookie },
      payload: {
        orderedOn: today,
        currency: 'CNY',
        allocationMethod: 'manual',
        items: [
          {
            name: '错误分摊 A',
            categoryId: category.id,
            initialStatusId: inUse.id,
            listedPriceMinor: '100',
            allocatedAmountMinor: '40',
            tagIds: [],
          },
          {
            name: '错误分摊 B',
            categoryId: category.id,
            initialStatusId: inUse.id,
            listedPriceMinor: '100',
            allocatedAmountMinor: '40',
            tagIds: [],
          },
        ],
      },
    });
    expect(invalidManualResponse.statusCode).toBe(400);

    if (!mouseItem.asset.id) throw new Error('Expected an active order asset.');
    const softDeleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${mouseItem.asset.id}`,
      headers: { cookie },
    });
    expect(softDeleteResponse.statusCode).toBe(204);
    const recycled = recycleBinSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/assets/recycle-bin',
          headers: { cookie },
        })
      ).json(),
    );
    expect(recycled.items).toHaveLength(1);
    expect(recycled.items[0]?.name).toBe('无线鼠标');

    const restoredResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${mouseItem.asset.id}/restore`,
      headers: { cookie },
      payload: {},
    });
    expect(restoredResponse.statusCode).toBe(200);
    expect(assetDetailSchema.parse(restoredResponse.json()).name).toBe('无线鼠标');

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${mouseItem.asset.id}`,
      headers: { cookie },
    });
    const mismatchedDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${mouseItem.asset.id}/permanent`,
      headers: { cookie },
      payload: { confirmPermanentDelete: true, assetName: '错误名称' },
    });
    expect(mismatchedDelete.statusCode).toBe(400);
    const permanentDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${mouseItem.asset.id}/permanent`,
      headers: { cookie },
      payload: { confirmPermanentDelete: true, assetName: '无线鼠标' },
    });
    expect(permanentDelete.statusCode).toBe(204);
    const preservedOrder = purchaseOrderDetailSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/orders/${order.id}`,
          headers: { cookie },
        })
      ).json(),
    );
    const deletedLine = preservedOrder.items.find(
      (item) => item.asset.name === '无线鼠标',
    );
    expect(deletedLine?.asset.id).toBeNull();

    await app.close();
  });

  it('creates recurring reminders, protects channel secrets, and handles occurrence actions', async () => {
    if (!database) throw new Error('TEST_DATABASE_URL is required.');

    const app = await buildApp(testConfig, { db: database.db });
    const today = currentDateInTimeZone('Asia/Shanghai');
    const initialized = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'chronicle',
        password: 'correct-horse-battery-staple',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    const cookie = sessionCookie(initialized);
    const [categoriesResponse, statusesResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/categories', headers: { cookie } }),
      app.inject({ method: 'GET', url: '/api/v1/asset-statuses', headers: { cookie } }),
    ]);
    const category = categorySchema.array().parse(categoriesResponse.json())[0];
    const inUse = assetStatusSchema
      .array()
      .parse(statusesResponse.json())
      .find((status) => status.code === 'in_use');
    if (!category || !inUse) throw new Error('Expected seeded catalogs.');

    const assetResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { cookie },
      payload: {
        name: '提醒测试相机',
        categoryId: category.id,
        acquisitionType: 'gift',
        acquisitionDate: today,
        costKnowledge: 'known_zero',
        initialStatusId: inUse.id,
        tagIds: [],
      },
    });
    const asset = assetDetailSchema.parse(assetResponse.json());

    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/reminders' });
    expect(unauthorized.statusCode).toBe(401);

    const reminderResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/reminders',
      headers: { cookie },
      payload: {
        assetId: asset.id,
        kind: 'warranty_expiry',
        title: '相机保修到期',
        description: '检查延保或准备维修预算',
        trigger: { mode: 'date', dueDate: today, timeOfDay: '09:00' },
        recurrence: { kind: 'once' },
        leadMinutes: [0, 1_440],
        taskMode: 'actionable',
        repeatIntervalMinutes: 60,
        maxRepeats: 2,
        channelMode: 'none',
        channelKeys: [],
      },
    });
    expect(reminderResponse.statusCode).toBe(201);
    const reminder = reminderDetailSchema.parse(reminderResponse.json());
    expect(reminder).toMatchObject({
      kind: 'warranty_expiry',
      recurrenceKind: 'once',
      taskMode: 'actionable',
      channelMode: 'none',
      leadMinutes: [1_440, 0],
      occurrences: [],
    });

    const recurringResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/reminders',
      headers: { cookie },
      payload: {
        title: '每月清洁镜头',
        trigger: { mode: 'date', dueDate: today, timeOfDay: '10:00' },
        recurrence: {
          kind: 'recurring',
          frequency: 'month',
          interval: 1,
          endsOn: '2027-12-31',
        },
        channelMode: 'default',
      },
    });
    expect(recurringResponse.statusCode).toBe(201);
    expect(reminderDetailSchema.parse(recurringResponse.json())).toMatchObject({
      recurrenceKind: 'recurring',
      frequency: 'month',
      recurrenceInterval: 1,
      endsOn: '2027-12-31',
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/reminders',
      headers: { cookie },
    });
    expect(reminderListSchema.parse(listResponse.json())).toHaveLength(2);

    const invalidRecurring = await app.inject({
      method: 'POST',
      url: '/api/v1/reminders',
      headers: { cookie },
      payload: {
        title: '没有边界的周期提醒',
        trigger: { mode: 'date', dueDate: today },
        recurrence: { kind: 'recurring', frequency: 'day', interval: 1 },
        channelMode: 'none',
      },
    });
    expect(invalidRecurring.statusCode).toBe(400);

    const [createdOccurrence] = await database.db
      .insert(reminderOccurrences)
      .values({
        reminderId: reminder.id,
        sequence: 0,
        dueAt: new Date(),
      })
      .returning({ id: reminderOccurrences.id });
    if (!createdOccurrence) throw new Error('Expected occurrence fixture.');

    const snoozedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/reminder-occurrences/${createdOccurrence.id}/snooze`,
      headers: { cookie },
      payload: { durationMinutes: 60 },
    });
    expect(snoozedResponse.statusCode).toBe(200);
    expect(reminderOccurrenceSchema.parse(snoozedResponse.json())).toMatchObject({
      id: createdOccurrence.id,
      status: 'pending',
      repeatCount: 0,
    });

    const acknowledgedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/reminder-occurrences/${createdOccurrence.id}/acknowledge`,
      headers: { cookie },
    });
    expect(acknowledgedResponse.statusCode).toBe(200);
    expect(reminderOccurrenceSchema.parse(acknowledgedResponse.json()).status).toBe(
      'acknowledged',
    );

    const duplicateActionResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/reminder-occurrences/${createdOccurrence.id}/dismiss`,
      headers: { cookie },
    });
    expect(duplicateActionResponse.statusCode).toBe(409);

    const channelsResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/notification-channels',
      headers: { cookie },
    });
    expect(channelsResponse.statusCode).toBe(200);
    expect(channelsResponse.json()).toEqual([]);

    const secretWithoutMasterKey = await app.inject({
      method: 'POST',
      url: '/api/v1/notification-channels',
      headers: { cookie },
      payload: {
        provider: 'webhook',
        name: '不能保存的 Webhook',
        url: 'https://example.com/chronicle-hook',
        secret: 'not-in-database',
      },
    });
    expect(secretWithoutMasterKey.statusCode).toBe(422);

    await app.close();
  });

  it('records manual wishlist prices, private images, links, and conversion provenance', async () => {
    if (!database) throw new Error('TEST_DATABASE_URL is required.');

    const app = await buildApp(testConfig, { db: database.db });
    const today = currentDateInTimeZone('Asia/Shanghai');
    const initialized = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'chronicle',
        password: 'correct-horse-battery-staple',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    const cookie = sessionCookie(initialized);
    const [categoriesResponse, statusesResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/categories', headers: { cookie } }),
      app.inject({ method: 'GET', url: '/api/v1/asset-statuses', headers: { cookie } }),
    ]);
    const category = categorySchema.array().parse(categoriesResponse.json())[0];
    const inUse = assetStatusSchema
      .array()
      .parse(statusesResponse.json())
      .find((status) => status.code === 'in_use');
    if (!category || !inUse) throw new Error('Expected seeded catalogs.');

    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/wishlist' });
    expect(unauthorized.statusCode).toBe(401);

    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/wishlist',
      headers: { cookie },
      payload: {
        name: '机械键盘',
        categoryId: category.id,
        description: '等合适价格再买',
        currency: 'CNY',
        currentPriceMinor: '129900',
        currentPriceObservedOn: today,
        targetPriceMinor: '99900',
        budgetMinor: '140000',
        priority: 'high',
        plannedPurchaseDate: today,
        links: [
          { marketplace: '品牌官网', url: 'https://example.com/keyboard' },
          { marketplace: '二手平台', url: 'https://example.com/used-keyboard' },
        ],
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = wishlistItemDetailSchema.parse(createdResponse.json());
    expect(created).toMatchObject({
      name: '机械键盘',
      currentPriceMinor: '129900',
      priority: 'high',
      linkCount: 2,
      snapshotCount: 1,
      status: 'active',
    });
    expect(created.links).toHaveLength(2);
    expect(created.priceSnapshots).toHaveLength(1);

    const priceResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/wishlist/${created.id}/prices`,
      headers: { cookie },
      payload: {
        amountMinor: '109900',
        observedOn: today,
        marketplaceLinkId: created.links[1]?.id,
        note: '限时活动价',
      },
    });
    expect(priceResponse.statusCode).toBe(201);
    expect(wishlistPriceSnapshotSchema.parse(priceResponse.json())).toMatchObject({
      amountMinor: '109900',
      marketplace: '二手平台',
    });

    const png = await sharp({
      create: {
        width: 32,
        height: 20,
        channels: 3,
        background: { r: 78, g: 112, b: 91 },
      },
    })
      .png()
      .toBuffer();
    const boundary = '----chronicle-wishlist-image';
    const imageResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/wishlist/${created.id}/image`,
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartFile(boundary, 'keyboard.png', 'image/png', png),
    });
    expect(imageResponse.statusCode).toBe(201);
    const image = wishlistImageSchema.parse(imageResponse.json());
    expect(image).toMatchObject({ mediaType: 'image/png', width: 32, height: 20 });
    const privateImage = await app.inject({
      method: 'GET',
      url: image.thumbnailUrl,
    });
    expect(privateImage.statusCode).toBe(401);
    const thumbnail = await app.inject({
      method: 'GET',
      url: image.thumbnailUrl,
      headers: { cookie },
    });
    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.headers['content-type']).toBe('image/webp');

    const conversionResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/wishlist/${created.id}/convert`,
      headers: { cookie },
      payload: {
        acquisitionDate: today,
        costKnowledge: 'known_amount',
        paidPriceMinor: '105000',
        initialStatusId: inUse.id,
        tagIds: [],
      },
    });
    expect(conversionResponse.statusCode).toBe(201);
    const conversion = wishlistConversionResultSchema.parse(conversionResponse.json());
    expect(conversion.wishlistItem).toMatchObject({
      id: created.id,
      status: 'converted',
      currentPriceMinor: '109900',
      snapshotCount: 2,
    });
    expect(conversion.wishlistItem.priceSnapshots).toHaveLength(2);

    const convertedAssetResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${conversion.assetId}`,
      headers: { cookie },
    });
    const convertedAsset = assetDetailSchema.parse(convertedAssetResponse.json());
    expect(convertedAsset).toMatchObject({
      name: '机械键盘',
      acquisitionType: 'purchase',
      costKnowledge: 'known_amount',
    });
    expect(convertedAsset.financialEvents[0]?.baseAmountMinor).toBe('105000');

    const activeList = wishlistItemListSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/wishlist?status=active',
          headers: { cookie },
        })
      ).json(),
    );
    expect(activeList.total).toBe(0);
    const convertedList = wishlistItemListSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/wishlist?status=converted',
          headers: { cookie },
        })
      ).json(),
    );
    expect(convertedList.items[0]?.convertedAsset?.id).toBe(conversion.assetId);

    const duplicateConversion = await app.inject({
      method: 'POST',
      url: `/api/v1/wishlist/${created.id}/convert`,
      headers: { cookie },
      payload: {
        acquisitionDate: today,
        costKnowledge: 'known_zero',
        initialStatusId: inUse.id,
        tagIds: [],
      },
    });
    expect(duplicateConversion.statusCode).toBe(409);

    await app.close();
  });

  it('creates an authenticated portable ZIP export without secrets', async () => {
    if (!database) {
      throw new Error('TEST_DATABASE_URL is required.');
    }

    const app = await buildApp(testConfig, { db: database.db });
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/api/v1/exports/portable',
    });
    expect(unauthorized.statusCode).toBe(401);

    const initialized = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'export-admin',
        password: 'correct-horse-battery-staple',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    const cookie = sessionCookie(initialized);
    const [categoriesResponse, statusesResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/categories', headers: { cookie } }),
      app.inject({ method: 'GET', url: '/api/v1/asset-statuses', headers: { cookie } }),
    ]);
    const category = categorySchema.array().parse(categoriesResponse.json())[0];
    const inUse = assetStatusSchema
      .array()
      .parse(statusesResponse.json())
      .find((status) => status.code === 'in_use');
    if (!category || !inUse) {
      throw new Error('Expected seeded catalogs.');
    }

    const createdAssetResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { cookie },
      payload: {
        name: '导出测试物品',
        categoryId: category.id,
        acquisitionType: 'gift',
        acquisitionDate: currentDateInTimeZone('Asia/Shanghai'),
        costKnowledge: 'known_zero',
        initialStatusId: inUse.id,
        tagIds: [],
      },
    });
    const createdAsset = assetDetailSchema.parse(createdAssetResponse.json());
    const png = await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 3,
        background: { r: 82, g: 112, b: 91 },
      },
    })
      .png()
      .toBuffer();
    const boundary = `chronicle-export-${crypto.randomUUID()}`;
    const uploadedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${createdAsset.id}/attachments`,
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartFile(boundary, 'export-photo.png', 'image/png', png),
    });
    expect(uploadedResponse.statusCode).toBe(201);
    const uploaded = assetAttachmentSchema.parse(uploadedResponse.json());

    const subscriptionResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions',
      headers: { cookie },
      payload: {
        kind: 'subscription',
        name: '归档测试订阅',
        status: 'active',
        billingCycle: 'monthly',
        currency: 'CNY',
        amountMinor: '8800',
        startedOn: currentDateInTimeZone('Asia/Shanghai'),
      },
    });
    expect(subscriptionResponse.statusCode).toBe(201);
    const subscription = subscriptionDetailSchema.parse(subscriptionResponse.json());
    const chargeResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/subscriptions/${subscription.id}/charges`,
      headers: { cookie },
      payload: {
        kind: 'actual',
        status: 'succeeded',
        amountMinor: '8800',
        occurredOn: currentDateInTimeZone('Asia/Shanghai'),
      },
    });
    expect(chargeResponse.statusCode).toBe(201);

    const valuationRunResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${createdAsset.id}/valuations/runs`,
      headers: { cookie },
      payload: { confirmOutboundSummary: true },
    });
    expect(valuationRunResponse.statusCode).toBe(201);
    const valuationReport = valuationReportSchema.parse(valuationRunResponse.json());
    const valuationConfirmResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${createdAsset.id}/valuations/reports/${valuationReport.id}/confirm`,
      headers: { cookie },
      payload: { note: '归档恢复测试' },
    });
    expect(valuationConfirmResponse.statusCode).toBe(200);
    const valuationScheduleResponse = await app.inject({
      method: 'PUT',
      url: `/api/v1/assets/${createdAsset.id}/valuations/schedule`,
      headers: { cookie },
      payload: { cadence: 'monthly', enabled: true },
    });
    expect(valuationScheduleResponse.statusCode).toBe(200);

    const exported = await app.inject({
      method: 'POST',
      url: '/api/v1/exports/portable',
      headers: { cookie },
    });

    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toBe('application/zip');
    expect(exported.headers['content-disposition']).toMatch(
      /^attachment; filename="chronicle-export-v1-\d{8}\.zip"$/u,
    );
    expect(exported.rawPayload.subarray(0, 4)).toEqual(Buffer.from('PK\u0003\u0004'));
    const archiveText = exported.rawPayload.toString('latin1');
    expect(archiveText).toContain('manifest.json');
    expect(archiveText).toContain('records/chronicle.json');
    expect(archiveText).toContain('csv/assets.csv');
    expect(archiveText).toContain(
      `attachments/assets/${createdAsset.id}/${uploaded.id}-export-photo.png`,
    );
    expect(archiveText).toContain(
      `attachments/assets/${createdAsset.id}/${uploaded.id}.thumbnail.webp`,
    );
    expect(archiveText).not.toContain('secretCiphertext');
    expect(archiveText).not.toContain('passwordHash');

    const extraAssetResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { cookie },
      payload: {
        name: '导入前干扰物品',
        categoryId: category.id,
        acquisitionType: 'gift',
        acquisitionDate: currentDateInTimeZone('Asia/Shanghai'),
        costKnowledge: 'known_zero',
        initialStatusId: inUse.id,
        tagIds: [],
      },
    });
    expect(extraAssetResponse.statusCode).toBe(201);

    const previewBoundary = `chronicle-import-${crypto.randomUUID()}`;
    const previewResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/portable/preview',
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${previewBoundary}`,
      },
      payload: multipartFile(
        previewBoundary,
        'chronicle-export.zip',
        'application/zip',
        exported.rawPayload,
      ),
    });
    expect(previewResponse.statusCode).toBe(200);
    const preview = portableImportPreviewSchema.parse(previewResponse.json());
    expect(preview.canApply).toBe(true);
    expect(preview.archive.assets).toBe(1);
    expect(preview.archive.subscriptions).toBe(1);
    expect(preview.archive.subscriptionCharges).toBe(1);
    expect(preview.archive.valuationReports).toBe(1);
    expect(preview.archive.valuationSnapshots).toBe(1);
    expect(preview.archive.valuationSchedules).toBe(1);
    expect(preview.current.assets).toBe(2);
    expect(
      preview.conflicts.some((conflict) => conflict.code === 'TARGET_NOT_EMPTY'),
    ).toBe(true);

    const applyResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/portable/apply',
      headers: { cookie },
      payload: {
        importId: preview.importId,
        mode: 'replace',
        confirmReplace: true,
      },
    });
    expect(applyResponse.statusCode).toBe(200);
    const applied = portableImportResultSchema.parse(applyResponse.json());
    expect(applied.restored.assets).toBe(1);
    expect(applied.restored.attachmentFiles).toBe(1);
    expect(applied.restored.subscriptions).toBe(1);
    expect(applied.restored.subscriptionCharges).toBe(1);
    expect(applied.restored.valuationReports).toBe(1);
    expect(applied.restored.valuationSnapshots).toBe(1);
    expect(applied.restored.valuationSchedules).toBe(1);

    const restoredList = assetListSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/assets',
          headers: { cookie },
        })
      ).json(),
    );
    expect(restoredList.total).toBe(1);
    expect(restoredList.items[0]?.id).toBe(createdAsset.id);
    expect(restoredList.items[0]?.name).toBe('导出测试物品');

    const restoredDetail = assetDetailSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/assets/${createdAsset.id}`,
          headers: { cookie },
        })
      ).json(),
    );
    expect(restoredDetail.attachments).toHaveLength(1);
    const restoredAttachment = restoredDetail.attachments[0];
    if (!restoredAttachment) {
      throw new Error('Expected restored attachment.');
    }
    const restoredContent = await app.inject({
      method: 'GET',
      url: restoredAttachment.contentUrl,
      headers: { cookie },
    });
    expect(restoredContent.statusCode).toBe(200);
    expect(restoredContent.rawPayload.equals(png)).toBe(true);

    const restoredSubscriptions = subscriptionListSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/subscriptions',
          headers: { cookie },
        })
      ).json(),
    );
    expect(restoredSubscriptions.items).toHaveLength(1);
    expect(restoredSubscriptions.items[0]?.id).toBe(subscription.id);
    const restoredSubscription = subscriptionDetailSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/subscriptions/${subscription.id}`,
          headers: { cookie },
        })
      ).json(),
    );
    expect(restoredSubscription.charges).toHaveLength(1);

    const restoredReports = valuationReportListSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/assets/${createdAsset.id}/valuations/reports`,
          headers: { cookie },
        })
      ).json(),
    );
    const restoredSnapshots = valuationSnapshotListSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/assets/${createdAsset.id}/valuations/snapshots`,
          headers: { cookie },
        })
      ).json(),
    );
    const restoredSchedule = valuationScheduleSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/assets/${createdAsset.id}/valuations/schedule`,
          headers: { cookie },
        })
      ).json(),
    );
    expect(restoredReports.items).toHaveLength(1);
    expect(restoredSnapshots.items).toHaveLength(1);
    expect(restoredSchedule).toMatchObject({ cadence: 'monthly', enabled: true });

    await app.close();
  });

  it('keeps personal API tokens disabled by default and enforces scopes', async () => {
    if (!database) {
      throw new Error('TEST_DATABASE_URL is required.');
    }

    const app = await buildApp(testConfig, { db: database.db });
    const initialized = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'token-admin',
        password: 'correct-horse-battery-staple',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    const cookie = sessionCookie(initialized);

    const disabledCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/personal-access-tokens',
      headers: { cookie },
      payload: {
        name: 'wishlist automation',
        scopes: ['wishlist:write'],
      },
    });
    expect(disabledCreate.statusCode).toBe(409);

    const enabled = await app.inject({
      method: 'PATCH',
      url: '/api/v1/settings/personal-api',
      headers: { cookie },
      payload: { enabled: true },
    });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json()).toEqual({ enabled: true });

    const removedPriceScope = await app.inject({
      method: 'POST',
      url: '/api/v1/personal-access-tokens',
      headers: { cookie },
      payload: {
        name: 'obsolete price bot',
        scopes: ['prices:write'],
      },
    });
    expect(removedPriceScope.statusCode).toBe(400);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/personal-access-tokens',
      headers: { cookie },
      payload: {
        name: 'wishlist automation',
        scopes: ['wishlist:write'],
      },
    });
    expect(created.statusCode).toBe(201);
    const tokenPayload: { token: string; id: string; scopes: string[] } = created.json();
    expect(tokenPayload.token.startsWith('ct_')).toBe(true);
    expect(tokenPayload.scopes).toEqual(['wishlist:write']);

    const assetsDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/assets',
      headers: { authorization: `Bearer ${tokenPayload.token}` },
    });
    expect(assetsDenied.statusCode).toBe(403);

    const attachmentDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/assets/00000000-0000-4000-8000-000000000001/attachments',
      headers: { authorization: `Bearer ${tokenPayload.token}` },
    });
    expect([403, 404]).toContain(attachmentDenied.statusCode);

    const openapi = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(openapi.statusCode).toBe(200);
    const spec: {
      openapi?: string;
      info?: { title?: string; version?: string };
      tags?: Array<{ name: string }>;
      security?: unknown[];
      components?: { securitySchemes?: Record<string, unknown> };
      paths?: Record<string, unknown>;
    } = openapi.json();
    expect(spec.info?.title).toContain('Chronicle');
    expect(spec.components?.securitySchemes?.personalAccessToken).toBeTruthy();
    expect(spec.components?.securitySchemes?.sessionCookie).toBeTruthy();
    expect(Array.isArray(spec.security) && spec.security.length).toBeGreaterThan(0);
    expect(spec.tags?.some((tag) => tag.name === 'Personal API')).toBe(true);
    expect(spec.tags?.some((tag) => tag.name === 'Assets')).toBe(true);
    expect(spec.paths?.['/api/v1/assets']).toBeTruthy();
    expect(spec.paths?.['/api/v1/personal-access-tokens']).toBeTruthy();

    await app.close();
  });

  it('runs manual AI valuation with fixtures and adopts only after confirm', async () => {
    if (!database) {
      throw new Error('TEST_DATABASE_URL is required.');
    }

    const app = await buildApp(testConfig, { db: database.db });
    const initialized = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'valuation-admin',
        password: 'correct-horse-battery-staple',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    const cookie = sessionCookie(initialized);
    const [categoriesResponse, statusesResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/categories', headers: { cookie } }),
      app.inject({ method: 'GET', url: '/api/v1/asset-statuses', headers: { cookie } }),
    ]);
    const category = categorySchema.array().parse(categoriesResponse.json())[0];
    const inUse = assetStatusSchema
      .array()
      .parse(statusesResponse.json())
      .find((status) => status.code === 'in_use');
    if (!category || !inUse) throw new Error('Expected catalogs.');

    const created = assetDetailSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/assets',
          headers: { cookie },
          payload: {
            name: '估值测试相机',
            brand: 'Fujifilm',
            model: 'X100V',
            categoryId: category.id,
            acquisitionType: 'purchase',
            acquisitionDate: currentDateInTimeZone('Asia/Shanghai'),
            costKnowledge: 'known_amount',
            acquisitionAmountMinor: '800000',
            priceCurrency: 'CNY',
            initialStatusId: inUse.id,
            tagIds: [],
          },
        })
      ).json(),
    );

    const previewResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${created.id}/valuations/preview`,
      headers: { cookie },
    });
    expect(previewResponse.statusCode).toBe(200);
    const preview = valuationPreviewSchema.parse(previewResponse.json());
    expect(preview.outboundSummary.name).toBe('估值测试相机');
    expect(JSON.stringify(preview.outboundSummary)).not.toMatch(/serial|invoice/iu);
    expect(preview.providers.searchConfigured).toBe(true);
    expect(preview.providers.aiConfigured).toBe(true);

    const unconfirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/valuations/runs`,
      headers: { cookie },
      payload: {},
    });
    expect(unconfirmed.statusCode).toBe(400);

    const runResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/valuations/runs`,
      headers: { cookie },
      payload: { confirmOutboundSummary: true },
    });
    expect(runResponse.statusCode).toBe(201);
    const report = valuationReportSchema.parse(runResponse.json());
    expect(report.status).toBe('ready');
    expect(report.midMinor).toBeTruthy();
    expect(report.adoptedSnapshotId).toBeNull();

    const confirmResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${created.id}/valuations/reports/${report.id}/confirm`,
      headers: { cookie },
      payload: { note: '采用中位估值' },
    });
    expect(confirmResponse.statusCode).toBe(200);
    const confirmed = confirmValuationResultSchema.parse(confirmResponse.json());
    const adoptedReport = confirmed.report;
    const snapshot = confirmed.snapshot;
    expect(adoptedReport.status).toBe('adopted');
    expect(adoptedReport.adoptedSnapshotId).toBe(snapshot.id);
    expect(snapshot.valueMinor).toBe(report.midMinor);

    // Cash ledger metrics must remain independent of AI valuation.
    const detail = assetDetailSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/assets/${created.id}`,
          headers: { cookie },
        })
      ).json(),
    );
    expect(detail.metrics.netCostMinor).toBe('800000');

    const dashboard = dashboardSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/dashboard?periodDays=30',
          headers: { cookie },
        })
      ).json(),
    );
    expect(dashboard.adoptedValuationMinor).toBe(snapshot.valueMinor);
    expect(dashboard.valuedNetInvestmentMinor).toBe('800000');
    expect(dashboard.valuationDeltaMinor).toBe(
      (BigInt(snapshot.valueMinor) - 800000n).toString(),
    );
    expect(dashboard).toMatchObject({
      valuedItemCount: 1,
      valuationCoveragePercent: 100,
    });

    const scheduleResponse = await app.inject({
      method: 'PUT',
      url: `/api/v1/assets/${created.id}/valuations/schedule`,
      headers: { cookie },
      payload: { cadence: 'monthly', enabled: true },
    });
    expect(scheduleResponse.statusCode).toBe(200);
    expect(scheduleResponse.json()).toMatchObject({
      cadence: 'monthly',
      enabled: true,
    });

    const analyticsResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${created.id}/valuations/analytics`,
      headers: { cookie },
    });
    expect(analyticsResponse.statusCode).toBe(200);
    const analytics = valuationAnalyticsSchema.parse(analyticsResponse.json());
    expect(analytics.annualizedDepreciationRate).toBeNull();
    expect(Array.isArray(analytics.latestForecasts)).toBe(true);

    await app.close();
  });

  it('manages subscriptions and digital licenses without secrets', async () => {
    if (!database) throw new Error('TEST_DATABASE_URL is required.');

    const app = await buildApp(testConfig, { db: database.db });
    const initialized = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        username: 'sub-admin',
        password: 'correct-horse-battery-staple',
        timeZone: 'Asia/Shanghai',
        baseCurrency: 'CNY',
      },
    });
    const cookie = sessionCookie(initialized);

    const tagResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { cookie },
      payload: { name: '云服务', color: '#52705b' },
    });
    const subscriptionTag = tagSchema.parse(tagResponse.json());

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions',
      headers: { cookie },
      payload: {
        kind: 'subscription',
        name: 'iCloud+',
        vendor: 'Apple',
        billingCycle: 'monthly',
        amountMinor: '680',
        status: 'active',
        accountHint: 'me@example.com',
        nextBillingOn: currentDateInTimeZone('Asia/Shanghai'),
        tagIds: [subscriptionTag.id],
      },
    });
    expect(created.statusCode).toBe(201);
    const subscription = subscriptionDetailSchema.parse(created.json());
    expect(subscription.metrics.projectedMonthlyMinor).toBe('680');
    expect(subscription.metrics.projectedYearlyMinor).toBe('8160');
    expect(subscription).not.toHaveProperty('password');
    expect(subscription).not.toHaveProperty('licenseKey');
    expect(subscription.passwordManagerUrl).toBeNull();
    expect(subscription.tags).toHaveLength(1);
    expect(subscription.tags[0]?.id).toBe(subscriptionTag.id);

    const subscriptionReminder = await app.inject({
      method: 'POST',
      url: '/api/v1/reminders',
      headers: { cookie },
      payload: {
        subscriptionId: subscription.id,
        kind: 'renewal',
        title: 'iCloud+ 续期',
        trigger: {
          mode: 'date',
          dueDate: currentDateInTimeZone('Asia/Shanghai'),
          timeOfDay: '09:00',
        },
        recurrence: { kind: 'once' },
        leadMinutes: [0],
        taskMode: 'notification',
        repeatIntervalMinutes: 1440,
        maxRepeats: 0,
        channelMode: 'none',
        channelKeys: [],
      },
    });
    expect(subscriptionReminder.statusCode).toBe(201);
    expect(reminderDetailSchema.parse(subscriptionReminder.json()).subscription?.id).toBe(
      subscription.id,
    );

    const subscriptionPng = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 82, g: 112, b: 91, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const subscriptionAttachmentBoundary = `subscription-attachment-${crypto.randomUUID()}`;
    const subscriptionAttachmentResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/subscriptions/${subscription.id}/attachments`,
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${subscriptionAttachmentBoundary}`,
      },
      payload: multipartFile(
        subscriptionAttachmentBoundary,
        'invoice.png',
        'image/png',
        subscriptionPng,
      ),
    });
    expect(subscriptionAttachmentResponse.statusCode).toBe(201);

    const charge = await app.inject({
      method: 'POST',
      url: `/api/v1/subscriptions/${subscription.id}/charges`,
      headers: { cookie },
      payload: {
        kind: 'actual',
        status: 'succeeded',
        amountMinor: '680',
        occurredOn: currentDateInTimeZone('Asia/Shanghai'),
      },
    });
    expect(charge.statusCode).toBe(201);

    const license = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions',
      headers: { cookie },
      payload: {
        kind: 'digital_license',
        name: 'Final Cut Pro',
        billingCycle: 'one_time',
        amountMinor: '198800',
        seats: 1,
      },
    });
    expect(license.statusCode).toBe(201);

    const list = subscriptionListSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/subscriptions',
          headers: { cookie },
        })
      ).json(),
    );
    expect(list.items.length).toBe(2);
    expect(list.totals.activeCount).toBeGreaterThanOrEqual(1);
    expect(BigInt(list.totals.actualSpendMinor)).toBeGreaterThanOrEqual(680n);

    await app.close();
  });
});

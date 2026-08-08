import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { sql } from 'drizzle-orm';
import yauzl, { type Entry as ZipEntry } from 'yauzl';

import {
  exportManifestSchema,
  type ImportConflict,
  type ImportTableCount,
  type PortableImportPreview,
  type PortableImportResult,
} from '@thingcost/contracts';
import {
  appSettings,
  assetAttachments,
  assetRelationships,
  assets,
  assetStatuses,
  assetTags,
  categories,
  conditionDefects,
  conditionEvents,
  financialEvents,
  lifecycleEvents,
  loans,
  purchaseOrderItems,
  purchaseOrders,
  reminderDeliveries,
  reminderOccurrences,
  reminders,
  repairs,
  subscriptionAttachments,
  subscriptionCharges,
  subscriptionPriceChanges,
  subscriptionTags,
  subscriptions,
  tags,
  valuationReports,
  valuationSchedules,
  valuationSnapshots,
  wishlistImages,
  wishlistItems,
  wishlistMarketplaceLinks,
  wishlistPriceSnapshots,
  type Database,
} from '@thingcost/database';

import type { AttachmentStorage } from './attachment-storage.js';

const IMPORT_TTL_MS = 30 * 60 * 1000;
const IMPORT_ROOT = join(tmpdir(), 'chronicle-imports');

interface StagedImportMeta {
  importId: string;
  createdAt: string;
  expiresAt: string;
  archivePath: string;
  generatedAt: string;
  sourceGeneratedAt: string;
  archive: ImportTableCount;
  notes: string[];
  skippedNotificationChannels: number;
}

interface ChronicleRecords {
  format: string;
  version: number;
  generatedAt: string;
  settings: Array<{
    timeZone: string;
    baseCurrency: string;
    initializedAt: string | Date;
  }>;
  data: Record<string, unknown[]>;
}

interface ParsedArchive {
  manifestGeneratedAt: string;
  records: ChronicleRecords;
  files: Map<string, Buffer>;
}

export class PortableImportError extends Error {
  constructor(
    readonly code:
      | 'INVALID_ARCHIVE'
      | 'UNSUPPORTED_VERSION'
      | 'CHECKSUM_MISMATCH'
      | 'MISSING_ATTACHMENT'
      | 'IMPORT_EXPIRED'
      | 'IMPORT_NOT_FOUND'
      | 'REPLACE_NOT_CONFIRMED'
      | 'IMPORT_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'PortableImportError';
  }
}

function checksum(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> =>
      typeof row === 'object' && row !== null && !Array.isArray(row),
  );
}

function countFromRecords(records: ChronicleRecords): ImportTableCount {
  const data = records.data;
  return {
    categories: asRows(data.categories).length,
    assetStatuses: asRows(data.assetStatuses).length,
    tags: asRows(data.tags).length,
    assets: asRows(data.assets).length,
    financialEvents: asRows(data.financialEvents).length,
    lifecycleEvents: asRows(data.lifecycleEvents).length,
    purchaseOrders: asRows(data.purchaseOrders).length,
    assetAttachments: asRows(data.assetAttachments).length,
    reminders: asRows(data.reminders).length,
    wishlistItems: asRows(data.wishlistItems).length,
    valuationReports: asRows(data.valuationReports).length,
    valuationSnapshots: asRows(data.valuationSnapshots).length,
    valuationSchedules: asRows(data.valuationSchedules).length,
    subscriptions: asRows(data.subscriptions).length,
    subscriptionPriceChanges: asRows(data.subscriptionPriceChanges).length,
    subscriptionCharges: asRows(data.subscriptionCharges).length,
    subscriptionTags: asRows(data.subscriptionTags).length,
    subscriptionAttachments: asRows(data.subscriptionAttachments).length,
    attachmentFiles:
      asRows(data.assetAttachments).length +
      asRows(data.subscriptionAttachments).length +
      asRows(data.wishlistImages).length,
  };
}

async function currentCounts(db: Database): Promise<ImportTableCount> {
  const [
    categoryCount,
    statusCount,
    tagCount,
    assetCount,
    financialCount,
    lifecycleCount,
    orderCount,
    attachmentCount,
    reminderCount,
    wishlistCount,
    valuationReportCount,
    valuationSnapshotCount,
    valuationScheduleCount,
    subscriptionCount,
    subscriptionPriceChangeCount,
    subscriptionChargeCount,
    subscriptionTagCount,
    subscriptionAttachmentCount,
  ] = await Promise.all([
    db.select({ value: sql<number>`count(*)::int` }).from(categories),
    db.select({ value: sql<number>`count(*)::int` }).from(assetStatuses),
    db.select({ value: sql<number>`count(*)::int` }).from(tags),
    db.select({ value: sql<number>`count(*)::int` }).from(assets),
    db.select({ value: sql<number>`count(*)::int` }).from(financialEvents),
    db.select({ value: sql<number>`count(*)::int` }).from(lifecycleEvents),
    db.select({ value: sql<number>`count(*)::int` }).from(purchaseOrders),
    db.select({ value: sql<number>`count(*)::int` }).from(assetAttachments),
    db.select({ value: sql<number>`count(*)::int` }).from(reminders),
    db.select({ value: sql<number>`count(*)::int` }).from(wishlistItems),
    db.select({ value: sql<number>`count(*)::int` }).from(valuationReports),
    db.select({ value: sql<number>`count(*)::int` }).from(valuationSnapshots),
    db.select({ value: sql<number>`count(*)::int` }).from(valuationSchedules),
    db.select({ value: sql<number>`count(*)::int` }).from(subscriptions),
    db.select({ value: sql<number>`count(*)::int` }).from(subscriptionPriceChanges),
    db.select({ value: sql<number>`count(*)::int` }).from(subscriptionCharges),
    db.select({ value: sql<number>`count(*)::int` }).from(subscriptionTags),
    db.select({ value: sql<number>`count(*)::int` }).from(subscriptionAttachments),
  ]);

  return {
    categories: categoryCount[0]?.value ?? 0,
    assetStatuses: statusCount[0]?.value ?? 0,
    tags: tagCount[0]?.value ?? 0,
    assets: assetCount[0]?.value ?? 0,
    financialEvents: financialCount[0]?.value ?? 0,
    lifecycleEvents: lifecycleCount[0]?.value ?? 0,
    purchaseOrders: orderCount[0]?.value ?? 0,
    assetAttachments: attachmentCount[0]?.value ?? 0,
    reminders: reminderCount[0]?.value ?? 0,
    wishlistItems: wishlistCount[0]?.value ?? 0,
    valuationReports: valuationReportCount[0]?.value ?? 0,
    valuationSnapshots: valuationSnapshotCount[0]?.value ?? 0,
    valuationSchedules: valuationScheduleCount[0]?.value ?? 0,
    subscriptions: subscriptionCount[0]?.value ?? 0,
    subscriptionPriceChanges: subscriptionPriceChangeCount[0]?.value ?? 0,
    subscriptionCharges: subscriptionChargeCount[0]?.value ?? 0,
    subscriptionTags: subscriptionTagCount[0]?.value ?? 0,
    subscriptionAttachments: subscriptionAttachmentCount[0]?.value ?? 0,
    attachmentFiles:
      (attachmentCount[0]?.value ?? 0) + (subscriptionAttachmentCount[0]?.value ?? 0),
  };
}

function isBusinessEmpty(counts: ImportTableCount): boolean {
  return (
    counts.assets === 0 &&
    counts.financialEvents === 0 &&
    counts.lifecycleEvents === 0 &&
    counts.purchaseOrders === 0 &&
    counts.assetAttachments === 0 &&
    counts.reminders === 0 &&
    counts.wishlistItems === 0 &&
    counts.valuationReports === 0 &&
    counts.valuationSnapshots === 0 &&
    counts.valuationSchedules === 0 &&
    counts.subscriptions === 0 &&
    counts.subscriptionPriceChanges === 0 &&
    counts.subscriptionCharges === 0 &&
    counts.subscriptionTags === 0 &&
    counts.subscriptionAttachments === 0 &&
    counts.tags === 0
  );
}

async function extractZip(archivePath: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const zipfile = await yauzl.openPromise(archivePath, {
    lazyEntries: true,
    validateEntrySizes: true,
  });

  await new Promise<void>((resolve, reject) => {
    zipfile.on('error', reject);
    zipfile.on('end', () => resolve());
    zipfile.on('entry', (entry: ZipEntry) => {
      if (/\/$/u.test(entry.fileName)) {
        zipfile.readEntry();
        return;
      }

      zipfile.openReadStream(
        entry,
        (error: Error | null, readStream?: NodeJS.ReadableStream) => {
          if (error || !readStream) {
            reject(error ?? new Error(`Unable to read ${entry.fileName}`));
            return;
          }

          const chunks: Buffer[] = [];
          readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
          readStream.on('error', reject);
          readStream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zipfile.readEntry();
          });
        },
      );
    });
    zipfile.readEntry();
  });

  return files;
}

function parseRecords(content: Buffer): ChronicleRecords {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.toString('utf8'));
  } catch {
    throw new PortableImportError(
      'INVALID_ARCHIVE',
      '归档 records/chronicle.json 无法解析',
    );
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { format?: unknown }).format !== 'chronicle-records' ||
    (parsed as { version?: unknown }).version !== 1 ||
    typeof (parsed as { data?: unknown }).data !== 'object' ||
    (parsed as { data?: unknown }).data === null
  ) {
    throw new PortableImportError('UNSUPPORTED_VERSION', '不支持的记录格式或版本');
  }

  return parsed as ChronicleRecords;
}

async function parseArchive(archivePath: string): Promise<ParsedArchive> {
  const files = await extractZip(archivePath);
  const manifestBuffer = files.get('manifest.json');
  const recordsBuffer = files.get('records/chronicle.json');

  if (!manifestBuffer || !recordsBuffer) {
    throw new PortableImportError(
      'INVALID_ARCHIVE',
      '归档缺少 manifest.json 或 records/chronicle.json',
    );
  }

  const manifest = exportManifestSchema.safeParse(
    JSON.parse(manifestBuffer.toString('utf8')),
  );
  if (!manifest.success) {
    throw new PortableImportError('UNSUPPORTED_VERSION', '不支持的导出清单格式');
  }

  for (const entry of manifest.data.files) {
    const content = files.get(entry.path);
    if (!content) {
      throw new PortableImportError('MISSING_ATTACHMENT', `归档缺少文件 ${entry.path}`);
    }
    if (content.byteLength !== entry.sizeBytes || checksum(content) !== entry.sha256) {
      throw new PortableImportError('CHECKSUM_MISMATCH', `文件校验失败：${entry.path}`);
    }
  }

  const records = parseRecords(recordsBuffer);
  return {
    manifestGeneratedAt: manifest.data.generatedAt,
    records,
    files,
  };
}

function coerceValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (
    (key.endsWith('At') ||
      key === 'initializedAt' ||
      key === 'lockedAt' ||
      key === 'sentAt' ||
      key === 'snoozedUntil' ||
      key === 'lastNotifiedAt' ||
      key === 'resolvedAt' ||
      key === 'nextOccurrenceAt' ||
      key === 'nextAttemptAt' ||
      key === 'scheduledAt' ||
      key === 'dueAt' ||
      key === 'anchorAt' ||
      key === 'convertedAt' ||
      key === 'voidedAt' ||
      key === 'purgeAfter' ||
      key === 'deletedAt') &&
    typeof value === 'string'
  ) {
    return new Date(value);
  }

  if (
    (key.endsWith('Minor') ||
      key === 'originalPriceMinor' ||
      key === 'discountMinor' ||
      key === 'amountMinor' ||
      key === 'baseAmountMinor' ||
      key === 'sizeBytes') &&
    (typeof value === 'string' || typeof value === 'number')
  ) {
    if (key === 'sizeBytes') return Number(value);
    return BigInt(value);
  }

  return value;
}

function coerceRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] = coerceValue(key, value);
  }
  return result;
}

function attachmentArchivePath(
  kind: 'asset' | 'wishlist' | 'subscription',
  ownerId: string,
  id: string,
  originalName: string,
  thumbnail = false,
): string {
  if (thumbnail) {
    return kind === 'asset'
      ? `attachments/assets/${ownerId}/${id}.thumbnail.webp`
      : kind === 'wishlist'
        ? `attachments/wishlist/${ownerId}/${id}.thumbnail.webp`
        : `attachments/subscriptions/${ownerId}/${id}.thumbnail.webp`;
  }

  const safeName = originalName.replace(/[\\/]/gu, '_');
  return kind === 'asset'
    ? `attachments/assets/${ownerId}/${id}-${safeName}`
    : kind === 'wishlist'
      ? `attachments/wishlist/${ownerId}/${id}-${safeName}`
      : `attachments/subscriptions/${ownerId}/${id}-${safeName}`;
}

function findAttachmentBuffer(
  files: Map<string, Buffer>,
  kind: 'asset' | 'wishlist' | 'subscription',
  ownerId: string,
  id: string,
  originalName: string,
  thumbnail = false,
): Buffer | undefined {
  const preferred = attachmentArchivePath(kind, ownerId, id, originalName, thumbnail);
  if (files.has(preferred)) return files.get(preferred);

  const prefix = thumbnail
    ? kind === 'asset'
      ? `attachments/assets/${ownerId}/${id}.thumbnail.`
      : kind === 'wishlist'
        ? `attachments/wishlist/${ownerId}/${id}.thumbnail.`
        : `attachments/subscriptions/${ownerId}/${id}.thumbnail.`
    : kind === 'asset'
      ? `attachments/assets/${ownerId}/${id}-`
      : kind === 'wishlist'
        ? `attachments/wishlist/${ownerId}/${id}-`
        : `attachments/subscriptions/${ownerId}/${id}-`;

  for (const [path, content] of files) {
    if (path.startsWith(prefix)) return content;
  }
  return undefined;
}

async function writeMeta(meta: StagedImportMeta): Promise<void> {
  await mkdir(IMPORT_ROOT, { recursive: true, mode: 0o700 });
  await writeFile(join(IMPORT_ROOT, `${meta.importId}.json`), JSON.stringify(meta), {
    mode: 0o600,
  });
}

async function readMeta(importId: string): Promise<StagedImportMeta> {
  try {
    const raw = await readFile(join(IMPORT_ROOT, `${importId}.json`), 'utf8');
    return JSON.parse(raw) as StagedImportMeta;
  } catch {
    throw new PortableImportError('IMPORT_NOT_FOUND', '找不到导入会话，请重新上传归档');
  }
}

async function cleanupStage(importId: string, archivePath?: string): Promise<void> {
  await Promise.all([
    rm(join(IMPORT_ROOT, `${importId}.json`), { force: true }),
    archivePath ? rm(archivePath, { force: true }) : Promise.resolve(),
  ]);
}

export async function stagePortableImport(
  db: Database,
  archiveStream: NodeJS.ReadableStream,
): Promise<PortableImportPreview> {
  await mkdir(IMPORT_ROOT, { recursive: true, mode: 0o700 });
  const importId = randomUUID();
  const archivePath = join(IMPORT_ROOT, `${importId}.zip`);
  await pipeline(
    archiveStream,
    createWriteStream(archivePath, { flags: 'wx', mode: 0o600 }),
  );

  try {
    const parsed = await parseArchive(archivePath);
    const archive = countFromRecords(parsed.records);
    const current = await currentCounts(db);
    const notes = [
      '导入会保留当前管理员账号与登录会话。',
      '通知渠道密钥不在归档中，导入后需重新配置通知渠道。',
      'replace 模式会清空并覆盖当前业务数据与分类目录。',
    ];
    const skippedNotificationChannels = asRows(
      parsed.records.data.notificationChannels,
    ).length;
    if (skippedNotificationChannels > 0) {
      notes.push(
        `归档包含 ${String(skippedNotificationChannels)} 个通知渠道元数据，将因缺少密钥而跳过。`,
      );
    }

    const conflicts: ImportConflict[] = [];
    if (!isBusinessEmpty(current)) {
      conflicts.push({
        code: 'TARGET_NOT_EMPTY',
        severity: 'warning',
        message: '当前实例已有业务数据',
        detail: `现有物品 ${String(current.assets)} 件、订单 ${String(current.purchaseOrders)} 笔、种草 ${String(current.wishlistItems)} 条。replace 将全部覆盖。`,
      });
    }

    const existingAssetIds = new Set(
      (await db.select({ id: assets.id }).from(assets)).map((row) => row.id),
    );
    const importAssetIds = asRows(parsed.records.data.assets)
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string');
    const overlap = importAssetIds.filter((id) => existingAssetIds.has(id)).length;
    if (overlap > 0) {
      conflicts.push({
        code: 'ID_OVERLAP',
        severity: 'info',
        message: '存在相同物品 ID',
        detail: `${String(overlap)} 个物品 ID 与当前库重叠；replace 会先清空再写入。`,
      });
    }

    for (const attachment of asRows(parsed.records.data.assetAttachments)) {
      const id = attachment.id;
      const assetId = attachment.assetId;
      const originalName = attachment.originalName;
      if (
        typeof id !== 'string' ||
        typeof assetId !== 'string' ||
        typeof originalName !== 'string'
      ) {
        throw new PortableImportError('INVALID_ARCHIVE', '附件元数据不完整');
      }
      if (!findAttachmentBuffer(parsed.files, 'asset', assetId, id, originalName)) {
        conflicts.push({
          code: 'MISSING_ATTACHMENT',
          severity: 'blocking',
          message: `缺少物品附件 ${originalName}`,
        });
      }
      if (
        attachment.thumbnailStorageKey &&
        !findAttachmentBuffer(parsed.files, 'asset', assetId, id, originalName, true)
      ) {
        conflicts.push({
          code: 'MISSING_ATTACHMENT',
          severity: 'blocking',
          message: `缺少物品缩略图 ${originalName}`,
        });
      }
    }

    for (const image of asRows(parsed.records.data.wishlistImages)) {
      const id = image.id;
      const wishlistItemId = image.wishlistItemId;
      const originalName = image.originalName;
      if (
        typeof id !== 'string' ||
        typeof wishlistItemId !== 'string' ||
        typeof originalName !== 'string'
      ) {
        throw new PortableImportError('INVALID_ARCHIVE', '种草图片元数据不完整');
      }
      if (
        !findAttachmentBuffer(parsed.files, 'wishlist', wishlistItemId, id, originalName)
      ) {
        conflicts.push({
          code: 'MISSING_ATTACHMENT',
          severity: 'blocking',
          message: `缺少种草图片 ${originalName}`,
        });
      }
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + IMPORT_TTL_MS);
    const meta: StagedImportMeta = {
      importId,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      archivePath,
      generatedAt: createdAt.toISOString(),
      sourceGeneratedAt: parsed.manifestGeneratedAt,
      archive,
      notes,
      skippedNotificationChannels,
    };
    await writeMeta(meta);

    const canApply = !conflicts.some((conflict) => conflict.severity === 'blocking');
    return {
      importId,
      expiresAt: expiresAt.toISOString(),
      generatedAt: createdAt.toISOString(),
      source: {
        format: 'chronicle-export',
        version: 1,
        apiVersion: 'v1',
        generatedAt: parsed.manifestGeneratedAt,
      },
      archive,
      current,
      conflicts,
      canApply,
      modes: ['replace'],
      notes,
    };
  } catch (error) {
    await cleanupStage(importId, archivePath);
    throw error;
  }
}

async function bulkInsert(
  executor: {
    // drizzle transaction insert is structurally typed per table; keep dynamic here.
    insert: (table: never) => {
      values: (values: Array<Record<string, unknown>>) => Promise<unknown>;
    };
  },
  table: unknown,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  if (rows.length === 0) return;
  const chunkSize = 100;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize).map(coerceRow);
    await executor.insert(table as never).values(chunk);
  }
}

export async function applyPortableImport(
  db: Database,
  storage: AttachmentStorage,
  input: { importId: string; mode: 'replace'; confirmReplace: true },
): Promise<PortableImportResult> {
  if (input.mode !== 'replace' || input.confirmReplace !== true) {
    throw new PortableImportError(
      'REPLACE_NOT_CONFIRMED',
      '请确认以 replace 模式覆盖导入',
    );
  }

  const meta = await readMeta(input.importId);
  if (Date.parse(meta.expiresAt) < Date.now()) {
    await cleanupStage(meta.importId, meta.archivePath);
    throw new PortableImportError('IMPORT_EXPIRED', '导入会话已过期，请重新上传归档');
  }

  const parsed = await parseArchive(meta.archivePath);
  const data = parsed.records.data;
  const settings = parsed.records.settings[0];

  const reminderRows = asRows(data.reminders).map((row) => {
    const next = { ...row };
    if (next.channelMode === 'override') {
      next.channelMode = 'default';
      next.channelKeys = [];
    }
    return next;
  });
  const assetRows = asRows(data.assets);
  const categoryNames = new Map(
    asRows(data.categories).flatMap((row) =>
      typeof row.id === 'string' && typeof row.name === 'string'
        ? [[row.id, row.name] as const]
        : [],
    ),
  );
  const statusNames = new Map(
    asRows(data.assetStatuses).flatMap((row) =>
      typeof row.id === 'string' && typeof row.name === 'string'
        ? [[row.id, row.name] as const]
        : [],
    ),
  );
  const assetSnapshots = new Map(
    assetRows.flatMap((row) =>
      typeof row.id === 'string'
        ? [
            [
              row.id,
              {
                name: typeof row.name === 'string' ? row.name : '已删除物品',
                categoryName:
                  typeof row.categoryId === 'string'
                    ? (categoryNames.get(row.categoryId) ?? '已删除分类')
                    : '已删除分类',
                statusName:
                  typeof row.currentStatusId === 'string'
                    ? (statusNames.get(row.currentStatusId) ?? '已删除状态')
                    : '已删除状态',
              },
            ] as const,
          ]
        : [],
    ),
  );
  const orderItemRows = asRows(data.purchaseOrderItems).map((row) => {
    const snapshot =
      typeof row.assetId === 'string' ? assetSnapshots.get(row.assetId) : undefined;
    return {
      ...row,
      assetNameSnapshot:
        typeof row.assetNameSnapshot === 'string'
          ? row.assetNameSnapshot
          : (snapshot?.name ?? '已删除物品'),
      categoryNameSnapshot:
        typeof row.categoryNameSnapshot === 'string'
          ? row.categoryNameSnapshot
          : (snapshot?.categoryName ?? '已删除分类'),
      statusNameSnapshot:
        typeof row.statusNameSnapshot === 'string'
          ? row.statusNameSnapshot
          : (snapshot?.statusName ?? '已删除状态'),
    };
  });

  try {
    await db.transaction(async (transaction) => {
      await transaction.execute(sql`
        truncate table
          valuation_search_cache,
          valuation_snapshots,
          valuation_schedules,
          valuation_reports,
          subscription_charges,
          subscription_price_changes,
          subscription_tags,
          subscription_attachments,
          subscriptions,
          wishlist_price_snapshots,
          wishlist_marketplace_links,
          wishlist_images,
          wishlist_items,
          reminder_deliveries,
          reminder_occurrences,
          reminders,
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
          asset_statuses
        restart identity cascade
      `);

      await bulkInsert(transaction, categories, asRows(data.categories));
      await bulkInsert(transaction, assetStatuses, asRows(data.assetStatuses));
      await bulkInsert(transaction, tags, asRows(data.tags));
      await bulkInsert(transaction, assets, assetRows);
      await bulkInsert(transaction, assetTags, asRows(data.assetTags));
      await bulkInsert(transaction, lifecycleEvents, asRows(data.lifecycleEvents));
      await bulkInsert(transaction, financialEvents, asRows(data.financialEvents));
      await bulkInsert(transaction, conditionEvents, asRows(data.conditionEvents));
      await bulkInsert(transaction, conditionDefects, asRows(data.conditionDefects));
      await bulkInsert(transaction, loans, asRows(data.loans));
      await bulkInsert(transaction, repairs, asRows(data.repairs));
      await bulkInsert(transaction, purchaseOrders, asRows(data.purchaseOrders));
      await bulkInsert(transaction, purchaseOrderItems, orderItemRows);
      await bulkInsert(transaction, assetAttachments, asRows(data.assetAttachments));
      await bulkInsert(transaction, assetRelationships, asRows(data.assetRelationships));
      await bulkInsert(transaction, wishlistItems, asRows(data.wishlistItems));
      await bulkInsert(
        transaction,
        wishlistMarketplaceLinks,
        asRows(data.wishlistMarketplaceLinks),
      );
      await bulkInsert(
        transaction,
        wishlistPriceSnapshots,
        asRows(data.wishlistPriceSnapshots),
      );
      await bulkInsert(transaction, wishlistImages, asRows(data.wishlistImages));
      await bulkInsert(transaction, valuationReports, asRows(data.valuationReports));
      await bulkInsert(transaction, valuationSnapshots, asRows(data.valuationSnapshots));
      await bulkInsert(transaction, valuationSchedules, asRows(data.valuationSchedules));
      await bulkInsert(transaction, subscriptions, asRows(data.subscriptions));
      await bulkInsert(transaction, subscriptionTags, asRows(data.subscriptionTags));
      await bulkInsert(
        transaction,
        subscriptionAttachments,
        asRows(data.subscriptionAttachments),
      );
      await bulkInsert(
        transaction,
        subscriptionPriceChanges,
        asRows(data.subscriptionPriceChanges),
      );
      await bulkInsert(
        transaction,
        subscriptionCharges,
        asRows(data.subscriptionCharges),
      );
      await bulkInsert(transaction, reminders, reminderRows);
      await bulkInsert(
        transaction,
        reminderOccurrences,
        asRows(data.reminderOccurrences),
      );
      await bulkInsert(transaction, reminderDeliveries, asRows(data.reminderDeliveries));

      if (settings) {
        await transaction
          .update(appSettings)
          .set({
            timeZone: settings.timeZone,
            baseCurrency: settings.baseCurrency,
            updatedAt: new Date(),
          })
          .where(sql`true`);
      }
    });

    await storage.clearStoredFiles();

    for (const attachment of asRows(data.assetAttachments)) {
      const id = String(attachment.id);
      const assetId = String(attachment.assetId);
      const originalName = String(attachment.originalName);
      const storageKey = String(attachment.storageKey);
      const original = findAttachmentBuffer(
        parsed.files,
        'asset',
        assetId,
        id,
        originalName,
      );
      if (!original) {
        throw new PortableImportError('MISSING_ATTACHMENT', `缺少附件 ${originalName}`);
      }
      await storage.writeStoredFile(storageKey, original);
      if (attachment.thumbnailStorageKey) {
        const thumbnail = findAttachmentBuffer(
          parsed.files,
          'asset',
          assetId,
          id,
          originalName,
          true,
        );
        if (!thumbnail) {
          throw new PortableImportError(
            'MISSING_ATTACHMENT',
            `缺少缩略图 ${originalName}`,
          );
        }
        const thumbnailKey =
          typeof attachment.thumbnailStorageKey === 'string'
            ? attachment.thumbnailStorageKey
            : null;
        if (!thumbnailKey) {
          throw new PortableImportError(
            'INVALID_ARCHIVE',
            `缩略图路径无效：${originalName}`,
          );
        }
        await storage.writeStoredFile(thumbnailKey, thumbnail);
      }
    }

    for (const attachment of asRows(data.subscriptionAttachments)) {
      const id = String(attachment.id);
      const subscriptionId = String(attachment.subscriptionId);
      const originalName = String(attachment.originalName);
      const original = findAttachmentBuffer(
        parsed.files,
        'subscription',
        subscriptionId,
        id,
        originalName,
      );
      if (!original) {
        throw new PortableImportError(
          'MISSING_ATTACHMENT',
          `缺少订阅资料 ${originalName}`,
        );
      }
      if (typeof attachment.storageKey !== 'string') {
        throw new PortableImportError(
          'INVALID_ARCHIVE',
          `订阅资料路径无效：${originalName}`,
        );
      }
      await storage.writeStoredFile(attachment.storageKey, original);
      if (attachment.thumbnailStorageKey) {
        const thumbnail = findAttachmentBuffer(
          parsed.files,
          'subscription',
          subscriptionId,
          id,
          originalName,
          true,
        );
        if (!thumbnail || typeof attachment.thumbnailStorageKey !== 'string') {
          throw new PortableImportError(
            'MISSING_ATTACHMENT',
            `缺少订阅资料缩略图 ${originalName}`,
          );
        }
        await storage.writeStoredFile(attachment.thumbnailStorageKey, thumbnail);
      }
    }

    for (const image of asRows(data.wishlistImages)) {
      const id = String(image.id);
      const wishlistItemId = String(image.wishlistItemId);
      const originalName = String(image.originalName);
      const original = findAttachmentBuffer(
        parsed.files,
        'wishlist',
        wishlistItemId,
        id,
        originalName,
      );
      const thumbnail = findAttachmentBuffer(
        parsed.files,
        'wishlist',
        wishlistItemId,
        id,
        originalName,
        true,
      );
      if (!original || !thumbnail) {
        throw new PortableImportError(
          'MISSING_ATTACHMENT',
          `缺少种草图片 ${originalName}`,
        );
      }
      if (
        typeof image.storageKey !== 'string' ||
        typeof image.thumbnailStorageKey !== 'string'
      ) {
        throw new PortableImportError(
          'INVALID_ARCHIVE',
          `种草图片路径无效：${originalName}`,
        );
      }
      await storage.writeStoredFile(image.storageKey, original);
      await storage.writeStoredFile(image.thumbnailStorageKey, thumbnail);
    }

    const restored = countFromRecords(parsed.records);
    const result: PortableImportResult = {
      importId: input.importId,
      mode: 'replace',
      appliedAt: new Date().toISOString(),
      restored,
      skipped: {
        notificationChannels: meta.skippedNotificationChannels,
      },
      notes: meta.notes,
    };

    await cleanupStage(meta.importId, meta.archivePath);
    return result;
  } catch (error) {
    if (error instanceof PortableImportError) throw error;
    throw new PortableImportError(
      'IMPORT_FAILED',
      error instanceof Error ? error.message : '导入失败',
    );
  }
}

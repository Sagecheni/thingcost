import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { ZipArchive } from 'archiver';

import { apiVersion, type ExportEntry, type ExportManifest } from '@thingcost/contracts';
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
  notificationChannels,
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

interface ExportFile {
  path: string;
  kind: ExportEntry['kind'];
  content?: Buffer;
  storageKey?: string;
  sizeBytes: number;
  sha256: string;
}

export interface PortableExport {
  filename: string;
  path: string;
  cleanup(): Promise<void>;
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(
    `${JSON.stringify(
      value,
      (_key, item: unknown) => (typeof item === 'bigint' ? item.toString() : item),
      2,
    )}\n`,
  );
}

function checksum(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  let normalized: string;
  if (value instanceof Date) normalized = value.toISOString();
  else if (typeof value === 'bigint') normalized = value.toString();
  else if (typeof value === 'object') normalized = JSON.stringify(value) ?? '';
  else if (typeof value === 'string') normalized = value;
  else if (typeof value === 'number' || typeof value === 'boolean') {
    normalized = String(value);
  } else if (typeof value === 'symbol') normalized = value.description ?? '';
  else normalized = '';

  return /[",\r\n]/u.test(normalized)
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized;
}

function csvBuffer(rows: Array<Record<string, unknown>>): Buffer {
  if (rows.length === 0) return Buffer.from('');
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ];
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`);
}

function addBufferFile(
  files: ExportFile[],
  path: string,
  kind: ExportEntry['kind'],
  content: Buffer,
): void {
  files.push({
    path,
    kind,
    content,
    sizeBytes: content.byteLength,
    sha256: checksum(content),
  });
}

async function inspectStorageFile(
  storage: AttachmentStorage,
  storageKey: string,
): Promise<{ sizeBytes: number; sha256: string }> {
  const hash = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of storage.openReadStream(storageKey)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    sizeBytes += bytes.byteLength;
    hash.update(bytes);
  }
  return { sizeBytes, sha256: hash.digest('hex') };
}

const reservedArchiveNameCharacters = new Set([
  '\\',
  '/',
  ':',
  '*',
  '?',
  '"',
  '<',
  '>',
  '|',
]);

function safeArchiveName(value: string): string {
  const cleaned = [...basename(value)]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || reservedArchiveNameCharacters.has(character)
        ? '_'
        : character;
    })
    .join('')
    .slice(0, 180);
  return cleaned || 'attachment';
}

export async function createPortableExport(
  db: Database,
  storage: AttachmentStorage,
): Promise<PortableExport> {
  const generatedAt = new Date();
  const [
    settingsRows,
    categoryRows,
    statusRows,
    tagRows,
    assetRows,
    assetTagRows,
    lifecycleRows,
    financialRows,
    conditionRows,
    defectRows,
    loanRows,
    repairRows,
    attachmentRows,
    relationshipRows,
    orderRows,
    orderItemRows,
    reminderRows,
    occurrenceRows,
    deliveryRows,
    channelRows,
    wishlistRows,
    wishlistLinkRows,
    wishlistPriceRows,
    wishlistImageRows,
    valuationReportRows,
    valuationSnapshotRows,
    valuationScheduleRows,
    subscriptionRows,
    subscriptionPriceChangeRows,
    subscriptionChargeRows,
    subscriptionTagRows,
    subscriptionAttachmentRows,
  ] = await Promise.all([
    db.select().from(appSettings),
    db.select().from(categories),
    db.select().from(assetStatuses),
    db.select().from(tags),
    db.select().from(assets),
    db.select().from(assetTags),
    db.select().from(lifecycleEvents),
    db.select().from(financialEvents),
    db.select().from(conditionEvents),
    db.select().from(conditionDefects),
    db.select().from(loans),
    db.select().from(repairs),
    db.select().from(assetAttachments),
    db.select().from(assetRelationships),
    db.select().from(purchaseOrders),
    db.select().from(purchaseOrderItems),
    db.select().from(reminders),
    db.select().from(reminderOccurrences),
    db.select().from(reminderDeliveries),
    db
      .select({
        id: notificationChannels.id,
        provider: notificationChannels.provider,
        name: notificationChannels.name,
        enabled: notificationChannels.enabled,
        isDefault: notificationChannels.isDefault,
        createdAt: notificationChannels.createdAt,
        updatedAt: notificationChannels.updatedAt,
      })
      .from(notificationChannels),
    db.select().from(wishlistItems),
    db.select().from(wishlistMarketplaceLinks),
    db.select().from(wishlistPriceSnapshots),
    db.select().from(wishlistImages),
    db.select().from(valuationReports),
    db.select().from(valuationSnapshots),
    db.select().from(valuationSchedules),
    db.select().from(subscriptions),
    db.select().from(subscriptionPriceChanges),
    db.select().from(subscriptionCharges),
    db.select().from(subscriptionTags),
    db.select().from(subscriptionAttachments),
  ]);

  const records = {
    format: 'chronicle-records',
    version: 1,
    generatedAt: generatedAt.toISOString(),
    settings: settingsRows.map((row) => ({
      timeZone: row.timeZone,
      baseCurrency: row.baseCurrency,
      initializedAt: row.initializedAt,
    })),
    data: {
      categories: categoryRows,
      assetStatuses: statusRows,
      tags: tagRows,
      assets: assetRows,
      assetTags: assetTagRows,
      lifecycleEvents: lifecycleRows,
      financialEvents: financialRows,
      conditionEvents: conditionRows,
      conditionDefects: defectRows,
      loans: loanRows,
      repairs: repairRows,
      assetAttachments: attachmentRows,
      assetRelationships: relationshipRows,
      purchaseOrders: orderRows,
      purchaseOrderItems: orderItemRows,
      reminders: reminderRows,
      reminderOccurrences: occurrenceRows,
      reminderDeliveries: deliveryRows,
      notificationChannels: channelRows,
      wishlistItems: wishlistRows,
      wishlistMarketplaceLinks: wishlistLinkRows,
      wishlistPriceSnapshots: wishlistPriceRows,
      wishlistImages: wishlistImageRows,
      valuationReports: valuationReportRows,
      valuationSnapshots: valuationSnapshotRows,
      valuationSchedules: valuationScheduleRows,
      subscriptions: subscriptionRows,
      subscriptionPriceChanges: subscriptionPriceChangeRows,
      subscriptionCharges: subscriptionChargeRows,
      subscriptionTags: subscriptionTagRows,
      subscriptionAttachments: subscriptionAttachmentRows,
    },
  };

  const files: ExportFile[] = [];
  addBufferFile(files, 'records/chronicle.json', 'json', jsonBuffer(records));
  const csvTables: Array<[string, Array<Record<string, unknown>>]> = [
    ['assets', assetRows],
    ['financial-events', financialRows],
    ['lifecycle-events', lifecycleRows],
    ['purchase-orders', orderRows],
    ['reminders', reminderRows],
    ['wishlist-items', wishlistRows],
    ['valuation-snapshots', valuationSnapshotRows],
    ['subscriptions', subscriptionRows],
    ['subscription-price-changes', subscriptionPriceChangeRows],
    ['subscription-charges', subscriptionChargeRows],
    ['subscription-tags', subscriptionTagRows],
  ];
  for (const [name, rows] of csvTables) {
    addBufferFile(files, `csv/${name}.csv`, 'csv', csvBuffer(rows));
  }

  for (const attachment of attachmentRows) {
    const original = await inspectStorageFile(storage, attachment.storageKey);
    files.push({
      path: `attachments/assets/${attachment.assetId}/${attachment.id}-${safeArchiveName(attachment.originalName)}`,
      kind: 'attachment',
      storageKey: attachment.storageKey,
      ...original,
    });
    if (attachment.thumbnailStorageKey) {
      const thumbnail = await inspectStorageFile(storage, attachment.thumbnailStorageKey);
      files.push({
        path: `attachments/assets/${attachment.assetId}/${attachment.id}.thumbnail.webp`,
        kind: 'thumbnail',
        storageKey: attachment.thumbnailStorageKey,
        ...thumbnail,
      });
    }
  }
  for (const attachment of subscriptionAttachmentRows) {
    const original = await inspectStorageFile(storage, attachment.storageKey);
    files.push({
      path: `attachments/subscriptions/${attachment.subscriptionId}/${attachment.id}-${safeArchiveName(attachment.originalName)}`,
      kind: 'attachment',
      storageKey: attachment.storageKey,
      ...original,
    });
    if (attachment.thumbnailStorageKey) {
      const thumbnail = await inspectStorageFile(storage, attachment.thumbnailStorageKey);
      files.push({
        path: `attachments/subscriptions/${attachment.subscriptionId}/${attachment.id}.thumbnail.webp`,
        kind: 'thumbnail',
        storageKey: attachment.thumbnailStorageKey,
        ...thumbnail,
      });
    }
  }
  for (const image of wishlistImageRows) {
    const original = await inspectStorageFile(storage, image.storageKey);
    files.push({
      path: `attachments/wishlist/${image.wishlistItemId}/${image.id}-${safeArchiveName(image.originalName)}`,
      kind: 'attachment',
      storageKey: image.storageKey,
      ...original,
    });
    const thumbnail = await inspectStorageFile(storage, image.thumbnailStorageKey);
    files.push({
      path: `attachments/wishlist/${image.wishlistItemId}/${image.id}.thumbnail.webp`,
      kind: 'thumbnail',
      storageKey: image.thumbnailStorageKey,
      ...thumbnail,
    });
  }

  const manifest: ExportManifest = {
    format: 'chronicle-export',
    version: 1,
    generatedAt: generatedAt.toISOString(),
    apiVersion,
    includes: { records: true, csv: true, attachments: true, secrets: false },
    files: files.map(({ path, kind, sizeBytes, sha256 }) => ({
      path,
      kind,
      sizeBytes,
      sha256,
    })),
  };
  const manifestContent = jsonBuffer(manifest);
  const temporaryDirectory = join(tmpdir(), 'chronicle-exports');
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
  const archivePath = join(temporaryDirectory, `${randomUUID()}.zip`);
  const output = createWriteStream(archivePath, { flags: 'wx', mode: 0o600 });
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const completed = new Promise<void>((resolve, reject) => {
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', reject);
    archive.once('warning', reject);
  });
  archive.pipe(output);
  archive.append(manifestContent, { name: 'manifest.json' });
  for (const file of files) {
    if (file.content) archive.append(file.content, { name: file.path });
    else if (file.storageKey)
      archive.append(storage.openReadStream(file.storageKey), { name: file.path });
  }
  try {
    await Promise.all([completed, archive.finalize()]);
  } catch (error) {
    archive.abort();
    await rm(archivePath, { force: true });
    throw error;
  }

  const date = generatedAt.toISOString().slice(0, 10).replaceAll('-', '');
  return {
    filename: `chronicle-export-v1-${date}.zip`,
    path: archivePath,
    cleanup: () => rm(archivePath, { force: true }),
  };
}

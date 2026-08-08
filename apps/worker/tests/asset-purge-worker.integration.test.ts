import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '@thingcost/config';
import {
  assetAttachments,
  assets,
  assetStatuses,
  categories,
  createDatabase,
} from '@thingcost/database';

import { runAssetPurgeCycle } from '../src/asset-purge-worker.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const database = databaseUrl ? createDatabase(databaseUrl) : null;
const attachmentRoot = '/tmp/chronicle-purge-worker-attachments';
const config = {
  ATTACHMENTS_DIR: attachmentRoot,
} as RuntimeConfig;

describe.skipIf(!database)('asset purge worker', () => {
  beforeEach(async () => {
    await rm(attachmentRoot, { recursive: true, force: true });
    await database?.db.execute(sql`
      truncate table
        asset_attachments,
        assets,
        categories,
        asset_statuses
      restart identity cascade
    `);
  });

  afterAll(async () => {
    await rm(attachmentRoot, { recursive: true, force: true });
    await database?.client.end();
  });

  it('permanently removes expired recycled assets and their private files', async () => {
    if (!database) throw new Error('TEST_DATABASE_URL is required.');
    const [category] = await database.db
      .insert(categories)
      .values({ name: '测试分类', isSystem: false })
      .returning({ id: categories.id });
    const [status] = await database.db
      .insert(assetStatuses)
      .values({
        code: 'purge-test',
        name: '使用中',
        countsTowardService: true,
        ownershipState: 'held',
        isSystem: false,
      })
      .returning({ id: assetStatuses.id });
    if (!category || !status) throw new Error('Unable to seed catalogs.');

    const [asset] = await database.db
      .insert(assets)
      .values({
        name: '待清理物品',
        categoryId: category.id,
        acquisitionType: 'gift',
        acquisitionDate: '2025-01-01',
        costKnowledge: 'known_zero',
        currentStatusId: status.id,
        deletedAt: new Date('2025-02-01T00:00:00.000Z'),
        purgeAfter: new Date('2025-03-03T00:00:00.000Z'),
      })
      .returning({ id: assets.id });
    if (!asset) throw new Error('Unable to seed asset.');

    const storageKey = 'aa/11111111-1111-4111-8111-111111111111.png';
    const filePath = resolve(attachmentRoot, storageKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from('private attachment'));
    await database.db.insert(assetAttachments).values({
      assetId: asset.id,
      kind: 'photo',
      storageKey,
      originalName: 'private.png',
      mediaType: 'image/png',
      sizeBytes: 18,
      sha256: 'a'.repeat(64),
    });

    const result = await runAssetPurgeCycle(database.db, config);
    expect(result).toEqual({ dueAssets: 1, purgedAssets: 1, failedAssets: 0 });
    expect(
      await database.db.select().from(assets).where(eq(assets.id, asset.id)),
    ).toEqual([]);
    await expect(access(filePath)).rejects.toThrow();
  });
});

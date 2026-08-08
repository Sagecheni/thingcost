import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { and, eq, isNotNull, lte } from 'drizzle-orm';

import type { RuntimeConfig } from '@thingcost/config';
import { assetAttachments, assets, type Database } from '@thingcost/database';

export interface AssetPurgeStats {
  dueAssets: number;
  purgedAssets: number;
  failedAssets: number;
}

async function removeStoredFiles(rootDirectory: string, keys: Array<string | null>) {
  const root = resolve(rootDirectory);
  await Promise.all(
    keys
      .filter((key): key is string => Boolean(key))
      .map(async (key) => {
        if (
          !/^[0-9a-f]{2}\/[0-9a-f-]+(?:\.thumb)?\.(?:jpg|png|gif|webp|pdf)$/u.test(key)
        ) {
          throw new Error('Invalid attachment storage key.');
        }
        const path = resolve(root, key);
        if (!path.startsWith(`${root}${sep}`)) {
          throw new Error('Attachment path escaped its storage root.');
        }
        await rm(path, { force: true });
      }),
  );
}

export async function runAssetPurgeCycle(
  db: Database,
  config: RuntimeConfig,
  limit = 20,
): Promise<AssetPurgeStats> {
  const now = new Date();
  const dueAssets = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(isNotNull(assets.deletedAt), lte(assets.purgeAfter, now)))
    .limit(limit);
  const stats: AssetPurgeStats = {
    dueAssets: dueAssets.length,
    purgedAssets: 0,
    failedAssets: 0,
  };
  if (dueAssets.length === 0) return stats;

  for (const asset of dueAssets) {
    try {
      const files = await db
        .select({
          storageKey: assetAttachments.storageKey,
          thumbnailStorageKey: assetAttachments.thumbnailStorageKey,
        })
        .from(assetAttachments)
        .where(eq(assetAttachments.assetId, asset.id));
      await removeStoredFiles(
        config.ATTACHMENTS_DIR,
        files.flatMap((file) => [file.storageKey, file.thumbnailStorageKey]),
      );
      const deleted = await db
        .delete(assets)
        .where(and(eq(assets.id, asset.id), isNotNull(assets.deletedAt)))
        .returning({ id: assets.id });
      if (deleted.length > 0) stats.purgedAssets += 1;
    } catch {
      stats.failedAssets += 1;
    }
  }

  return stats;
}

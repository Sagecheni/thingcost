import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';

import type {
  WishlistImage,
  WishlistItemDetail,
  WishlistItemSummary,
  WishlistListQuery,
} from '@thingcost/contracts';
import {
  assets,
  categories,
  wishlistImages,
  wishlistItems,
  wishlistMarketplaceLinks,
  wishlistPriceSnapshots,
  type Database,
} from '@thingcost/database';

export function mapWishlistImage(row: typeof wishlistImages.$inferSelect): WishlistImage {
  return {
    id: row.id,
    originalName: row.originalName,
    mediaType: row.mediaType as WishlistImage['mediaType'],
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    contentUrl: `/api/v1/wishlist/${row.wishlistItemId}/image/content`,
    thumbnailUrl: `/api/v1/wishlist/${row.wishlistItemId}/image/thumbnail`,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadWishlistSummaries(
  db: Database,
  query: WishlistListQuery,
): Promise<WishlistItemSummary[]> {
  const conditions = [eq(wishlistItems.status, query.status)];
  if (query.q) conditions.push(ilike(wishlistItems.name, `%${query.q}%`));
  if (query.categoryId) conditions.push(eq(wishlistItems.categoryId, query.categoryId));
  if (query.priority) conditions.push(eq(wishlistItems.priority, query.priority));

  const orderBy =
    query.sort === 'priority_desc'
      ? [
          sql`case ${wishlistItems.priority} when 'high' then 0 when 'medium' then 1 else 2 end`,
          desc(wishlistItems.updatedAt),
        ]
      : query.sort === 'planned_asc'
        ? [
            sql`${wishlistItems.plannedPurchaseDate} asc nulls last`,
            desc(wishlistItems.updatedAt),
          ]
        : query.sort === 'price_asc'
          ? [
              sql`${wishlistItems.currentPriceMinor} asc nulls last`,
              desc(wishlistItems.updatedAt),
            ]
          : [desc(wishlistItems.updatedAt)];

  const rows = await db
    .select({
      id: wishlistItems.id,
      name: wishlistItems.name,
      description: wishlistItems.description,
      currency: wishlistItems.currency,
      currentPriceMinor: wishlistItems.currentPriceMinor,
      currentPriceObservedOn: wishlistItems.currentPriceObservedOn,
      targetPriceMinor: wishlistItems.targetPriceMinor,
      budgetMinor: wishlistItems.budgetMinor,
      priority: wishlistItems.priority,
      plannedPurchaseDate: wishlistItems.plannedPurchaseDate,
      status: wishlistItems.status,
      createdAt: wishlistItems.createdAt,
      updatedAt: wishlistItems.updatedAt,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      categoryIsSystem: categories.isSystem,
      categorySortOrder: categories.sortOrder,
      convertedAssetId: assets.id,
      convertedAssetName: assets.name,
    })
    .from(wishlistItems)
    .innerJoin(categories, eq(wishlistItems.categoryId, categories.id))
    .leftJoin(assets, eq(wishlistItems.convertedAssetId, assets.id))
    .where(and(...conditions))
    .orderBy(...orderBy);

  if (rows.length === 0) return [];
  const itemIds = rows.map((row) => row.id);
  const [links, snapshots, images] = await Promise.all([
    db
      .select({ itemId: wishlistMarketplaceLinks.wishlistItemId })
      .from(wishlistMarketplaceLinks)
      .where(inArray(wishlistMarketplaceLinks.wishlistItemId, itemIds)),
    db
      .select({ itemId: wishlistPriceSnapshots.wishlistItemId })
      .from(wishlistPriceSnapshots)
      .where(inArray(wishlistPriceSnapshots.wishlistItemId, itemIds)),
    db
      .select()
      .from(wishlistImages)
      .where(inArray(wishlistImages.wishlistItemId, itemIds)),
  ]);
  const linkCounts = new Map<string, number>();
  const snapshotCounts = new Map<string, number>();
  for (const link of links)
    linkCounts.set(link.itemId, (linkCounts.get(link.itemId) ?? 0) + 1);
  for (const snapshot of snapshots)
    snapshotCounts.set(snapshot.itemId, (snapshotCounts.get(snapshot.itemId) ?? 0) + 1);
  const imageByItemId = new Map(images.map((image) => [image.wishlistItemId, image]));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    category: {
      id: row.categoryId,
      name: row.categoryName,
      color: row.categoryColor,
      icon: row.categoryIcon,
      isSystem: row.categoryIsSystem,
      sortOrder: row.categorySortOrder,
    },
    currency: row.currency,
    currentPriceMinor: row.currentPriceMinor?.toString() ?? null,
    currentPriceObservedOn: row.currentPriceObservedOn,
    targetPriceMinor: row.targetPriceMinor?.toString() ?? null,
    budgetMinor: row.budgetMinor?.toString() ?? null,
    priority: row.priority,
    plannedPurchaseDate: row.plannedPurchaseDate,
    status: row.status,
    linkCount: linkCounts.get(row.id) ?? 0,
    snapshotCount: snapshotCounts.get(row.id) ?? 0,
    image: imageByItemId.has(row.id)
      ? mapWishlistImage(imageByItemId.get(row.id)!)
      : null,
    convertedAsset: row.convertedAssetId
      ? { id: row.convertedAssetId, name: row.convertedAssetName ?? row.name }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function listWishlistItems(
  db: Database,
  query: WishlistListQuery,
): Promise<{ items: WishlistItemSummary[]; total: number }> {
  const items = await loadWishlistSummaries(db, query);
  return { items, total: items.length };
}

export async function getWishlistItem(
  db: Database,
  itemId: string,
): Promise<WishlistItemDetail | null> {
  const [base] = await db
    .select({ status: wishlistItems.status })
    .from(wishlistItems)
    .where(eq(wishlistItems.id, itemId))
    .limit(1);
  if (!base) return null;

  const [summary] = await loadWishlistSummaries(db, {
    status: base.status,
    sort: 'updated_desc',
  });
  const exactSummary =
    summary?.id === itemId
      ? summary
      : (await loadWishlistSummariesByIds(db, [itemId])).at(0);
  if (!exactSummary) return null;

  const [links, snapshots] = await Promise.all([
    db
      .select()
      .from(wishlistMarketplaceLinks)
      .where(eq(wishlistMarketplaceLinks.wishlistItemId, itemId))
      .orderBy(
        asc(wishlistMarketplaceLinks.sortOrder),
        asc(wishlistMarketplaceLinks.createdAt),
      ),
    db
      .select({
        id: wishlistPriceSnapshots.id,
        amountMinor: wishlistPriceSnapshots.amountMinor,
        currency: wishlistPriceSnapshots.currency,
        observedOn: wishlistPriceSnapshots.observedOn,
        marketplaceLinkId: wishlistPriceSnapshots.marketplaceLinkId,
        marketplace: wishlistMarketplaceLinks.marketplace,
        note: wishlistPriceSnapshots.note,
        createdAt: wishlistPriceSnapshots.createdAt,
      })
      .from(wishlistPriceSnapshots)
      .leftJoin(
        wishlistMarketplaceLinks,
        eq(wishlistPriceSnapshots.marketplaceLinkId, wishlistMarketplaceLinks.id),
      )
      .where(eq(wishlistPriceSnapshots.wishlistItemId, itemId))
      .orderBy(
        desc(wishlistPriceSnapshots.observedOn),
        desc(wishlistPriceSnapshots.createdAt),
      ),
  ]);

  return {
    ...exactSummary,
    links: links.map((link) => ({
      id: link.id,
      marketplace: link.marketplace,
      url: link.url,
      note: link.note,
      sortOrder: link.sortOrder,
      createdAt: link.createdAt.toISOString(),
    })),
    priceSnapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      amountMinor: snapshot.amountMinor.toString(),
      currency: snapshot.currency,
      observedOn: snapshot.observedOn,
      marketplaceLinkId: snapshot.marketplaceLinkId,
      marketplace: snapshot.marketplace,
      note: snapshot.note,
      createdAt: snapshot.createdAt.toISOString(),
    })),
  };
}

async function loadWishlistSummariesByIds(
  db: Database,
  itemIds: string[],
): Promise<WishlistItemSummary[]> {
  if (itemIds.length === 0) return [];
  const statuses = await db
    .select({ id: wishlistItems.id, status: wishlistItems.status })
    .from(wishlistItems)
    .where(inArray(wishlistItems.id, itemIds));
  const result: WishlistItemSummary[] = [];
  for (const status of new Set(statuses.map((row) => row.status))) {
    const rows = await loadWishlistSummaries(db, { status, sort: 'updated_desc' });
    result.push(...rows.filter((row) => itemIds.includes(row.id)));
  }
  return result;
}

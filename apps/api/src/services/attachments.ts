import type { AssetAttachment } from '@thingcost/contracts';
import type { assetAttachments } from '@thingcost/database';

export function mapAssetAttachment(
  row: typeof assetAttachments.$inferSelect,
): AssetAttachment {
  const basePath = `/api/v1/assets/${row.assetId}/attachments/${row.id}`;
  return {
    id: row.id,
    assetId: row.assetId,
    kind: row.kind,
    originalName: row.originalName,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    caption: row.caption,
    isCover: row.isCover,
    sortOrder: row.sortOrder,
    contentUrl: `${basePath}/content`,
    thumbnailUrl: row.thumbnailStorageKey ? `${basePath}/thumbnail` : null,
    createdAt: row.createdAt.toISOString(),
  };
}

import { z } from 'zod';

import { uuidSchema } from './common.js';

export const attachmentKindSchema = z.enum(['photo', 'document']);

export const assetAttachmentSchema = z.object({
  id: uuidSchema,
  assetId: uuidSchema,
  kind: attachmentKindSchema,
  originalName: z.string(),
  mediaType: z.string(),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  caption: z.string().nullable(),
  isCover: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  contentUrl: z.string(),
  thumbnailUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const updateAssetAttachmentSchema = z
  .object({
    caption: z.string().trim().max(500).nullable(),
    isCover: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: '至少需要修改一个字段',
  });

export type AttachmentKind = z.infer<typeof attachmentKindSchema>;
export type AssetAttachment = z.infer<typeof assetAttachmentSchema>;
export type UpdateAssetAttachmentInput = z.infer<typeof updateAssetAttachmentSchema>;

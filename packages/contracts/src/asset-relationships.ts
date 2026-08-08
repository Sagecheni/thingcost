import { z } from 'zod';

import { uuidSchema } from './common.js';

export const assetRelationshipTypeSchema = z.enum(['belongs_to', 'paired_with']);

export const createAssetRelationshipSchema = z.object({
  relatedAssetId: uuidSchema,
  type: assetRelationshipTypeSchema,
  note: z.string().trim().max(500).optional(),
});

export const assetRelationshipSchema = z.object({
  id: uuidSchema,
  type: assetRelationshipTypeSchema,
  role: z.enum(['source', 'target']),
  relatedAsset: z.object({
    id: uuidSchema,
    name: z.string(),
    coverThumbnailUrl: z.string().nullable(),
  }),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type AssetRelationshipType = z.infer<typeof assetRelationshipTypeSchema>;
export type CreateAssetRelationshipInput = z.infer<typeof createAssetRelationshipSchema>;
export type AssetRelationship = z.infer<typeof assetRelationshipSchema>;

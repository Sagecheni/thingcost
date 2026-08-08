import { z } from 'zod';

import { categorySchema } from './assets.js';
import {
  currencyCodeSchema,
  isoDateSchema,
  nonNegativeMinorUnitSchema,
  uuidSchema,
} from './common.js';

export const wishlistPrioritySchema = z.enum(['low', 'medium', 'high']);
export const wishlistStatusSchema = z.enum(['active', 'converted', 'archived']);
export const wishlistSortSchema = z.enum([
  'updated_desc',
  'priority_desc',
  'planned_asc',
  'price_asc',
]);

const wishlistUrlSchema = z
  .url()
  .max(2_048)
  .refine((url) => ['http:', 'https:'].includes(new URL(url).protocol), {
    message: '链接必须使用 HTTP 或 HTTPS',
  });

export const createWishlistLinkSchema = z.object({
  marketplace: z.string().trim().min(1).max(120),
  url: wishlistUrlSchema,
  note: z.string().trim().max(500).optional(),
});

export const wishlistLinkSchema = z.object({
  id: uuidSchema,
  marketplace: z.string(),
  url: wishlistUrlSchema,
  note: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});

export const wishlistPriceSnapshotSchema = z.object({
  id: uuidSchema,
  amountMinor: nonNegativeMinorUnitSchema,
  currency: currencyCodeSchema,
  observedOn: isoDateSchema,
  marketplaceLinkId: uuidSchema.nullable(),
  marketplace: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const createWishlistPriceSnapshotSchema = z.object({
  amountMinor: nonNegativeMinorUnitSchema,
  observedOn: isoDateSchema,
  marketplaceLinkId: uuidSchema.optional(),
  note: z.string().trim().max(500).optional(),
});

export const wishlistImageSchema = z.object({
  id: uuidSchema,
  originalName: z.string(),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  contentUrl: z.string(),
  thumbnailUrl: z.string(),
  createdAt: z.iso.datetime(),
});

export const createWishlistItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  categoryId: uuidSchema,
  description: z.string().trim().max(5_000).optional(),
  currency: currencyCodeSchema,
  currentPriceMinor: nonNegativeMinorUnitSchema.optional(),
  currentPriceObservedOn: isoDateSchema.optional(),
  targetPriceMinor: nonNegativeMinorUnitSchema.optional(),
  budgetMinor: nonNegativeMinorUnitSchema.optional(),
  priority: wishlistPrioritySchema.default('medium'),
  plannedPurchaseDate: isoDateSchema.optional(),
  links: z.array(createWishlistLinkSchema).max(20).default([]),
});

export const updateWishlistItemSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    categoryId: uuidSchema,
    description: z.string().trim().max(5_000).nullable(),
    targetPriceMinor: nonNegativeMinorUnitSchema.nullable(),
    budgetMinor: nonNegativeMinorUnitSchema.nullable(),
    priority: wishlistPrioritySchema,
    plannedPurchaseDate: isoDateSchema.nullable(),
    status: z.enum(['active', 'archived']),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: '至少需要修改一个字段',
  });

export const wishlistListQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  categoryId: uuidSchema.optional(),
  priority: wishlistPrioritySchema.optional(),
  status: wishlistStatusSchema.default('active'),
  sort: wishlistSortSchema.default('updated_desc'),
});

export const convertWishlistItemSchema = z
  .object({
    acquisitionDate: isoDateSchema,
    costKnowledge: z.enum(['known_amount', 'known_zero', 'unknown']),
    paidPriceMinor: nonNegativeMinorUnitSchema.optional(),
    exchangeRate: z
      .string()
      .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/u)
      .refine((value) => Number(value) > 0, '汇率必须大于零')
      .optional(),
    exchangeRateSource: z.enum(['manual', 'frankfurter']).optional(),
    exchangeRateDate: isoDateSchema.optional(),
    exchangeRateFallback: z.boolean().optional(),
    initialStatusId: uuidSchema,
    tagIds: z.array(uuidSchema).max(30).default([]),
    note: z.string().trim().max(2_000).optional(),
  })
  .superRefine((input, context) => {
    if (
      input.costKnowledge === 'known_amount' &&
      (!input.paidPriceMinor || input.paidPriceMinor === '0')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['paidPriceMinor'],
        message: '已知金额必须大于零',
      });
    }
    if (
      input.costKnowledge !== 'known_amount' &&
      input.paidPriceMinor !== undefined &&
      input.paidPriceMinor !== '0'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['paidPriceMinor'],
        message: '零成本或未知成本不应填写实付金额',
      });
    }
  });

export const wishlistConvertedAssetSchema = z.object({
  id: uuidSchema,
  name: z.string(),
});

export const wishlistItemSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  category: categorySchema,
  currency: currencyCodeSchema,
  currentPriceMinor: nonNegativeMinorUnitSchema.nullable(),
  currentPriceObservedOn: isoDateSchema.nullable(),
  targetPriceMinor: nonNegativeMinorUnitSchema.nullable(),
  budgetMinor: nonNegativeMinorUnitSchema.nullable(),
  priority: wishlistPrioritySchema,
  plannedPurchaseDate: isoDateSchema.nullable(),
  status: wishlistStatusSchema,
  linkCount: z.number().int().nonnegative(),
  snapshotCount: z.number().int().nonnegative(),
  image: wishlistImageSchema.nullable(),
  convertedAsset: wishlistConvertedAssetSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const wishlistItemDetailSchema = wishlistItemSummarySchema.extend({
  links: z.array(wishlistLinkSchema),
  priceSnapshots: z.array(wishlistPriceSnapshotSchema),
});

export const wishlistItemListSchema = z.object({
  items: z.array(wishlistItemSummarySchema),
  total: z.number().int().nonnegative(),
});

export const wishlistConversionResultSchema = z.object({
  wishlistItem: wishlistItemDetailSchema,
  assetId: uuidSchema,
});

export type WishlistPriority = z.infer<typeof wishlistPrioritySchema>;
export type CreateWishlistLinkInput = z.infer<typeof createWishlistLinkSchema>;
export type CreateWishlistPriceSnapshotInput = z.infer<
  typeof createWishlistPriceSnapshotSchema
>;
export type UpdateWishlistItemInput = z.infer<typeof updateWishlistItemSchema>;
export type WishlistStatus = z.infer<typeof wishlistStatusSchema>;
export type WishlistSort = z.infer<typeof wishlistSortSchema>;
export type CreateWishlistItemInput = z.infer<typeof createWishlistItemSchema>;
export type WishlistListQuery = z.infer<typeof wishlistListQuerySchema>;
export type WishlistItemSummary = z.infer<typeof wishlistItemSummarySchema>;
export type WishlistItemDetail = z.infer<typeof wishlistItemDetailSchema>;
export type WishlistLink = z.infer<typeof wishlistLinkSchema>;
export type WishlistPriceSnapshot = z.infer<typeof wishlistPriceSnapshotSchema>;
export type WishlistImage = z.infer<typeof wishlistImageSchema>;
export type ConvertWishlistItemInput = z.infer<typeof convertWishlistItemSchema>;

import { z } from 'zod';

import { assetRelationshipSchema } from './asset-relationships.js';
import { assetAttachmentSchema } from './attachments.js';
import {
  conditionEventSchema,
  conditionGradeSchema,
  loanSchema,
  repairSchema,
} from './asset-activity.js';
import {
  currencyCodeSchema,
  isoDateSchema,
  nonNegativeMinorUnitSchema,
  signedMinorUnitSchema,
  uuidSchema,
} from './common.js';
import { purchaseOrderReferenceSchema } from './orders.js';

export const acquisitionTypeSchema = z.enum([
  'purchase',
  'gift',
  'inheritance',
  'self_made',
  'exchange',
  'unknown',
]);

export const costKnowledgeSchema = z.enum(['known_amount', 'known_zero', 'unknown']);
export const ownershipStateSchema = z.enum(['held', 'disposed']);
export const exchangeRateSourceSchema = z.enum(['manual', 'frankfurter', 'legacy']);
export const positiveDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/u)
  .refine((value) => Number(value) > 0, '汇率必须大于零');

export const categorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  isSystem: z.boolean(),
  sortOrder: z.number().int(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(24).optional(),
  icon: z.string().trim().max(64).optional(),
});

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, '至少需要修改一个字段');

export const tagSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  color: z.string().nullable(),
});

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(24).optional(),
});

export const updateTagSchema = createTagSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, '至少需要修改一个字段');

export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export const assetStatusSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  countsTowardService: z.boolean(),
  ownershipState: ownershipStateSchema,
  isSystem: z.boolean(),
  sortOrder: z.number().int(),
});

export const createAssetStatusSchema = z.object({
  name: z.string().trim().min(1).max(80),
  countsTowardService: z.boolean(),
  ownershipState: ownershipStateSchema,
});

export const updateAssetStatusSchema = createAssetStatusSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, '至少需要修改一个字段');

export const createAssetSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(5_000).optional(),
    categoryId: uuidSchema,
    acquisitionType: acquisitionTypeSchema,
    acquisitionDate: isoDateSchema,
    costKnowledge: costKnowledgeSchema,
    acquisitionAmountMinor: nonNegativeMinorUnitSchema.optional(),
    priceCurrency: currencyCodeSchema.optional(),
    exchangeRate: positiveDecimalSchema.optional(),
    exchangeRateSource: exchangeRateSourceSchema.optional(),
    exchangeRateDate: isoDateSchema.optional(),
    exchangeRateFallback: z.boolean().optional(),
    originalPriceMinor: nonNegativeMinorUnitSchema.optional(),
    discountMinor: nonNegativeMinorUnitSchema.optional(),
    brand: z.string().trim().max(120).optional(),
    model: z.string().trim().max(160).optional(),
    serialNumber: z.string().trim().max(160).optional(),
    purchaseChannel: z.string().trim().max(160).optional(),
    orderNumber: z.string().trim().max(160).optional(),
    warrantyStartDate: isoDateSchema.optional(),
    warrantyEndDate: isoDateSchema.optional(),
    extendedWarrantyEndDate: isoDateSchema.optional(),
    extendedWarrantyProvider: z.string().trim().max(160).optional(),
    initialStatusId: uuidSchema,
    tagIds: z.array(uuidSchema).max(30).default([]),
    note: z.string().trim().max(2_000).optional(),
  })
  .superRefine((input, context) => {
    if (input.costKnowledge === 'known_amount') {
      if (!input.acquisitionAmountMinor || input.acquisitionAmountMinor === '0') {
        context.addIssue({
          code: 'custom',
          path: ['acquisitionAmountMinor'],
          message: '已知金额必须大于零',
        });
      }

      if (!input.priceCurrency) {
        context.addIssue({
          code: 'custom',
          path: ['priceCurrency'],
          message: '已知金额必须指定币种',
        });
      }
    } else if (input.acquisitionAmountMinor && input.acquisitionAmountMinor !== '0') {
      context.addIssue({
        code: 'custom',
        path: ['acquisitionAmountMinor'],
        message: '零成本或未知成本不能包含非零取得金额',
      });
    }

    if (
      input.warrantyStartDate &&
      input.warrantyEndDate &&
      input.warrantyEndDate < input.warrantyStartDate
    ) {
      context.addIssue({
        code: 'custom',
        path: ['warrantyEndDate'],
        message: '保修结束日期不能早于开始日期',
      });
    }
    if (
      input.warrantyEndDate &&
      input.extendedWarrantyEndDate &&
      input.extendedWarrantyEndDate < input.warrantyEndDate
    ) {
      context.addIssue({
        code: 'custom',
        path: ['extendedWarrantyEndDate'],
        message: '延保结束日期不能早于原保修结束日期',
      });
    }

    if (
      input.originalPriceMinor &&
      input.discountMinor &&
      BigInt(input.discountMinor) > BigInt(input.originalPriceMinor)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['discountMinor'],
        message: '优惠金额不能大于原价',
      });
    }
  });

export const updateAssetSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(5_000).nullable(),
    categoryId: uuidSchema,
    brand: z.string().trim().max(120).nullable(),
    model: z.string().trim().max(160).nullable(),
    serialNumber: z.string().trim().max(160).nullable(),
    purchaseChannel: z.string().trim().max(160).nullable(),
    orderNumber: z.string().trim().max(160).nullable(),
    warrantyStartDate: isoDateSchema.nullable(),
    warrantyEndDate: isoDateSchema.nullable(),
    extendedWarrantyEndDate: isoDateSchema.nullable(),
    extendedWarrantyProvider: z.string().trim().max(160).nullable(),
    originalPriceMinor: nonNegativeMinorUnitSchema.nullable(),
    discountMinor: nonNegativeMinorUnitSchema.nullable(),
    tagIds: z.array(uuidSchema).max(30),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: '至少需要修改一个字段',
  });

export const financialEventTypeSchema = z.enum([
  'acquisition',
  'refund',
  'shipping',
  'tax',
  'repair',
  'upgrade',
  'accessory',
  'fee',
  'disposal_fee',
  'sale_proceeds',
  'other',
]);

export const financialDirectionSchema = z.enum(['outflow', 'inflow']);

export const exchangeRateQuoteSchema = z.object({
  base: currencyCodeSchema,
  quote: currencyCodeSchema,
  rate: positiveDecimalSchema,
  requestedDate: isoDateSchema,
  effectiveDate: isoDateSchema,
  fallback: z.boolean(),
  source: z.literal('frankfurter'),
});

export const createFinancialEventSchema = z.object({
  type: financialEventTypeSchema,
  direction: financialDirectionSchema,
  amountMinor: z.string().regex(/^[1-9]\d*$/u),
  currency: currencyCodeSchema,
  exchangeRate: positiveDecimalSchema.optional(),
  exchangeRateSource: exchangeRateSourceSchema.optional(),
  exchangeRateDate: isoDateSchema.optional(),
  exchangeRateFallback: z.boolean().optional(),
  occurredOn: isoDateSchema,
  includeInNetCost: z.boolean(),
  note: z.string().trim().max(2_000).optional(),
});

export const transitionAssetSchema = z.object({
  statusId: uuidSchema,
  effectiveDate: isoDateSchema,
  note: z.string().trim().max(2_000).optional(),
});

export const correctLifecycleEventSchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
  replacement: transitionAssetSchema.optional(),
});

export const correctFinancialEventSchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
  replacement: createFinancialEventSchema.optional(),
});

export const lifecycleEventSchema = z.object({
  id: uuidSchema,
  status: assetStatusSchema,
  effectiveDate: isoDateSchema,
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
  voidedAt: z.iso.datetime().nullable(),
  voidReason: z.string().nullable(),
  correctionOfId: uuidSchema.nullable(),
});

export const financialEventSchema = z.object({
  id: uuidSchema,
  type: financialEventTypeSchema,
  direction: financialDirectionSchema,
  amountMinor: nonNegativeMinorUnitSchema,
  currency: currencyCodeSchema,
  baseAmountMinor: nonNegativeMinorUnitSchema,
  baseCurrency: currencyCodeSchema,
  exchangeRate: positiveDecimalSchema,
  exchangeRateSource: exchangeRateSourceSchema,
  exchangeRateDate: isoDateSchema,
  exchangeRateFallback: z.boolean(),
  occurredOn: isoDateSchema,
  includeInNetCost: z.boolean(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
  voidedAt: z.iso.datetime().nullable(),
  voidReason: z.string().nullable(),
  correctionOfId: uuidSchema.nullable(),
});

export const assetMetricsSchema = z.object({
  holdingDays: z.number().int().nonnegative(),
  serviceDays: z.number().int().nonnegative(),
  netCostMinor: signedMinorUnitSchema.nullable(),
  netDailyCostMinor: z.string().nullable(),
  currentlyInPortfolio: z.boolean(),
  disposedOn: isoDateSchema.nullable(),
});

export const assetListSortSchema = z.enum([
  'updated_desc',
  'acquired_desc',
  'name_asc',
  'daily_cost_desc',
  'net_cost_desc',
]);

export const assetListQuerySchema = z
  .object({
    q: z.string().trim().max(160).optional(),
    categoryId: uuidSchema.optional(),
    statusId: uuidSchema.optional(),
    tagId: uuidSchema.optional(),
    conditionGrade: conditionGradeSchema.optional(),
    costKnowledge: costKnowledgeSchema.optional(),
    acquiredFrom: isoDateSchema.optional(),
    acquiredTo: isoDateSchema.optional(),
    minNetCostMinor: signedMinorUnitSchema.optional(),
    maxNetCostMinor: signedMinorUnitSchema.optional(),
    sort: assetListSortSchema.default('updated_desc'),
  })
  .refine(
    (input) =>
      !input.acquiredFrom || !input.acquiredTo || input.acquiredFrom <= input.acquiredTo,
    { path: ['acquiredTo'], message: '结束日期不能早于开始日期' },
  )
  .refine(
    (input) =>
      !input.minNetCostMinor ||
      !input.maxNetCostMinor ||
      BigInt(input.minNetCostMinor) <= BigInt(input.maxNetCostMinor),
    { path: ['maxNetCostMinor'], message: '最大成本不能小于最小成本' },
  );

export const assetSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  category: categorySchema,
  acquisitionType: acquisitionTypeSchema,
  acquisitionDate: isoDateSchema,
  costKnowledge: costKnowledgeSchema,
  priceCurrency: currencyCodeSchema.nullable(),
  originalPriceMinor: nonNegativeMinorUnitSchema.nullable(),
  discountMinor: nonNegativeMinorUnitSchema.nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serialNumber: z.string().nullable(),
  purchaseChannel: z.string().nullable(),
  orderNumber: z.string().nullable(),
  warrantyStartDate: isoDateSchema.nullable(),
  warrantyEndDate: isoDateSchema.nullable(),
  extendedWarrantyEndDate: isoDateSchema.nullable(),
  extendedWarrantyProvider: z.string().nullable(),
  currentStatus: assetStatusSchema,
  currentCondition: conditionEventSchema.nullable(),
  tags: z.array(tagSchema),
  hasOpenLoan: z.boolean(),
  hasOpenRepair: z.boolean(),
  coverAttachment: assetAttachmentSchema.nullable(),
  metrics: assetMetricsSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const assetDetailSchema = assetSummarySchema.extend({
  lifecycleEvents: z.array(lifecycleEventSchema),
  financialEvents: z.array(financialEventSchema),
  conditionEvents: z.array(conditionEventSchema),
  loans: z.array(loanSchema),
  repairs: z.array(repairSchema),
  attachments: z.array(assetAttachmentSchema),
  relationships: z.array(assetRelationshipSchema),
  purchaseOrder: purchaseOrderReferenceSchema.nullable(),
});

export const assetListSchema = z.object({
  items: z.array(assetSummarySchema),
  total: z.number().int().nonnegative(),
});

export const recycleBinItemSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  category: categorySchema,
  acquisitionDate: isoDateSchema,
  deletedAt: z.iso.datetime(),
  purgeAfter: z.iso.datetime().nullable(),
});

export const recycleBinSchema = z.object({
  items: z.array(recycleBinItemSchema),
  total: z.number().int().nonnegative(),
});

export const permanentDeleteAssetInputSchema = z.object({
  confirmPermanentDelete: z.literal(true),
  assetName: z.string().min(1).max(160),
});

export type Category = z.infer<typeof categorySchema>;
export type Tag = z.infer<typeof tagSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type AssetStatus = z.infer<typeof assetStatusSchema>;
export type CreateAssetStatusInput = z.infer<typeof createAssetStatusSchema>;
export type UpdateAssetStatusInput = z.infer<typeof updateAssetStatusSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type CreateFinancialEventInput = z.infer<typeof createFinancialEventSchema>;
export type CorrectFinancialEventInput = z.infer<typeof correctFinancialEventSchema>;
export type TransitionAssetInput = z.infer<typeof transitionAssetSchema>;
export type CorrectLifecycleEventInput = z.infer<typeof correctLifecycleEventSchema>;
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;
export type AssetSummary = z.infer<typeof assetSummarySchema>;
export type AssetDetail = z.infer<typeof assetDetailSchema>;

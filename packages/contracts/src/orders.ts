import { z } from 'zod';

import {
  currencyCodeSchema,
  isoDateSchema,
  nonNegativeMinorUnitSchema,
  signedMinorUnitSchema,
  uuidSchema,
} from './common.js';

const positiveMinorUnitSchema = z.string().regex(/^[1-9]\d*$/u);

export const orderAllocationMethodSchema = z.enum(['proportional', 'manual']);

export const createPurchaseOrderItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  categoryId: uuidSchema,
  brand: z.string().trim().max(120).optional(),
  model: z.string().trim().max(160).optional(),
  initialStatusId: uuidSchema,
  tagIds: z.array(uuidSchema).max(30).default([]),
  listedPriceMinor: nonNegativeMinorUnitSchema,
  allocatedAmountMinor: nonNegativeMinorUnitSchema.optional(),
});

export const createPurchaseOrderSchema = z
  .object({
    merchant: z.string().trim().max(160).optional(),
    orderNumber: z.string().trim().max(160).optional(),
    orderedOn: isoDateSchema,
    currency: currencyCodeSchema,
    discountMinor: nonNegativeMinorUnitSchema.default('0'),
    shippingMinor: nonNegativeMinorUnitSchema.default('0'),
    taxMinor: nonNegativeMinorUnitSchema.default('0'),
    feeMinor: nonNegativeMinorUnitSchema.default('0'),
    exchangeRate: z
      .string()
      .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/u)
      .refine((value) => Number(value) > 0, '汇率必须大于零')
      .optional(),
    exchangeRateSource: z.enum(['manual', 'frankfurter']).optional(),
    exchangeRateDate: isoDateSchema.optional(),
    exchangeRateFallback: z.boolean().optional(),
    allocationMethod: orderAllocationMethodSchema.default('proportional'),
    note: z.string().trim().max(2_000).optional(),
    items: z.array(createPurchaseOrderItemSchema).min(1).max(50),
  })
  .superRefine((input, context) => {
    const subtotal = input.items.reduce(
      (sum, item) => sum + BigInt(item.listedPriceMinor),
      0n,
    );
    if (subtotal === 0n) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: '订单商品原价合计必须大于零',
      });
    }
    if (BigInt(input.discountMinor) > subtotal) {
      context.addIssue({
        code: 'custom',
        path: ['discountMinor'],
        message: '订单优惠不能大于商品原价合计',
      });
    }

    if (input.allocationMethod === 'manual') {
      input.items.forEach((item, index) => {
        if (item.allocatedAmountMinor === undefined) {
          context.addIssue({
            code: 'custom',
            path: ['items', index, 'allocatedAmountMinor'],
            message: '手工分摊必须填写每件物品的实付金额',
          });
        }
      });
      const total =
        subtotal -
        BigInt(input.discountMinor) +
        BigInt(input.shippingMinor) +
        BigInt(input.taxMinor) +
        BigInt(input.feeMinor);
      const allocated = input.items.reduce(
        (sum, item) => sum + BigInt(item.allocatedAmountMinor ?? '0'),
        0n,
      );
      if (allocated !== total) {
        context.addIssue({
          code: 'custom',
          path: ['items'],
          message: '手工分摊金额合计必须等于订单实付总额',
        });
      }
    }
  });

export const purchaseOrderReferenceSchema = z.object({
  id: uuidSchema,
  merchant: z.string().nullable(),
  orderNumber: z.string().nullable(),
  orderedOn: isoDateSchema,
  currency: currencyCodeSchema,
  totalPaidMinor: nonNegativeMinorUnitSchema,
});

export const purchaseOrderAssetSchema = z.object({
  id: uuidSchema.nullable(),
  name: z.string(),
  categoryName: z.string(),
  statusName: z.string(),
});

export const purchaseOrderItemSchema = z.object({
  id: uuidSchema,
  asset: purchaseOrderAssetSchema,
  listedPriceMinor: nonNegativeMinorUnitSchema,
  allocatedDiscountMinor: nonNegativeMinorUnitSchema,
  allocatedShippingMinor: nonNegativeMinorUnitSchema,
  allocatedTaxMinor: nonNegativeMinorUnitSchema,
  allocatedFeeMinor: nonNegativeMinorUnitSchema,
  allocationAdjustmentMinor: signedMinorUnitSchema,
  allocatedAmountMinor: nonNegativeMinorUnitSchema,
  sortOrder: z.number().int().nonnegative(),
});

export const purchaseOrderSummarySchema = z.object({
  id: uuidSchema,
  merchant: z.string().nullable(),
  orderNumber: z.string().nullable(),
  orderedOn: isoDateSchema,
  currency: currencyCodeSchema,
  subtotalMinor: positiveMinorUnitSchema,
  discountMinor: nonNegativeMinorUnitSchema,
  shippingMinor: nonNegativeMinorUnitSchema,
  taxMinor: nonNegativeMinorUnitSchema,
  feeMinor: nonNegativeMinorUnitSchema,
  totalPaidMinor: nonNegativeMinorUnitSchema,
  baseTotalPaidMinor: nonNegativeMinorUnitSchema,
  baseCurrency: currencyCodeSchema,
  exchangeRate: z.string(),
  exchangeRateSource: z.enum(['manual', 'frankfurter', 'legacy']),
  exchangeRateDate: isoDateSchema,
  exchangeRateFallback: z.boolean(),
  allocationMethod: orderAllocationMethodSchema,
  note: z.string().nullable(),
  itemCount: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});

export const purchaseOrderDetailSchema = purchaseOrderSummarySchema.extend({
  items: z.array(purchaseOrderItemSchema),
});

export const purchaseOrderListSchema = z.array(purchaseOrderSummarySchema);

export type OrderAllocationMethod = z.infer<typeof orderAllocationMethodSchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type PurchaseOrderSummary = z.infer<typeof purchaseOrderSummarySchema>;
export type PurchaseOrderDetail = z.infer<typeof purchaseOrderDetailSchema>;

import { asc, desc, eq, inArray } from 'drizzle-orm';
import Decimal from 'decimal.js';

import type { PurchaseOrderDetail, PurchaseOrderSummary } from '@thingcost/contracts';
import { purchaseOrderItems, purchaseOrders, type Database } from '@thingcost/database';

function mapOrderBase(
  row: typeof purchaseOrders.$inferSelect,
  itemCount: number,
): PurchaseOrderSummary {
  return {
    id: row.id,
    merchant: row.merchant,
    orderNumber: row.orderNumber,
    orderedOn: row.orderedOn,
    currency: row.currency,
    subtotalMinor: row.subtotalMinor.toString(),
    discountMinor: row.discountMinor.toString(),
    shippingMinor: row.shippingMinor.toString(),
    taxMinor: row.taxMinor.toString(),
    feeMinor: row.feeMinor.toString(),
    totalPaidMinor: row.totalPaidMinor.toString(),
    baseTotalPaidMinor: row.baseTotalPaidMinor.toString(),
    baseCurrency: row.baseCurrency,
    exchangeRate: new Decimal(row.exchangeRate).toString(),
    exchangeRateSource: row.exchangeRateSource as 'manual' | 'frankfurter' | 'legacy',
    exchangeRateDate: row.exchangeRateDate,
    exchangeRateFallback: row.exchangeRateFallback,
    allocationMethod: row.allocationMethod,
    note: row.note,
    itemCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPurchaseOrders(db: Database): Promise<PurchaseOrderSummary[]> {
  const orderRows = await db
    .select()
    .from(purchaseOrders)
    .orderBy(desc(purchaseOrders.orderedOn), desc(purchaseOrders.createdAt));

  if (orderRows.length === 0) return [];

  const itemRows = await db
    .select({ orderId: purchaseOrderItems.orderId })
    .from(purchaseOrderItems)
    .where(
      inArray(
        purchaseOrderItems.orderId,
        orderRows.map((order) => order.id),
      ),
    );
  const counts = new Map<string, number>();
  for (const item of itemRows) {
    counts.set(item.orderId, (counts.get(item.orderId) ?? 0) + 1);
  }

  return orderRows.map((order) => mapOrderBase(order, counts.get(order.id) ?? 0));
}

export async function getPurchaseOrder(
  db: Database,
  orderId: string,
): Promise<PurchaseOrderDetail | null> {
  const [order] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, orderId))
    .limit(1);
  if (!order) return null;

  const items = await db
    .select({
      id: purchaseOrderItems.id,
      assetId: purchaseOrderItems.assetId,
      assetName: purchaseOrderItems.assetNameSnapshot,
      categoryName: purchaseOrderItems.categoryNameSnapshot,
      statusName: purchaseOrderItems.statusNameSnapshot,
      listedPriceMinor: purchaseOrderItems.listedPriceMinor,
      allocatedDiscountMinor: purchaseOrderItems.allocatedDiscountMinor,
      allocatedShippingMinor: purchaseOrderItems.allocatedShippingMinor,
      allocatedTaxMinor: purchaseOrderItems.allocatedTaxMinor,
      allocatedFeeMinor: purchaseOrderItems.allocatedFeeMinor,
      allocationAdjustmentMinor: purchaseOrderItems.allocationAdjustmentMinor,
      allocatedAmountMinor: purchaseOrderItems.allocatedAmountMinor,
      sortOrder: purchaseOrderItems.sortOrder,
    })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.orderId, orderId))
    .orderBy(asc(purchaseOrderItems.sortOrder), asc(purchaseOrderItems.createdAt));

  return {
    ...mapOrderBase(order, items.length),
    items: items.map((item) => ({
      id: item.id,
      asset: {
        id: item.assetId,
        name: item.assetName,
        categoryName: item.categoryName,
        statusName: item.statusName,
      },
      listedPriceMinor: item.listedPriceMinor.toString(),
      allocatedDiscountMinor: item.allocatedDiscountMinor.toString(),
      allocatedShippingMinor: item.allocatedShippingMinor.toString(),
      allocatedTaxMinor: item.allocatedTaxMinor.toString(),
      allocatedFeeMinor: item.allocatedFeeMinor.toString(),
      allocationAdjustmentMinor: item.allocationAdjustmentMinor.toString(),
      allocatedAmountMinor: item.allocatedAmountMinor.toString(),
      sortOrder: item.sortOrder,
    })),
  };
}

export interface OrderAllocationInput {
  listedPriceMinor: bigint;
  manualAllocatedAmountMinor?: bigint;
}

export interface OrderAdjustmentInput {
  discountMinor: bigint;
  shippingMinor: bigint;
  taxMinor: bigint;
  feeMinor: bigint;
}

export interface OrderLineAllocation {
  listedPriceMinor: bigint;
  allocatedDiscountMinor: bigint;
  allocatedShippingMinor: bigint;
  allocatedTaxMinor: bigint;
  allocatedFeeMinor: bigint;
  allocationAdjustmentMinor: bigint;
  allocatedAmountMinor: bigint;
}

export interface OrderAllocationResult {
  subtotalMinor: bigint;
  totalPaidMinor: bigint;
  lines: OrderLineAllocation[];
}

function assertNonNegative(value: bigint, name: string): void {
  if (value < 0n) {
    throw new RangeError(`${name} cannot be negative`);
  }
}

/**
 * Allocate an integer amount by weights using the largest-remainder method.
 * Stable input order resolves equal remainders, making every minor unit explainable.
 */
export function allocateByLargestRemainder(total: bigint, weights: bigint[]): bigint[] {
  assertNonNegative(total, 'total');
  if (weights.length === 0) {
    throw new RangeError('at least one weight is required');
  }

  for (const weight of weights) {
    assertNonNegative(weight, 'weight');
  }

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);
  if (weightTotal === 0n) {
    if (total === 0n) {
      return weights.map(() => 0n);
    }
    throw new RangeError('a positive total cannot be allocated across zero weights');
  }

  const allocations = weights.map((weight) => (total * weight) / weightTotal);
  const remainders = weights.map((weight) => (total * weight) % weightTotal);
  let remaining = total - allocations.reduce((sum, amount) => sum + amount, 0n);

  const order = remainders
    .map((remainder, index) => ({ index, remainder }))
    .sort((left, right) => {
      if (left.remainder === right.remainder) return left.index - right.index;
      return left.remainder > right.remainder ? -1 : 1;
    });

  for (const entry of order) {
    if (remaining === 0n) break;
    allocations[entry.index] = (allocations[entry.index] ?? 0n) + 1n;
    remaining -= 1n;
  }

  return allocations;
}

export function allocateOrder(
  items: OrderAllocationInput[],
  adjustments: OrderAdjustmentInput,
  method: 'proportional' | 'manual',
): OrderAllocationResult {
  if (items.length === 0) {
    throw new RangeError('an order must contain at least one item');
  }

  const weights = items.map((item) => {
    assertNonNegative(item.listedPriceMinor, 'listed price');
    return item.listedPriceMinor;
  });
  const subtotalMinor = weights.reduce((sum, amount) => sum + amount, 0n);
  if (subtotalMinor === 0n) {
    throw new RangeError('order subtotal must be positive');
  }

  assertNonNegative(adjustments.discountMinor, 'discount');
  assertNonNegative(adjustments.shippingMinor, 'shipping');
  assertNonNegative(adjustments.taxMinor, 'tax');
  assertNonNegative(adjustments.feeMinor, 'fee');
  if (adjustments.discountMinor > subtotalMinor) {
    throw new RangeError('discount cannot exceed merchandise subtotal');
  }

  const totalPaidMinor =
    subtotalMinor -
    adjustments.discountMinor +
    adjustments.shippingMinor +
    adjustments.taxMinor +
    adjustments.feeMinor;

  const discounts = allocateByLargestRemainder(adjustments.discountMinor, weights);
  const shipping = allocateByLargestRemainder(adjustments.shippingMinor, weights);
  const taxes = allocateByLargestRemainder(adjustments.taxMinor, weights);
  const fees = allocateByLargestRemainder(adjustments.feeMinor, weights);
  const baseline = weights.map(
    (listed, index) =>
      listed -
      (discounts[index] ?? 0n) +
      (shipping[index] ?? 0n) +
      (taxes[index] ?? 0n) +
      (fees[index] ?? 0n),
  );

  let allocatedAmounts: bigint[];
  if (method === 'manual') {
    allocatedAmounts = items.map((item) => {
      if (item.manualAllocatedAmountMinor === undefined) {
        throw new RangeError('manual allocation requires every allocated amount');
      }
      assertNonNegative(item.manualAllocatedAmountMinor, 'manual allocation');
      return item.manualAllocatedAmountMinor;
    });
    if (allocatedAmounts.reduce((sum, amount) => sum + amount, 0n) !== totalPaidMinor) {
      throw new RangeError('manual allocations must equal the order total');
    }
  } else {
    allocatedAmounts = allocateByLargestRemainder(totalPaidMinor, weights);
  }

  return {
    subtotalMinor,
    totalPaidMinor,
    lines: items.map((item, index) => ({
      listedPriceMinor: item.listedPriceMinor,
      allocatedDiscountMinor: discounts[index] ?? 0n,
      allocatedShippingMinor: shipping[index] ?? 0n,
      allocatedTaxMinor: taxes[index] ?? 0n,
      allocatedFeeMinor: fees[index] ?? 0n,
      allocationAdjustmentMinor:
        (allocatedAmounts[index] ?? 0n) - (baseline[index] ?? 0n),
      allocatedAmountMinor: allocatedAmounts[index] ?? 0n,
    })),
  };
}

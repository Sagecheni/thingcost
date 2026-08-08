import { describe, expect, it } from 'vitest';

import { allocateByLargestRemainder, allocateOrder } from '../src/order-allocation.js';

describe('order allocation', () => {
  it('returns every minor unit with stable largest-remainder rounding', () => {
    expect(allocateByLargestRemainder(10n, [1n, 1n, 1n])).toEqual([4n, 3n, 3n]);
    expect(allocateByLargestRemainder(2n, [0n, 3n, 1n])).toEqual([0n, 2n, 0n]);
  });

  it('allocates discounts and shared charges exactly', () => {
    const result = allocateOrder(
      [{ listedPriceMinor: 6_000n }, { listedPriceMinor: 4_000n }],
      {
        discountMinor: 1_000n,
        shippingMinor: 301n,
        taxMinor: 0n,
        feeMinor: 99n,
      },
      'proportional',
    );

    expect(result.subtotalMinor).toBe(10_000n);
    expect(result.totalPaidMinor).toBe(9_400n);
    expect(result.lines.map((line) => line.allocatedAmountMinor)).toEqual([
      5_640n,
      3_760n,
    ]);
    expect(result.lines.reduce((sum, line) => sum + line.allocatedAmountMinor, 0n)).toBe(
      result.totalPaidMinor,
    );
    expect(
      result.lines.reduce((sum, line) => sum + line.allocatedDiscountMinor, 0n),
    ).toBe(1_000n);
    expect(
      result.lines.reduce((sum, line) => sum + line.allocatedShippingMinor, 0n),
    ).toBe(301n);
  });

  it('records explainable balancing adjustments for manual allocation', () => {
    const result = allocateOrder(
      [
        { listedPriceMinor: 6_000n, manualAllocatedAmountMinor: 5_500n },
        { listedPriceMinor: 4_000n, manualAllocatedAmountMinor: 3_900n },
      ],
      {
        discountMinor: 1_000n,
        shippingMinor: 400n,
        taxMinor: 0n,
        feeMinor: 0n,
      },
      'manual',
    );

    expect(result.lines.map((line) => line.allocationAdjustmentMinor)).toEqual([
      -140n,
      140n,
    ]);
    expect(
      result.lines.reduce((sum, line) => sum + line.allocationAdjustmentMinor, 0n),
    ).toBe(0n);
  });

  it('rejects invalid or non-conserving inputs', () => {
    expect(() => allocateByLargestRemainder(1n, [0n, 0n])).toThrow(/zero weights/u);
    expect(() =>
      allocateOrder(
        [
          { listedPriceMinor: 100n, manualAllocatedAmountMinor: 50n },
          { listedPriceMinor: 100n, manualAllocatedAmountMinor: 50n },
        ],
        { discountMinor: 0n, shippingMinor: 1n, taxMinor: 0n, feeMinor: 0n },
        'manual',
      ),
    ).toThrow(/must equal/u);
  });
});

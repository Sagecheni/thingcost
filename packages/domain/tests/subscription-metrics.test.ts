import { describe, expect, it } from 'vitest';

import {
  calculateSubscriptionMetrics,
  projectRecurringAmount,
} from '../src/subscription-metrics.js';

describe('subscription metrics', () => {
  it('projects monthly and yearly amounts', () => {
    expect(projectRecurringAmount(100_00n, 'monthly', null)).toEqual({
      monthly: 100_00n,
      yearly: 1_200_00n,
    });
    expect(projectRecurringAmount(1_200_00n, 'yearly', null)).toEqual({
      monthly: 100_00n,
      yearly: 1_200_00n,
    });
    expect(projectRecurringAmount(100_00n, 'one_time', null)).toEqual({
      monthly: 0n,
      yearly: 0n,
    });
  });

  it('separates actual and planned spend', () => {
    const metrics = calculateSubscriptionMetrics({
      amountMinor: 30_00n,
      billingCycle: 'monthly',
      customIntervalDays: null,
      status: 'active',
      charges: [
        { kind: 'actual', status: 'succeeded', amountMinor: 30_00n },
        { kind: 'actual', status: 'failed', amountMinor: 30_00n },
        { kind: 'planned', status: 'planned', amountMinor: 30_00n },
      ],
    });
    expect(metrics.projectedMonthlyMinor).toBe(30_00n);
    expect(metrics.actualSpendMinor).toBe(30_00n);
    expect(metrics.plannedSpendMinor).toBe(30_00n);
    expect(metrics.failedChargeCount).toBe(1);
  });

  it('zeros projection for cancelled subscriptions', () => {
    const metrics = calculateSubscriptionMetrics({
      amountMinor: 99_00n,
      billingCycle: 'monthly',
      customIntervalDays: null,
      status: 'cancelled',
      charges: [],
    });
    expect(metrics.projectedMonthlyMinor).toBe(0n);
  });
});

export type SubscriptionBillingCycle = 'monthly' | 'yearly' | 'custom' | 'one_time';

export interface SubscriptionChargeInput {
  kind: 'planned' | 'actual';
  status: 'planned' | 'succeeded' | 'failed' | 'refunded' | 'waived';
  amountMinor: bigint;
}

export interface SubscriptionMetrics {
  projectedMonthlyMinor: bigint;
  projectedYearlyMinor: bigint;
  actualSpendMinor: bigint;
  plannedSpendMinor: bigint;
  failedChargeCount: number;
}

/** Normalize a recurring amount into approximate monthly and yearly minor units. */
export function projectRecurringAmount(
  amountMinor: bigint,
  billingCycle: SubscriptionBillingCycle,
  customIntervalDays: number | null,
): { monthly: bigint; yearly: bigint } {
  if (billingCycle === 'one_time') {
    return { monthly: 0n, yearly: 0n };
  }
  if (billingCycle === 'monthly') {
    return { monthly: amountMinor, yearly: amountMinor * 12n };
  }
  if (billingCycle === 'yearly') {
    const monthly = amountMinor / 12n;
    return { monthly, yearly: amountMinor };
  }
  const days = customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 30;
  // Approximate using 365.25 / interval, integer minor units.
  const yearly = (amountMinor * 36525n) / BigInt(days * 100);
  const monthly = yearly / 12n;
  return { monthly, yearly };
}

export function calculateSubscriptionMetrics(input: {
  amountMinor: bigint;
  discountMinor?: bigint;
  billingCycle: SubscriptionBillingCycle;
  customIntervalDays: number | null;
  status: 'trial' | 'active' | 'paused' | 'cancelled' | 'expired';
  charges: SubscriptionChargeInput[];
}): SubscriptionMetrics {
  const activeLike = input.status === 'active' || input.status === 'trial';
  const discountMinor = input.discountMinor ?? 0n;
  const effectiveAmount =
    discountMinor > input.amountMinor ? 0n : input.amountMinor - discountMinor;
  const projected = activeLike
    ? projectRecurringAmount(
        effectiveAmount,
        input.billingCycle,
        input.customIntervalDays,
      )
    : { monthly: 0n, yearly: 0n };

  let actualSpendMinor = 0n;
  let plannedSpendMinor = 0n;
  let failedChargeCount = 0;

  for (const charge of input.charges) {
    if (charge.kind === 'actual' && charge.status === 'succeeded') {
      actualSpendMinor += charge.amountMinor;
    }
    if (charge.kind === 'actual' && charge.status === 'refunded') {
      actualSpendMinor -= charge.amountMinor;
    }
    if (charge.kind === 'planned' || charge.status === 'planned') {
      plannedSpendMinor += charge.amountMinor;
    }
    if (charge.status === 'failed') failedChargeCount += 1;
  }

  if (actualSpendMinor < 0n) actualSpendMinor = 0n;

  return {
    projectedMonthlyMinor: projected.monthly,
    projectedYearlyMinor: projected.yearly,
    actualSpendMinor,
    plannedSpendMinor,
    failedChargeCount,
  };
}

export interface ValuationSnapshotPoint {
  valuedOn: string;
  valueMinor: string;
}

/**
 * Observed annualized depreciation from the earliest and latest adopted snapshots.
 * Positive means value declined; negative means appreciation.
 * Returns null when fewer than two points or the span is under 30 days.
 */
export function calculateAnnualizedDepreciationRate(
  snapshots: ValuationSnapshotPoint[],
): number | null {
  if (snapshots.length < 2) return null;

  const ordered = [...snapshots].sort((left, right) =>
    left.valuedOn.localeCompare(right.valuedOn),
  );
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) return null;

  const start = Date.parse(`${first.valuedOn}T12:00:00Z`);
  const end = Date.parse(`${last.valuedOn}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const daySpan = (end - start) / (24 * 60 * 60 * 1000);
  if (daySpan < 30) return null;

  const startValue = Number(first.valueMinor);
  const endValue = Number(last.valueMinor);
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || startValue <= 0) {
    return null;
  }

  const years = daySpan / 365.25;
  const ratio = endValue / startValue;
  if (ratio <= 0) return 1;
  const rate = 1 - ratio ** (1 / years);
  return Number(rate.toFixed(6));
}

export function nextValuationRunAt(
  cadence: 'manual' | 'monthly' | 'quarterly' | 'yearly',
  from: Date = new Date(),
): Date | null {
  if (cadence === 'manual') return null;
  const next = new Date(from.getTime());
  if (cadence === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
  if (cadence === 'quarterly') next.setUTCMonth(next.getUTCMonth() + 3);
  if (cadence === 'yearly') next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

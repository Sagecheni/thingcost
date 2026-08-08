import Decimal from 'decimal.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const millisecondsPerDay = 86_400_000;

export interface LifecycleMetricEvent {
  effectiveDate: string;
  countsTowardService: boolean;
  endsOwnership: boolean;
}

export interface AssetMetricInput {
  acquisitionDate: string;
  asOfDate: string;
  netCostMinor: bigint;
  lifecycleEvents: readonly LifecycleMetricEvent[];
}

export interface AssetMetrics {
  holdingDays: number;
  serviceDays: number;
  netCostMinor: bigint;
  netDailyCostMinor: string | null;
  currentlyInPortfolio: boolean;
  disposedOn: string | null;
}

function toEpochDay(value: string): number {
  if (!datePattern.test(value)) {
    throw new Error(`Invalid ISO calendar date: ${value}`);
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid ISO calendar date: ${value}`);
  }

  return Math.floor(timestamp / millisecondsPerDay);
}

function inclusiveDays(start: number, end: number): number {
  return end < start ? 0 : end - start + 1;
}

export function calculateAssetMetrics(input: AssetMetricInput): AssetMetrics {
  const acquisitionDay = toEpochDay(input.acquisitionDate);
  const asOfDay = toEpochDay(input.asOfDate);

  if (asOfDay < acquisitionDay) {
    throw new Error('The as-of date cannot be earlier than the acquisition date.');
  }

  const events = input.lifecycleEvents
    .map((event, index) => ({
      ...event,
      day: toEpochDay(event.effectiveDate),
      index,
    }))
    .filter((event) => event.day <= asOfDay)
    .sort((left, right) => left.day - right.day || left.index - right.index);

  if (events.length === 0 || events[0]?.day !== acquisitionDay) {
    throw new Error('A lifecycle event is required on the acquisition date.');
  }

  if (events.some((event) => event.day < acquisitionDay)) {
    throw new Error('Lifecycle events cannot precede the acquisition date.');
  }

  const disposalEvent = events.find((event) => event.endsOwnership);
  const heldEndDay = disposalEvent ? disposalEvent.day : asOfDay;
  const holdingDays = inclusiveDays(acquisitionDay, heldEndDay);

  const serviceIntervals: Array<{ start: number; end: number }> = [];

  for (const [index, event] of events.entries()) {
    if (!event.countsTowardService || event.day > heldEndDay) {
      continue;
    }

    const nextEvent = events[index + 1];
    const end = Math.min(nextEvent?.day ?? heldEndDay, heldEndDay);
    serviceIntervals.push({ start: event.day, end });
  }

  serviceIntervals.sort((left, right) => left.start - right.start);

  let serviceDays = 0;
  let currentInterval: { start: number; end: number } | undefined;

  for (const interval of serviceIntervals) {
    if (!currentInterval) {
      currentInterval = { ...interval };
      continue;
    }

    if (interval.start <= currentInterval.end + 1) {
      currentInterval.end = Math.max(currentInterval.end, interval.end);
      continue;
    }

    serviceDays += inclusiveDays(currentInterval.start, currentInterval.end);
    currentInterval = { ...interval };
  }

  if (currentInterval) {
    serviceDays += inclusiveDays(currentInterval.start, currentInterval.end);
  }

  const currentEvent = events.at(-1);
  const currentlyInPortfolio = Boolean(
    currentEvent?.countsTowardService && !currentEvent.endsOwnership,
  );
  const netDailyCostMinor =
    serviceDays === 0
      ? null
      : new Decimal(input.netCostMinor.toString())
          .div(serviceDays)
          .toDecimalPlaces(8)
          .toString();

  return {
    holdingDays,
    serviceDays,
    netCostMinor: input.netCostMinor,
    netDailyCostMinor,
    currentlyInPortfolio,
    disposedOn: disposalEvent?.effectiveDate ?? null,
  };
}

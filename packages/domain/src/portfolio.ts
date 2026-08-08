import Decimal from 'decimal.js';

import { calculateAssetMetrics } from './asset-metrics.js';

export interface PortfolioLifecycleEvent {
  effectiveDate: string;
  countsTowardService: boolean;
  endsOwnership: boolean;
  statusCode: string;
}

export interface PortfolioFinancialEvent {
  occurredOn: string;
  direction: 'outflow' | 'inflow';
  baseAmountMinor: bigint;
  includeInNetCost: boolean;
}

export interface PortfolioAssetInput {
  id: string;
  acquisitionDate: string;
  costKnown: boolean;
  categoryId: string;
  lifecycleEvents: readonly PortfolioLifecycleEvent[];
  financialEvents: readonly PortfolioFinancialEvent[];
}

export interface PortfolioAssetSnapshot {
  id: string;
  categoryId: string;
  netCostMinor: bigint | null;
  netDailyCostMinor: string | null;
  holdingDays: number;
  serviceDays: number;
  isHeld: boolean;
  isInServicePortfolio: boolean;
  statusCode: string;
}

export interface PortfolioSnapshot {
  asOfDate: string;
  assets: PortfolioAssetSnapshot[];
  currentDailyCostMinor: string;
  currentNetInvestmentMinor: bigint;
  heldItemCount: number;
  serviceItemCount: number;
  unknownCostCount: number;
}

function netCostAsOf(
  financialEvents: readonly PortfolioFinancialEvent[],
  asOfDate: string,
): bigint {
  return financialEvents.reduce((total, event) => {
    if (!event.includeInNetCost || event.occurredOn > asOfDate) {
      return total;
    }

    return event.direction === 'outflow'
      ? total + event.baseAmountMinor
      : total - event.baseAmountMinor;
  }, 0n);
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid ISO calendar date: ${isoDate}`);
  }

  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function calculatePortfolioSnapshot(
  assets: readonly PortfolioAssetInput[],
  asOfDate: string,
): PortfolioSnapshot {
  const snapshots = assets.flatMap<PortfolioAssetSnapshot>((asset) => {
    if (asset.acquisitionDate > asOfDate) {
      return [];
    }

    const relevantLifecycleEvents = asset.lifecycleEvents.filter(
      (event) => event.effectiveDate <= asOfDate,
    );

    if (relevantLifecycleEvents.length === 0) {
      return [];
    }

    const netCostMinor = netCostAsOf(asset.financialEvents, asOfDate);
    const metrics = calculateAssetMetrics({
      acquisitionDate: asset.acquisitionDate,
      asOfDate,
      netCostMinor,
      lifecycleEvents: relevantLifecycleEvents,
    });
    const currentLifecycle = relevantLifecycleEvents.at(-1);

    if (!currentLifecycle) {
      return [];
    }

    return [
      {
        id: asset.id,
        categoryId: asset.categoryId,
        netCostMinor: asset.costKnown ? netCostMinor : null,
        netDailyCostMinor: asset.costKnown ? metrics.netDailyCostMinor : null,
        holdingDays: metrics.holdingDays,
        serviceDays: metrics.serviceDays,
        isHeld: metrics.disposedOn === null,
        isInServicePortfolio: metrics.currentlyInPortfolio,
        statusCode: currentLifecycle.statusCode,
      },
    ];
  });

  const currentDailyCostMinor = snapshots.reduce((total, asset) => {
    if (!asset.isInServicePortfolio || asset.netDailyCostMinor === null) {
      return total;
    }

    return total.plus(asset.netDailyCostMinor);
  }, new Decimal(0));

  const currentNetInvestmentMinor = snapshots.reduce((total, asset) => {
    if (!asset.isHeld || asset.netCostMinor === null) {
      return total;
    }

    return total + asset.netCostMinor;
  }, 0n);

  return {
    asOfDate,
    assets: snapshots,
    currentDailyCostMinor: currentDailyCostMinor.toDecimalPlaces(8).toString(),
    currentNetInvestmentMinor,
    heldItemCount: snapshots.filter((asset) => asset.isHeld).length,
    serviceItemCount: snapshots.filter((asset) => asset.isInServicePortfolio).length,
    unknownCostCount: snapshots.filter((asset) => asset.netCostMinor === null).length,
  };
}

export function calculatePortfolioTrend(
  assets: readonly PortfolioAssetInput[],
  endDate: string,
  periodDays: number,
): PortfolioSnapshot[] {
  if (!Number.isInteger(periodDays) || periodDays < 1) {
    throw new Error('Trend period must contain at least one day.');
  }

  return Array.from({ length: periodDays }, (_, index) =>
    calculatePortfolioSnapshot(assets, addCalendarDays(endDate, index - periodDays + 1)),
  );
}

export interface AssetCostTrendPoint {
  date: string;
  dailyCostMinor: string | null;
  netCostMinor: bigint | null;
  holdingDays: number;
  serviceDays: number;
  isHeld: boolean;
  isInService: boolean;
  statusCode: string | null;
}

/**
 * Reconstruct a single asset's daily cost and cumulative net cost over a window.
 * Days before acquisition are omitted so the chart starts when ownership begins.
 */
export function calculateAssetCostTrend(
  asset: PortfolioAssetInput,
  endDate: string,
  periodDays: number,
): AssetCostTrendPoint[] {
  const snapshots = calculatePortfolioTrend([asset], endDate, periodDays);

  return snapshots.flatMap((snapshot) => {
    const point = snapshot.assets[0];
    if (!point) {
      return [];
    }

    return [
      {
        date: snapshot.asOfDate,
        dailyCostMinor: point.netDailyCostMinor,
        netCostMinor: point.netCostMinor,
        holdingDays: point.holdingDays,
        serviceDays: point.serviceDays,
        isHeld: point.isHeld,
        isInService: point.isInServicePortfolio,
        statusCode: point.statusCode,
      },
    ];
  });
}

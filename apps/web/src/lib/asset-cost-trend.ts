import {
  calculateAssetCostTrend,
  type AssetCostTrendPoint,
  type PortfolioAssetInput,
} from '@thingcost/domain';

import type { AssetDetail } from '@thingcost/contracts';

export function toPortfolioAssetInput(asset: AssetDetail): PortfolioAssetInput {
  return {
    id: asset.id,
    acquisitionDate: asset.acquisitionDate,
    costKnown: asset.costKnowledge !== 'unknown',
    categoryId: asset.category.id,
    lifecycleEvents: asset.lifecycleEvents
      .filter((event) => event.voidedAt === null)
      .map((event) => ({
        effectiveDate: event.effectiveDate,
        countsTowardService: event.status.countsTowardService,
        endsOwnership: event.status.ownershipState === 'disposed',
        statusCode: event.status.code,
      })),
    financialEvents: asset.financialEvents
      .filter((event) => event.voidedAt === null)
      .map((event) => ({
        occurredOn: event.occurredOn,
        direction: event.direction,
        baseAmountMinor: BigInt(event.baseAmountMinor),
        includeInNetCost: event.includeInNetCost,
      })),
  };
}

export function buildAssetCostTrend(
  asset: AssetDetail,
  endDate: string,
  periodDays: number,
): AssetCostTrendPoint[] {
  return calculateAssetCostTrend(toPortfolioAssetInput(asset), endDate, periodDays);
}

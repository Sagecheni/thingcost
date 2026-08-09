import { describe, expect, it } from 'vitest';

import {
  addCalendarDays,
  calculateAssetCostTrend,
  calculatePortfolioSnapshot,
  calculatePortfolioTrend,
  type PortfolioAssetInput,
} from '../src/portfolio.js';

const assets: PortfolioAssetInput[] = [
  {
    id: 'camera',
    acquisitionDate: '2026-01-01',
    costKnown: true,
    categoryId: 'digital',
    lifecycleEvents: [
      {
        effectiveDate: '2026-01-01',
        countsTowardService: true,
        endsOwnership: false,
        statusCode: 'in_use',
      },
      {
        effectiveDate: '2026-01-05',
        countsTowardService: false,
        endsOwnership: false,
        statusCode: 'retired',
      },
    ],
    financialEvents: [
      {
        occurredOn: '2026-01-01',
        direction: 'outflow',
        baseAmountMinor: 100_00n,
        includeInNetCost: true,
      },
      {
        occurredOn: '2026-01-03',
        direction: 'inflow',
        baseAmountMinor: 10_00n,
        includeInNetCost: true,
      },
    ],
  },
  {
    id: 'gift',
    acquisitionDate: '2026-01-02',
    costKnown: false,
    categoryId: 'other',
    lifecycleEvents: [
      {
        effectiveDate: '2026-01-02',
        countsTowardService: true,
        endsOwnership: false,
        statusCode: 'idle',
      },
    ],
    financialEvents: [],
  },
];

describe('portfolio calculations', () => {
  it('reconstructs a snapshot from events known by that date', () => {
    const snapshot = calculatePortfolioSnapshot(assets, '2026-01-03');

    expect(snapshot.currentNetInvestmentMinor).toBe(90_00n);
    expect(snapshot.currentHoldingDailyCostMinor).toBe('3000');
    expect(snapshot.heldItemCount).toBe(2);
    expect(snapshot.serviceItemCount).toBe(2);
    expect(snapshot.unknownCostCount).toBe(1);
    expect(snapshot.assets.find((asset) => asset.id === 'camera')).toMatchObject({
      netCostMinor: 90_00n,
      serviceDays: 3,
      statusCode: 'in_use',
    });
  });

  it('excludes retired assets from daily portfolio cost without ending ownership', () => {
    const snapshot = calculatePortfolioSnapshot(assets, '2026-01-06');
    const camera = snapshot.assets.find((asset) => asset.id === 'camera');

    expect(camera).toMatchObject({
      isHeld: true,
      isInServicePortfolio: false,
      holdingDailyCostMinor: '1500',
    });
    expect(snapshot.currentDailyCostMinor).toBe('0');
    expect(snapshot.currentHoldingDailyCostMinor).toBe('1500');
    expect(snapshot.currentNetInvestmentMinor).toBe(90_00n);
  });

  it('produces an inclusive fixed-length trend across month boundaries', () => {
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
    const trend = calculatePortfolioTrend(assets, '2026-01-05', 3);
    expect(trend.map((point) => point.asOfDate)).toEqual([
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
    ]);
  });

  it('builds a single-asset cost curve that starts at acquisition and tracks daily cost', () => {
    const camera = assets[0];
    if (!camera) {
      throw new Error('Expected camera fixture.');
    }

    const trend = calculateAssetCostTrend(camera, '2026-01-06', 6);
    expect(trend.map((point) => point.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
      '2026-01-06',
    ]);
    expect(trend[0]).toMatchObject({
      netCostMinor: 100_00n,
      isInService: true,
      statusCode: 'in_use',
    });
    expect(trend[2]).toMatchObject({
      netCostMinor: 90_00n,
      serviceDays: 3,
    });
    // Retirement stops service accumulation but keeps lifecycle daily cost = net / serviceDays.
    expect(trend[5]).toMatchObject({
      isHeld: true,
      isInService: false,
      statusCode: 'retired',
      dailyCostMinor: '1800',
      netCostMinor: 90_00n,
    });
  });
});

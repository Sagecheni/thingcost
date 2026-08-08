import { describe, expect, it } from 'vitest';

import { calculateAssetMetrics } from '../src/asset-metrics.js';

describe('calculateAssetMetrics', () => {
  it('counts acquisition day as the first holding and service day', () => {
    const metrics = calculateAssetMetrics({
      acquisitionDate: '2026-08-05',
      asOfDate: '2026-08-05',
      netCostMinor: 100_00n,
      lifecycleEvents: [
        {
          effectiveDate: '2026-08-05',
          countsTowardService: true,
          endsOwnership: false,
        },
      ],
    });

    expect(metrics).toEqual({
      holdingDays: 1,
      serviceDays: 1,
      netCostMinor: 100_00n,
      netDailyCostMinor: '10000',
      currentlyInPortfolio: true,
      disposedOn: null,
    });
  });

  it('stops service while retired and resumes without ending ownership', () => {
    const metrics = calculateAssetMetrics({
      acquisitionDate: '2026-01-01',
      asOfDate: '2026-01-10',
      netCostMinor: 1_000_00n,
      lifecycleEvents: [
        {
          effectiveDate: '2026-01-01',
          countsTowardService: true,
          endsOwnership: false,
        },
        {
          effectiveDate: '2026-01-04',
          countsTowardService: false,
          endsOwnership: false,
        },
        {
          effectiveDate: '2026-01-08',
          countsTowardService: true,
          endsOwnership: false,
        },
      ],
    });

    expect(metrics.holdingDays).toBe(10);
    expect(metrics.serviceDays).toBe(7);
    expect(metrics.currentlyInPortfolio).toBe(true);
    expect(metrics.netDailyCostMinor).toBe('14285.71428571');
  });

  it('counts a same-day disposal as one holding and service day', () => {
    const metrics = calculateAssetMetrics({
      acquisitionDate: '2026-02-01',
      asOfDate: '2026-02-10',
      netCostMinor: -2_00n,
      lifecycleEvents: [
        {
          effectiveDate: '2026-02-01',
          countsTowardService: true,
          endsOwnership: false,
        },
        {
          effectiveDate: '2026-02-01',
          countsTowardService: false,
          endsOwnership: true,
        },
      ],
    });

    expect(metrics.holdingDays).toBe(1);
    expect(metrics.serviceDays).toBe(1);
    expect(metrics.netDailyCostMinor).toBe('-200');
    expect(metrics.currentlyInPortfolio).toBe(false);
    expect(metrics.disposedOn).toBe('2026-02-01');
  });

  it('rejects invalid calendar dates', () => {
    expect(() =>
      calculateAssetMetrics({
        acquisitionDate: '2026-02-30',
        asOfDate: '2026-03-01',
        netCostMinor: 0n,
        lifecycleEvents: [],
      }),
    ).toThrow('Invalid ISO calendar date');
  });
});

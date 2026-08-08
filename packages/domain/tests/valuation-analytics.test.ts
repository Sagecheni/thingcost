import { describe, expect, it } from 'vitest';

import {
  calculateAnnualizedDepreciationRate,
  nextValuationRunAt,
} from '../src/valuation-analytics.js';

describe('valuation analytics', () => {
  it('computes annualized depreciation across snapshots', () => {
    const rate = calculateAnnualizedDepreciationRate([
      { valuedOn: '2023-01-01', valueMinor: '10000' },
      { valuedOn: '2024-01-01', valueMinor: '8000' },
    ]);
    expect(rate).toBeCloseTo(0.2, 3);
  });

  it('returns null without enough span', () => {
    expect(
      calculateAnnualizedDepreciationRate([
        { valuedOn: '2024-01-01', valueMinor: '10000' },
        { valuedOn: '2024-01-10', valueMinor: '9000' },
      ]),
    ).toBeNull();
  });

  it('advances schedule cadences', () => {
    const from = new Date('2024-01-15T00:00:00Z');
    expect(nextValuationRunAt('manual', from)).toBeNull();
    expect(nextValuationRunAt('monthly', from)?.toISOString().slice(0, 10)).toBe(
      '2024-02-15',
    );
    expect(nextValuationRunAt('quarterly', from)?.toISOString().slice(0, 10)).toBe(
      '2024-04-15',
    );
    expect(nextValuationRunAt('yearly', from)?.toISOString().slice(0, 10)).toBe(
      '2025-01-15',
    );
  });
});

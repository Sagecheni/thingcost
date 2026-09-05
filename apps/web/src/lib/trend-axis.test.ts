import { describe, expect, it } from 'vitest';

import { trendAxisLabels } from './trend-axis.js';

function range(start: string, days: number) {
  return Array.from({ length: days }, (_, index) =>
    new Date(Date.parse(start) + index * 86_400_000).toISOString().slice(0, 10),
  );
}

describe('adaptive trend axis', () => {
  it('shows month and day for short ranges, including the endpoints', () => {
    const dates = range('2026-03-01', 30);
    const axis = trendAxisLabels(dates);
    expect(axis.formatter('2026-03-01')).toBe('03-01');
    expect(axis.interval(0, dates[0]!)).toBe(true);
    expect(axis.interval(29, dates[29]!)).toBe(true);
  });

  it('includes the year when a short range crosses New Year', () => {
    const axis = trendAxisLabels(range('2025-12-20', 30));
    expect(axis.formatter('2026-01-01')).toBe('2026-01-01');
  });

  it.each([180, 365, 730])('uses calendar months for %i days', (days) => {
    const dates = range('2024-01-15', days);
    const axis = trendAxisLabels(dates);
    const labels = dates.filter((date, index) => axis.interval(index, date));
    expect(axis.formatter('2025-01-01')).toBe('2025-01');
    expect(labels.slice(1).every((date) => date.endsWith('-01'))).toBe(true);
    expect(labels.length).toBeLessThanOrEqual(8);
    expect(labels.length).toBeGreaterThan(1);
  });

  it('uses distinct year labels for a decade while retaining daily data', () => {
    const dates = range('2016-09-05', 3650);
    const axis = trendAxisLabels(dates);
    const ticks = dates.filter((date, index) => axis.interval(index, date));
    const labels = ticks.map(axis.formatter);
    expect(labels[0]).toBe('2016年');
    expect(new Set(labels).size).toBe(labels.length);
    expect(ticks.slice(1).every((date) => date.endsWith('-01-01'))).toBe(true);
    expect(labels.length).toBeLessThanOrEqual(8);
    expect(dates).toHaveLength(3650);
  });

  it('handles a single day or an empty range', () => {
    expect(trendAxisLabels(['2026-09-05']).interval(0, '2026-09-05')).toBe(true);
    expect(trendAxisLabels([]).formatter('2026-09-05')).toBe('09-05');
  });
});

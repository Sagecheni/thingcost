import { describe, expect, it } from 'vitest';

import { dashboardQuerySchema, trendPeriodLimits } from '@thingcost/contracts';

describe('trend time range contract', () => {
  it.each([7, 30, 90, 180, 365, 366, 730, 1825, 3650])(
    'accepts %i days',
    (periodDays) => {
      expect(
        dashboardQuerySchema.parse({ periodDays: String(periodDays) }).periodDays,
      ).toBe(periodDays);
    },
  );
  it.each([6, 3651, 7.5, '', 'invalid'])('rejects invalid range %s', (periodDays) => {
    expect(dashboardQuerySchema.safeParse({ periodDays }).success).toBe(false);
  });
  it('keeps the default and shared input bounds', () => {
    expect(dashboardQuerySchema.parse({}).periodDays).toBe(30);
    expect(trendPeriodLimits).toEqual({ min: 7, max: 3650 });
  });
});

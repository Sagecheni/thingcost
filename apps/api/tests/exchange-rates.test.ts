import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeConfig } from '@thingcost/config';

import {
  convertMinorAmount,
  FrankfurterExchangeRateProvider,
} from '../src/services/exchange-rates.js';

const config = {
  FRANKFURTER_BASE_URL: 'https://rates.example.test/v2',
} as RuntimeConfig;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FrankfurterExchangeRateProvider', () => {
  it('uses the requested date when a reference rate exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ date: '2026-01-02', base: 'USD', quote: 'CNY', rate: 7.2 }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const quote = await new FrankfurterExchangeRateProvider(config).quote(
      'USD',
      'CNY',
      '2026-01-02',
    );
    expect(quote).toMatchObject({
      rate: '7.2',
      effectiveDate: '2026-01-02',
      fallback: false,
      source: 'frankfurter',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the nearest prior valid date', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ date: '2026-01-01', base: 'EUR', quote: 'CNY', rate: 7.8 }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const quote = await new FrankfurterExchangeRateProvider(config).quote(
      'EUR',
      'CNY',
      '2026-01-02',
    );
    expect(quote).toMatchObject({ effectiveDate: '2026-01-01', fallback: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('date=2026-01-01');
  });
});

describe('convertMinorAmount', () => {
  it('rounds base minor units half up without floating-point drift', () => {
    expect(convertMinorAmount(100n, '7.2')).toBe(720n);
    expect(convertMinorAmount(100n, '0.005')).toBe(1n);
  });
});

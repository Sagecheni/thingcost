import Decimal from 'decimal.js';

import type { RuntimeConfig } from '@thingcost/config';

export interface ExchangeRateQuote {
  base: string;
  quote: string;
  rate: string;
  requestedDate: string;
  effectiveDate: string;
  fallback: boolean;
  source: 'frankfurter';
}

export class ExchangeRateProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExchangeRateProviderError';
  }
}

function previousDate(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export class FrankfurterExchangeRateProvider {
  constructor(private readonly config: RuntimeConfig) {}

  async quote(
    base: string,
    quote: string,
    requestedDate: string,
  ): Promise<ExchangeRateQuote> {
    if (base === quote) {
      return {
        base,
        quote,
        rate: '1',
        requestedDate,
        effectiveDate: requestedDate,
        fallback: false,
        source: 'frankfurter',
      };
    }

    let date = requestedDate;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const url = new URL(
        `rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`,
        `${this.config.FRANKFURTER_BASE_URL.replace(/\/$/u, '')}/`,
      );
      url.searchParams.set('date', date);
      let response: Response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      } catch (error) {
        throw new ExchangeRateProviderError(
          `Frankfurter 请求失败：${error instanceof Error ? error.message : '网络错误'}`,
        );
      }
      if (response.ok) {
        const payload: unknown = await response.json();
        if (
          typeof payload === 'object' &&
          payload !== null &&
          'rate' in payload &&
          typeof payload.rate === 'number' &&
          Number.isFinite(payload.rate) &&
          payload.rate > 0
        ) {
          const rate = new Decimal(payload.rate).toSignificantDigits(16).toString();
          return {
            base,
            quote,
            rate,
            requestedDate,
            effectiveDate: date,
            fallback: date !== requestedDate,
            source: 'frankfurter',
          };
        }
      } else if (response.status >= 500 || response.status === 429) {
        throw new ExchangeRateProviderError(
          `Frankfurter 暂时不可用（HTTP ${String(response.status)}）`,
        );
      }
      date = previousDate(date);
    }

    throw new ExchangeRateProviderError('找不到该日期附近的有效参考汇率');
  }
}

export function convertMinorAmount(amountMinor: bigint, rate: string): bigint {
  const converted = new Decimal(amountMinor.toString())
    .mul(new Decimal(rate))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return BigInt(converted.toFixed(0));
}

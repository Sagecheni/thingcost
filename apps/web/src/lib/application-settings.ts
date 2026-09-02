import { useQuery } from '@tanstack/react-query';

import { api } from './api.js';
import { queryKeys } from './query-keys.js';

/**
 * The workspace currency is an accounting invariant, not a display preference.
 * Keep every authenticated money workflow on the same cached settings query.
 */
export function useApplicationSettings() {
  return useQuery({
    queryKey: queryKeys.applicationSettings,
    queryFn: api.applicationSettings,
  });
}

export function useBaseCurrency(): string {
  const settings = useApplicationSettings();
  return settings.data?.baseCurrency ?? 'CNY';
}

export const supportedCurrencies = [
  'CNY',
  'USD',
  'EUR',
  'JPY',
  'GBP',
  'HKD',
  'TWD',
  'KRW',
  'SGD',
] as const;

const currencyNames: Record<(typeof supportedCurrencies)[number], string> = {
  CNY: '人民币',
  USD: '美元',
  EUR: '欧元',
  JPY: '日元',
  GBP: '英镑',
  HKD: '港币',
  TWD: '新台币',
  KRW: '韩元',
  SGD: '新加坡元',
};

export function currencyLabel(currency: string): string {
  return currency in currencyNames
    ? `${currency} · ${currencyNames[currency as keyof typeof currencyNames]}`
    : currency;
}

export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

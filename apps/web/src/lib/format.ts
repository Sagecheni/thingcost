import { localeForIntl } from './i18n.js';

export function currencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat(localeForIntl(), {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export function formatMinorCurrency(
  amountMinor: string | null,
  currency = 'CNY',
  maximumFractionDigits = currencyFractionDigits(currency),
): string {
  if (amountMinor === null) {
    return '成本未知';
  }

  const amount = Number(amountMinor) / 10 ** currencyFractionDigits(currency);

  if (!Number.isFinite(amount)) {
    return '—';
  }

  return new Intl.NumberFormat(localeForIntl(), {
    style: 'currency',
    currency,
    maximumFractionDigits,
  }).format(amount);
}

export function formatDailyMinorCurrency(
  amountMinor: string | null,
  currency = 'CNY',
): string {
  if (amountMinor === null) {
    return '—';
  }

  const amount = Number(amountMinor) / 10 ** currencyFractionDigits(currency);
  return `${new Intl.NumberFormat(localeForIntl(), {
    style: 'currency',
    currency,
    minimumFractionDigits: Math.min(2, currencyFractionDigits(currency)),
    maximumFractionDigits: Math.max(2, currencyFractionDigits(currency)),
  }).format(Math.abs(amount))}/天`;
}

export function majorToMinor(value: string, currency = 'CNY'): string | null {
  const normalized = value.trim();
  const digits = currencyFractionDigits(currency);
  const match = new RegExp(`^(\\d+)(?:\\.(\\d{0,${String(digits)}}))?$`, 'u').exec(
    normalized,
  );
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(digits, '0');
  const multiplier = 10n ** BigInt(digits);
  return (BigInt(whole) * multiplier + BigInt(fraction || '0')).toString();
}

export function yuanToMinor(value: string): string | null {
  return majorToMinor(value, 'CNY');
}

export function signedYuanToMinor(value: string): string | null {
  const normalized = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d{0,2}))?$/u.exec(normalized);

  if (!match) {
    return null;
  }

  const sign = match[1] === '-' ? -1n : 1n;
  const whole = match[2] ?? '0';
  const fraction = (match[3] ?? '').padEnd(2, '0');
  return (sign * (BigInt(whole) * 100n + BigInt(fraction || '0'))).toString();
}

export function minorToMajor(value: string | null, currency = 'CNY'): string {
  if (value === null) return '';
  const digits = currencyFractionDigits(currency);
  const multiplier = 10n ** BigInt(digits);
  const minor = BigInt(value);
  const whole = minor / multiplier;
  if (digits === 0) return whole.toString();
  const fraction = (minor % multiplier).toString().padStart(digits, '0');
  return `${whole.toString()}.${fraction}`;
}

export function minorToYuan(value: string | null): string {
  return minorToMajor(value, 'CNY');
}

export function localToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function acquisitionTypeLabel(type: string): string {
  return (
    {
      purchase: '购买',
      gift: '受赠',
      inheritance: '继承',
      self_made: '自制',
      exchange: '交换',
      unknown: '未知',
    }[type] ?? type
  );
}

export function conditionGradeLabel(grade: string): string {
  return (
    {
      new: '全新',
      like_new: '近新',
      good: '良好',
      fair: '一般',
      poor: '较差',
    }[grade] ?? grade
  );
}

export function defectTypeLabel(type: string): string {
  return (
    {
      scratch: '划痕',
      dent: '凹陷',
      crack: '裂纹',
      missing_part: '缺件',
      functional_issue: '功能异常',
      stain: '污渍',
      wear: '磨损',
      repair_history: '维修痕迹',
      other: '其他',
    }[type] ?? type
  );
}

export function financialTypeLabel(type: string): string {
  return (
    {
      acquisition: '取得成本',
      refund: '退款',
      shipping: '运费',
      tax: '税费',
      repair: '维修',
      upgrade: '升级',
      accessory: '配件',
      fee: '手续费',
      disposal_fee: '处置费用',
      sale_proceeds: '卖出回款',
      other: '其他',
    }[type] ?? type
  );
}

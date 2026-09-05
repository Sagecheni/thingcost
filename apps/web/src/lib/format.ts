/* 只维护中文界面：格式化 locale 固定为 zh-CN。 */
const displayLocale = 'zh-CN';

export function currencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat(displayLocale, {
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

  return new Intl.NumberFormat(displayLocale, {
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
  return `${new Intl.NumberFormat(displayLocale, {
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

export function signedMajorToMinor(value: string, currency = 'CNY'): string | null {
  const normalized = value.trim();
  const digits = currencyFractionDigits(currency);
  const match = new RegExp(`^(-?)(\\d+)(?:\\.(\\d{0,${String(digits)}}))?$`, 'u').exec(
    normalized,
  );

  if (!match) return null;

  const sign = match[1] === '-' ? -1n : 1n;
  const whole = match[2] ?? '0';
  const fraction = (match[3] ?? '').padEnd(digits, '0');
  const multiplier = 10n ** BigInt(digits);
  return (sign * (BigInt(whole) * multiplier + BigInt(fraction || '0'))).toString();
}

export function signedYuanToMinor(value: string): string | null {
  return signedMajorToMinor(value, 'CNY');
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

/* ── 大写金额 ────────────────────────────────────────────────
 * 当票的传统是"大写防改"：票面数字旁边落一行壹贰叁。
 * 只覆盖到"分"的两位小数货币；三位小数货币没有对应的大写传统，返回 null。 */

const CAPITAL_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const CAPITAL_SMALL_UNITS = ['', '拾', '佰', '仟'];
const CAPITAL_GROUP_UNITS = ['', '万', '亿', '万亿'];

/* 整数部分：万进制分组，组内 仟佰拾；零的惯例是不连写、不落地。 */
function capitalInteger(value: bigint): string {
  if (value === 0n) return '';

  const groups: number[] = [];
  let rest = value;
  while (rest > 0n) {
    groups.push(Number(rest % 10000n));
    rest /= 10000n;
  }

  let result = '';
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index] ?? 0;

    if (group === 0) {
      /* 整组为零：只有后面还有非零组时才需要补一个零衔接 */
      const lowerHasValue = groups.slice(0, index).some((lower) => lower > 0);
      if (lowerHasValue && result !== '' && !result.endsWith('零')) result += '零';
      continue;
    }

    let groupText = '';
    let zeroPending = false;
    for (let position = 3; position >= 0; position--) {
      const digit = Math.floor(group / 10 ** position) % 10;
      if (digit === 0) {
        if (groupText !== '') zeroPending = true;
        continue;
      }
      if (zeroPending) {
        groupText += '零';
        zeroPending = false;
      }
      groupText += (CAPITAL_DIGITS[digit] ?? '') + (CAPITAL_SMALL_UNITS[position] ?? '');
    }

    /* 本组不满千且前面已有内容，中间断了一位，要补零衔接 */
    if (result !== '' && group < 1000 && !result.endsWith('零')) result += '零';
    result += groupText + (CAPITAL_GROUP_UNITS[index] ?? '');
  }

  return result;
}

export function chineseCapitalAmount(
  amountMinor: string,
  currency = 'CNY',
): string | null {
  const digits = currencyFractionDigits(currency);
  if (digits > 2) return null;

  let amount: bigint;
  try {
    amount = BigInt(amountMinor);
  } catch {
    return null;
  }

  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const multiplier = 10n ** BigInt(digits);
  const whole = absolute / multiplier;
  const fraction = Number(absolute % multiplier); // 两位小数货币下是 0–99
  const dimes = Math.floor(fraction / 10);
  const cents = fraction % 10;

  let body: string;
  if (whole === 0n && fraction === 0) {
    body = digits === 0 ? '零圆' : '零圆整';
  } else if (whole === 0n) {
    /* 零头不落"零圆"，直接出角分 */
    if (dimes > 0 && cents > 0) {
      body = `${CAPITAL_DIGITS[dimes]}角${CAPITAL_DIGITS[cents]}分`;
    } else if (dimes > 0) {
      body = `${CAPITAL_DIGITS[dimes]}角`;
    } else {
      body = `${CAPITAL_DIGITS[cents]}分`;
    }
  } else {
    body = `${capitalInteger(whole)}圆`;
    if (fraction === 0) {
      if (digits > 0) body += '整';
    } else if (dimes > 0) {
      body += `${CAPITAL_DIGITS[dimes]}角`;
      body += cents > 0 ? `${CAPITAL_DIGITS[cents]}分` : '整';
    } else {
      body += `零${CAPITAL_DIGITS[cents]}分`;
    }
  }

  return negative ? `负${body}` : body;
}

/* ── 干支纪年 ────────────────────────────────────────────────
 * 票角落款，不是历法：以公历年计，不做立春换年。 */

const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const EARTHLY_BRANCHES = [
  '子',
  '丑',
  '寅',
  '卯',
  '辰',
  '巳',
  '午',
  '未',
  '申',
  '酉',
  '戌',
  '亥',
];

/* 公元 4 年是甲子年，以此为锚取六十甲子 */
export function ganZhiYear(year: number): string {
  const index = (((year - 4) % 60) + 60) % 60;
  return (HEAVENLY_STEMS[index % 10] ?? '') + (EARTHLY_BRANCHES[index % 12] ?? '');
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

/* 当票号：取资产 id 尾段四位，当票惯例「当字第 N 号」。
 * 票号只负辨识不重查对，压短了头联才容得下铅字块与老档。
 * 卡片与详情页共用同一支笔 —— 同一件东西在两处必须是同一个号。 */
export function ticketNumber(assetId: string): string {
  return assetId.slice(-4).toUpperCase();
}

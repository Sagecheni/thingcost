import { describe, expect, it } from 'vitest';

import {
  chineseCapitalAmount,
  formatDailyMinorCurrency,
  formatMinorCurrency,
  ganZhiYear,
  majorToMinor,
  minorToMajor,
  signedMajorToMinor,
  signedYuanToMinor,
  yuanToMinor,
} from './format.js';
import { VINTAGE_MAX_PERCENT, VINTAGE_TIERS, vintagePercent } from './vintage.js';

describe('currency formatting', () => {
  it('converts user-entered yuan without floating point arithmetic', () => {
    expect(yuanToMinor('5000')).toBe('500000');
    expect(yuanToMinor('12.3')).toBe('1230');
    expect(yuanToMinor('0.01')).toBe('1');
    expect(yuanToMinor('12.345')).toBeNull();
  });

  it('respects ISO currency minor-unit precision', () => {
    expect(majorToMinor('1200', 'JPY')).toBe('1200');
    expect(majorToMinor('1200.5', 'JPY')).toBeNull();
    expect(minorToMajor('1200', 'JPY')).toBe('1200');
    expect(formatMinorCurrency('1200', 'JPY')).toContain('1,200');
  });

  it('accepts signed ranges without weakening expense inputs', () => {
    expect(signedYuanToMinor('-12.34')).toBe('-1234');
    expect(signedYuanToMinor('0')).toBe('0');
    expect(signedYuanToMinor('12.345')).toBeNull();
    expect(signedMajorToMinor('-12.34', 'USD')).toBe('-1234');
    expect(signedMajorToMinor('-1200', 'JPY')).toBe('-1200');
    expect(signedMajorToMinor('1200.5', 'JPY')).toBeNull();
    expect(yuanToMinor('-12.34')).toBeNull();
  });

  it('distinguishes unknown values and formats daily values', () => {
    expect(formatMinorCurrency(null)).toBe('成本未知');
    expect(formatDailyMinorCurrency('1234')).toContain('12.34');
    expect(formatDailyMinorCurrency('-1234')).toContain('12.34');
    expect(formatDailyMinorCurrency('1200', 'JPY')).toContain('1,200');
  });
});

describe('chineseCapitalAmount', () => {
  it('capitalizes whole amounts with 整', () => {
    expect(chineseCapitalAmount('123400')).toBe('壹仟贰佰叁拾肆圆整');
    expect(chineseCapitalAmount('100000')).toBe('壹仟圆整');
    expect(chineseCapitalAmount('0')).toBe('零圆整');
  });

  it('capitalizes fractions following 角/分 conventions', () => {
    expect(chineseCapitalAmount('56')).toBe('伍角陆分');
    expect(chineseCapitalAmount('50')).toBe('伍角');
    expect(chineseCapitalAmount('5')).toBe('伍分');
    expect(chineseCapitalAmount('1050')).toBe('壹拾圆伍角整');
    expect(chineseCapitalAmount('1005')).toBe('壹拾圆零伍分');
  });

  it('handles 万 groups and middle zeros without repeating 零', () => {
    expect(chineseCapitalAmount('12345600')).toBe('壹拾贰万叁仟肆佰伍拾陆圆整');
    expect(chineseCapitalAmount('10000000')).toBe('壹拾万圆整');
    expect(chineseCapitalAmount('10000100')).toBe('壹拾万零壹圆整');
    expect(chineseCapitalAmount('100500')).toBe('壹仟零伍圆整');
    expect(chineseCapitalAmount('10001000000')).toBe('壹亿零壹万圆整');
  });

  it('marks negative amounts and respects currency precision', () => {
    expect(chineseCapitalAmount('-123400')).toBe('负壹仟贰佰叁拾肆圆整');
    expect(chineseCapitalAmount('1200', 'JPY')).toBe('壹仟贰佰圆');
    expect(chineseCapitalAmount('0', 'JPY')).toBe('零圆');
    /* 三位小数货币没有对应的大写传统 */
    expect(chineseCapitalAmount('1000', 'KWD')).toBeNull();
    expect(chineseCapitalAmount('not-a-number')).toBeNull();
  });
});

describe('ganZhiYear', () => {
  it('anchors on the known cycle', () => {
    expect(ganZhiYear(4)).toBe('甲子');
    expect(ganZhiYear(2024)).toBe('甲辰');
    expect(ganZhiYear(2026)).toBe('丙午');
  });
});

describe('vintagePercent', () => {
  it('does not stain tickets younger than a year and a half', () => {
    expect(vintagePercent(0)).toBe(0);
    expect(vintagePercent(365)).toBe(0);
    expect(vintagePercent(547)).toBe(0);
  });

  it('climbs the JND-quantized tiers at their anchors', () => {
    expect(vintagePercent(548)).toBe(3);
    expect(vintagePercent(913)).toBe(6);
    expect(vintagePercent(1461)).toBe(9);
    expect(vintagePercent(2373)).toBe(12);
  });

  it('stays flat between tiers and caps at the maximum', () => {
    expect(vintagePercent(1095)).toBe(6);
    expect(vintagePercent(5000)).toBe(12);
    expect(Math.max(...VINTAGE_TIERS.map((tier) => tier.percent))).toBe(
      VINTAGE_MAX_PERCENT,
    );
    /* 档距必须 ≥3 个混比点，低于 JND 的"渐变"只是底色不均 */
    for (let index = 1; index < VINTAGE_TIERS.length; index++) {
      const current = VINTAGE_TIERS[index];
      const previous = VINTAGE_TIERS[index - 1];
      if (current && previous) {
        expect(previous.percent - current.percent).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

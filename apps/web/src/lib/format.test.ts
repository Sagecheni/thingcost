import { describe, expect, it } from 'vitest';

import {
  formatDailyMinorCurrency,
  formatMinorCurrency,
  majorToMinor,
  minorToMajor,
  signedYuanToMinor,
  yuanToMinor,
} from './format.js';

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
    expect(yuanToMinor('-12.34')).toBeNull();
  });

  it('distinguishes unknown values and formats daily values', () => {
    expect(formatMinorCurrency(null)).toBe('成本未知');
    expect(formatDailyMinorCurrency('1234')).toContain('12.34');
    expect(formatDailyMinorCurrency('-1234')).toContain('12.34');
    expect(formatDailyMinorCurrency('1200', 'JPY')).toContain('1,200');
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildValuationOutboundSummary,
  valuationSearchQuery,
} from '../src/valuation-outbound.js';

describe('valuation outbound summary', () => {
  it('keeps only non-sensitive public fields', () => {
    const summary = buildValuationOutboundSummary({
      asset: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'X100V',
        brand: 'Fujifilm',
        model: 'X100V',
        categoryName: '数码',
        acquisitionDate: '2024-01-15',
        acquisitionType: 'purchase',
        conditionGrade: 'good',
        defectLabels: ['屏幕轻微划痕'],
        publicDescription: '街拍相机',
      },
      regionHint: 'CN',
      baseCurrency: 'CNY',
    });

    expect(summary).toMatchObject({
      brand: 'Fujifilm',
      model: 'X100V',
      conditionGrade: 'good',
      defectSummary: ['屏幕轻微划痕'],
      publicDescription: '街拍相机',
      baseCurrency: 'CNY',
    });
    expect(JSON.stringify(summary)).not.toMatch(/serial|invoice|borrower|password/iu);
    expect(valuationSearchQuery(summary)).toContain('Fujifilm');
    expect(valuationSearchQuery(summary)).toContain('resale value');
  });
});

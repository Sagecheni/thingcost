/* 陈化分档：当票随年头向茶色渐变的"渐变"，是按 JND（人眼可辨阈）
 * 量化过的五档阶梯，不是连续函数 —— 0→12% 的可辨空间塞不进更多档，
 * 亚阈值的"渐变"只会让卡面看起来底色不均。
 *
 * 档位锚在年头（两/三/五/八年），档距 ≥3 个混比点（ΔE ≥1.4）。
 * 封顶 12% 的约束是对比度：再深碑拓上的次级文字会跌破 4:1，
 * 由 tokens:check 按 VINTAGE_MAX_PERCENT 的最坏情况钉住。 */

export const VINTAGE_TIERS = [
  { minDays: 2373, percent: 12 } /* 八年档（封顶） */,
  { minDays: 1461, percent: 9 } /* 五年档 */,
  { minDays: 913, percent: 6 } /* 三年档 */,
  { minDays: 548, percent: 3 } /* 两年档（一年半起染） */,
] as const;

export const VINTAGE_MAX_PERCENT = 12;

export function vintagePercent(holdingDays: number): number {
  for (const tier of VINTAGE_TIERS) {
    if (holdingDays >= tier.minDays) return tier.percent;
  }
  return 0;
}

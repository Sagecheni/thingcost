import { useEffect, useState } from 'react';

/* 图表与货架共用的调色板：只有一个来源 —— theme.css 的 token。
 * 明暗与档案载体的切换由 useChartPalette 的 MutationObserver 驱动。
 * 放在 lib 而不是 DashboardCharts：货架是纯 DOM，不应为取色
 * 把 echarts 拉进主包。 */

export interface ChartPalette {
  ink: string;
  line: string;
  muted: string;
  negative: string;
  positive: string;
  primary: string;
  ramp: string[];
  surface: string;
}

const rampFallback = ['#463a2b', '#5e4c38', '#7c6448', '#9e8060', '#c0a081'];

export function readChartPalette(): ChartPalette {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    ink: read('--foreground', '#e5e7eb'),
    line: read('--border', '#1f2937'),
    muted: read('--muted-foreground', '#9ca3af'),
    negative: read('--destructive', '#ef4444'),
    positive: read('--success', '#22c55e'),
    /* 折线用墨色不用蓝：蓝是链接借来的色，墨才是账房记账的笔 ——
     * 墨线配朱砂收笔是账册正解。四个载体各自成立：
     * 当票松烟墨、碑拓墨底拓白、蓝印蓝黑墨。 */
    primary: read('--foreground', '#3b82f6'),
    ramp: rampFallback.map((fallback, index) =>
      read(`--chart-${String(index + 1)}`, fallback),
    ),
    /* 卡片底是半透明的，图表 tooltip 和树图缝隙必须用不透明的那个 */
    surface: read('--card-solid', '#111827'),
  };
}

export function useChartPalette() {
  const [palette, setPalette] = useState<ChartPalette>(readChartPalette);

  useEffect(() => {
    const update = () => setPalette(readChartPalette());
    const observer = new MutationObserver(update);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    observer.observe(document.documentElement, {
      /* 明暗和档案载体都会换掉整套 token，两个属性都要盯 */
      attributeFilter: ['data-theme', 'data-style'],
      attributes: true,
    });
    mediaQuery.addEventListener('change', update);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', update);
    };
  }, []);

  return palette;
}

function relativeLuminance(color: string): number | null {
  const match = /^#([\da-f]{6})$/iu.exec(color.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => {
    const srgb = ((value >> shift) & 0xff) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/* 色阶跨度大，字不能固定用一种墨 —— 按每格底色挑对比度更高的一侧。
 * 两侧都是载体自己的色（亮格用标题墨，暗格用纸色），
 * 不引外来的冷调海军蓝。 */
export function readableInk(background: string): string {
  const luminance = relativeLuminance(background);
  if (luminance === null) return 'var(--card-solid)';
  const onLight = (luminance + 0.05) / 0.05;
  const onDark = 1.05 / (luminance + 0.05);
  return onLight >= onDark ? 'var(--heading)' : 'var(--card-solid)';
}

/* 量级 → 色阶。净投入分布通常长尾，用 sqrt 让小额分类之间也拉得开。 */
export function rampStep(value: number, max: number, ramp: string[]): string {
  const last = ramp.at(-1) ?? rampFallback[4] ?? '#13575e';
  if (max <= 0 || !Number.isFinite(value)) return last;
  const ratio = Math.sqrt(Math.min(1, Math.max(0, value / max)));
  return ramp[Math.min(ramp.length - 1, Math.floor(ratio * ramp.length))] ?? last;
}

export function withAlpha(color: string, alpha: string) {
  return /^#[\da-f]{6}$/iu.test(color) ? `${color}${alpha}` : color;
}

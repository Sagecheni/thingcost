import { LineChart, TreemapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { type EChartsCoreOption, init, use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef, useState } from 'react';

import type { Dashboard } from '@thingcost/contracts';

import { currencyFractionDigits } from '../lib/format.js';
import { localeForIntl } from '../lib/i18n.js';

use([LineChart, TreemapChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface ChartPalette {
  ink: string;
  line: string;
  muted: string;
  negative: string;
  positive: string;
  primary: string;
  ramp: string[];
  surface: string;
}

const chartFont =
  'ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif';

const rampFallback = ['#82b5bb', '#5b9fa7', '#358891', '#1a7078', '#13575e'];

/* 只有一个来源：theme.css 的 token。主题切换由下面的 MutationObserver 驱动，
 * 不再按路由分叉出第二套调色板。 */
function readChartPalette(): ChartPalette {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    ink: read('--foreground', '#1c1a17'),
    line: read('--border', '#e5e0d8'),
    muted: read('--muted-foreground', '#6b655c'),
    negative: read('--destructive', '#a33a2e'),
    positive: read('--success', '#3f6b47'),
    primary: read('--primary', '#2f5d62'),
    ramp: rampFallback.map((fallback, index) =>
      read(`--chart-${String(index + 1)}`, fallback),
    ),
    surface: read('--card', '#ffffff'),
  };
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

/* 树图色阶跨度大，标签不能固定用白色 —— 按每格底色挑对比度更高的一侧。 */
function readableInk(background: string): string {
  const luminance = relativeLuminance(background);
  if (luminance === null) return '#fdfcfa';
  const onLight = (luminance + 0.05) / 0.05;
  const onDark = 1.05 / (luminance + 0.05);
  return onLight >= onDark ? '#1c1a17' : '#fdfcfa';
}

/* 量级 → 色阶。净投入分布通常长尾，用 sqrt 让小额分类之间也拉得开。 */
function rampStep(value: number, max: number, ramp: string[]): string {
  const last = ramp.at(-1) ?? rampFallback[4] ?? '#13575e';
  if (max <= 0 || !Number.isFinite(value)) return last;
  const ratio = Math.sqrt(Math.min(1, Math.max(0, value / max)));
  return ramp[Math.min(ramp.length - 1, Math.floor(ratio * ramp.length))] ?? last;
}

function withAlpha(color: string, alpha: string) {
  return /^#[\da-f]{6}$/iu.test(color) ? `${color}${alpha}` : color;
}

function majorFromMinor(value: string, currency: string): number {
  return Number(value) / 10 ** currencyFractionDigits(currency);
}

function formatMajorCurrency(value: unknown, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';

  return new Intl.NumberFormat(localeForIntl(), {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function useChartPalette() {
  const [palette, setPalette] = useState<ChartPalette>(readChartPalette);

  useEffect(() => {
    const update = () => setPalette(readChartPalette());
    const observer = new MutationObserver(update);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    mediaQuery.addEventListener('change', update);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', update);
    };
  }, []);

  return palette;
}

function useChart(option: EChartsCoreOption) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;

    if (!element) {
      return;
    }

    const chart = init(element, undefined, { renderer: 'canvas' });
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);

    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);

  return elementRef;
}

function chartTooltip(palette: ChartPalette) {
  return {
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
    extraCssText:
      'border-radius:4px;box-shadow:0 4px 12px rgba(28,26,23,.10);padding:8px 10px;',
    textStyle: {
      color: palette.ink,
      fontFamily: chartFont,
      fontSize: 12,
    },
  };
}

function categoryAxis(palette: ChartPalette, dates: string[]) {
  return {
    type: 'category' as const,
    boundaryGap: false,
    data: dates,
    /* 坐标轴退到背景里：一条细暖线，不抢数据的注意力 */
    axisLine: { lineStyle: { color: palette.line, width: 1 } },
    axisLabel: {
      color: palette.muted,
      fontFamily: chartFont,
      fontSize: 11,
      hideOverlap: true,
    },
    axisTick: { show: false },
  };
}

function valueAxis(palette: ChartPalette, currency: string) {
  return {
    type: 'value' as const,
    axisLabel: {
      color: palette.muted,
      fontFamily: chartFont,
      fontSize: 11,
      formatter: (value: number) =>
        new Intl.NumberFormat(localeForIntl(), {
          style: 'currency',
          currency,
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(value),
    },
    axisLine: { show: false },
    splitLine: { lineStyle: { color: palette.line, type: 'dashed' as const } },
  };
}

export type PortfolioTrendMetric =
  'netInvestment' | 'holdingDailyCost' | 'serviceDailyCost';

export function PortfolioTrendChart({
  currency,
  metric,
  trend,
}: {
  currency: string;
  metric: PortfolioTrendMetric;
  trend: Dashboard['trend'];
}) {
  const palette = useChartPalette();
  const metadata = {
    netInvestment: {
      name: '持有资产净投入',
      value: (point: Dashboard['trend'][number]) => point.netInvestmentMinor,
      suffix: '',
    },
    holdingDailyCost: {
      name: '日均持有成本',
      value: (point: Dashboard['trend'][number]) => point.holdingDailyCostMinor,
      suffix: '/天',
    },
    serviceDailyCost: {
      name: '日均服役成本',
      value: (point: Dashboard['trend'][number]) => point.dailyCostMinor,
      suffix: '/天',
    },
  }[metric];
  const option: EChartsCoreOption = {
    animationDuration: 180,
    grid: { top: 20, right: 18, bottom: 32, left: 64 },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) =>
        `${formatMajorCurrency(value, currency)}${metadata.suffix}`,
      /* 十字准星：折线图默认带悬停层 */
      axisPointer: {
        type: 'line',
        lineStyle: { color: palette.muted, type: 'dashed', width: 1 },
      },
      ...chartTooltip(palette),
    },
    xAxis: categoryAxis(
      palette,
      trend.map((point) => point.date.slice(5)),
    ),
    yAxis: valueAxis(palette, currency),
    series: [
      {
        name: metadata.name,
        type: 'line',
        /* 单序列 —— 图注由 figcaption 承担，不需要图例，颜色也不承担身份。
         * 不平滑：折线是账目，不该被插值美化。 */
        smooth: false,
        showSymbol: trend.length <= 30,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { color: palette.primary, width: 2 },
        itemStyle: {
          color: palette.primary,
          /* 与底色同色的描边，让重叠的点互相分开 */
          borderColor: palette.surface,
          borderWidth: 2,
        },
        areaStyle: { color: withAlpha(palette.primary, '14') },
        data: trend.map((point) => majorFromMinor(metadata.value(point), currency)),
      },
    ],
  };
  const ref = useChart(option);
  return (
    <div
      className="chart-canvas"
      ref={ref}
      role="img"
      aria-label={`${metadata.name}趋势图`}
    />
  );
}

export function AssetMapChart({
  categories,
  currency,
}: {
  categories: Dashboard['categories'];
  currency: string;
}) {
  const palette = useChartPalette();
  const positiveCategories = categories.filter(
    (category) => BigInt(category.netCostMinor) > 0n,
  );
  const useNetInvestment = positiveCategories.length > 0;
  const visibleCategories = useNetInvestment ? positiveCategories : categories;
  const tileValue = (category: Dashboard['categories'][number]) =>
    useNetInvestment
      ? majorFromMinor(category.netCostMinor, currency)
      : category.itemCount;
  const maxTileValue = visibleCategories.reduce(
    (largest, category) => Math.max(largest, tileValue(category)),
    0,
  );
  const option: EChartsCoreOption = {
    animationDuration: 180,
    tooltip: {
      trigger: 'item',
      formatter: (parameters: unknown) => {
        const item = parameters as {
          data?: { itemCount?: number; name?: string; netCostMinor?: string };
        };
        return [
          item.data?.name ?? '',
          `净投入 ${formatMajorCurrency(
            majorFromMinor(item.data?.netCostMinor ?? '0', currency),
            currency,
          )}`,
          `${String(item.data?.itemCount ?? 0)} 件物品`,
        ].join('<br/>');
      },
      ...chartTooltip(palette),
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        label: {
          show: true,
          fontFamily: chartFont,
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 20,
          overflow: 'truncate',
          formatter: (parameters: unknown) => {
            const item = parameters as {
              data?: { name?: string; netCostMinor?: string };
            };
            return `${item.data?.name ?? ''}\n${formatMajorCurrency(
              majorFromMinor(item.data?.netCostMinor ?? '0', currency),
              currency,
            )}`;
          },
        },
        upperLabel: { show: false },
        itemStyle: {
          /* 与底色同色的 2px 间隙，让相邻色块彼此分开 */
          borderColor: palette.surface,
          borderWidth: 2,
          gapWidth: 2,
          borderRadius: 2,
        },
        emphasis: {
          focus: 'self',
          itemStyle: { borderColor: palette.primary, borderWidth: 2 },
        },
        data: visibleCategories.map((category) => {
          /* 分类自带颜色时优先用用户设定；否则按量级取墨青色阶。
           * 颜色跟着量级走，不跟着排位走 —— 筛掉几个分类不会让其余的重新上色。 */
          const fill =
            category.color ?? rampStep(tileValue(category), maxTileValue, palette.ramp);
          return {
            name: category.name,
            value: tileValue(category),
            itemCount: category.itemCount,
            netCostMinor: category.netCostMinor,
            itemStyle: { color: fill },
            label: { color: readableInk(fill) },
          };
        }),
      },
    ],
  };
  const ref = useChart(option);
  return (
    <div
      className="chart-canvas"
      ref={ref}
      role="img"
      aria-label="按分类展示的资产净投入版图；右侧排行提供精确数据"
    />
  );
}

export function AssetCostTrendChart({
  currency = 'CNY',
  trend,
}: {
  currency?: string;
  trend: Array<{
    date: string;
    dailyCostMinor: string | null;
  }>;
}) {
  const palette = useChartPalette();
  const showSymbol = trend.length <= 14;
  const option: EChartsCoreOption = {
    animationDuration: 180,
    grid: { top: 24, right: 18, bottom: 30, left: 58 },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) =>
        value === null || value === undefined
          ? '—'
          : `${formatMajorCurrency(value, currency)}/天`,
      ...chartTooltip(palette),
    },
    xAxis: categoryAxis(
      palette,
      trend.map((point) => point.date.slice(5)),
    ),
    yAxis: valueAxis(palette, currency),
    series: [
      {
        name: '日均成本',
        type: 'line',
        smooth: false,
        showSymbol,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { color: palette.primary, width: 2 },
        itemStyle: {
          color: palette.primary,
          borderColor: palette.surface,
          borderWidth: 2,
        },
        areaStyle: { color: withAlpha(palette.primary, '14') },
        data: trend.map((point) =>
          point.dailyCostMinor === null
            ? null
            : majorFromMinor(point.dailyCostMinor, currency),
        ),
      },
    ],
  };
  const ref = useChart(option);
  return (
    <div className="chart-canvas" ref={ref} role="img" aria-label="物品日均成本趋势图" />
  );
}

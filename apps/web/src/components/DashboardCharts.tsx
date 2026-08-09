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
  accent: string;
  edge: string;
  gold: string;
  ink: string;
  isReport: boolean;
  muted: string;
  positive: string;
  slot: string;
  water: string;
}

const reportCategoryColors = [
  '#6f88da',
  '#d2ad75',
  '#4eae82',
  '#b57568',
  '#7d72bc',
  '#568ca4',
  '#a98458',
  '#7c8b68',
];

function resolvedThemeIsDark(): boolean {
  const theme = document.documentElement.dataset.theme;
  return (
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
}

function readChartPalette(): ChartPalette {
  if (window.location.pathname === '/') {
    return resolvedThemeIsDark()
      ? {
          accent: '#7d98ff',
          edge: '#34383d',
          gold: '#d5b27a',
          ink: '#f4f2ed',
          isReport: true,
          muted: '#9da1a6',
          positive: '#4bc68b',
          slot: '#1b1e21',
          water: '#78a9c2',
        }
      : {
          accent: '#3764c6',
          edge: '#d9dde1',
          gold: '#a86d25',
          ink: '#181b1e',
          isReport: true,
          muted: '#687078',
          positive: '#267a5a',
          slot: '#ffffff',
          water: '#397f9f',
        };
  }

  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    accent: read('--orange', '#ff9838'),
    edge: read('--slot-dark', '#0e121b'),
    gold: read('--hero-signal', '#ffd45a'),
    ink: read('--ink', '#fff1c5'),
    isReport: false,
    muted: read('--muted', '#aaaeb9'),
    positive: read('--lime', '#7edc83'),
    slot: read('--slot', '#202635'),
    water: read('--cyan', '#68c8d3'),
  };
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
    backgroundColor: palette.slot,
    borderColor: palette.edge,
    borderWidth: palette.isReport ? 1 : 3,
    extraCssText: palette.isReport
      ? 'border-radius:10px;box-shadow:0 14px 32px rgba(0,0,0,.22);'
      : 'border-radius:0;box-shadow:4px 4px 0 rgba(0,0,0,.28);',
    textStyle: {
      color: palette.ink,
      fontFamily: palette.isReport
        ? 'Inter, PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif'
        : 'Fusion Pixel Chronicle',
      fontSize: palette.isReport ? 12 : 11,
    },
  };
}

function categoryAxis(palette: ChartPalette, dates: string[]) {
  return {
    type: 'category' as const,
    boundaryGap: false,
    data: dates,
    axisLine: {
      lineStyle: { color: palette.edge, width: palette.isReport ? 1 : 3 },
    },
    axisLabel: {
      color: palette.muted,
      fontFamily: palette.isReport
        ? 'Inter, PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif'
        : 'Fusion Pixel Chronicle',
      fontSize: palette.isReport ? 11 : 10,
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
      fontFamily: palette.isReport
        ? 'Inter, PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif'
        : 'Fusion Pixel Chronicle',
      fontSize: palette.isReport ? 11 : 10,
      formatter: (value: number) =>
        new Intl.NumberFormat(localeForIntl(), {
          style: 'currency',
          currency,
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(value),
    },
    splitLine: {
      lineStyle: {
        color: withAlpha(palette.muted, palette.isReport ? '20' : '30'),
        type: palette.isReport ? 'dashed' : 'solid',
      },
    },
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
      color: palette.gold,
      value: (point: Dashboard['trend'][number]) => point.netInvestmentMinor,
      suffix: '',
    },
    holdingDailyCost: {
      name: '日均持有成本',
      color: palette.accent,
      value: (point: Dashboard['trend'][number]) => point.holdingDailyCostMinor,
      suffix: '/天',
    },
    serviceDailyCost: {
      name: '日均服役成本',
      color: palette.positive,
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
        smooth: palette.isReport ? 0.18 : false,
        showSymbol: trend.length <= 30,
        symbol: palette.isReport ? 'circle' : 'rect',
        symbolSize: palette.isReport ? 6 : 7,
        lineStyle: { color: metadata.color, width: palette.isReport ? 3 : 4 },
        itemStyle: {
          color: metadata.color,
          borderColor: palette.slot,
          borderWidth: palette.isReport ? 2 : 1,
        },
        areaStyle: {
          color: withAlpha(metadata.color, palette.isReport ? '18' : '2e'),
        },
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
          color: '#ffffff',
          fontFamily:
            'Inter, PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif',
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
          borderColor: palette.slot,
          borderWidth: 4,
          gapWidth: 4,
          borderRadius: 8,
        },
        emphasis: {
          focus: 'self',
          itemStyle: { borderColor: palette.gold, borderWidth: 3 },
        },
        data: visibleCategories.map((category, index) => ({
          name: category.name,
          value: useNetInvestment
            ? majorFromMinor(category.netCostMinor, currency)
            : category.itemCount,
          itemCount: category.itemCount,
          netCostMinor: category.netCostMinor,
          itemStyle: {
            color:
              category.color ??
              reportCategoryColors[index % reportCategoryColors.length] ??
              palette.accent,
          },
        })),
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
        smooth: palette.isReport ? 0.16 : false,
        showSymbol,
        symbol: palette.isReport ? 'circle' : 'rect',
        symbolSize: palette.isReport ? 6 : 7,
        lineStyle: { color: palette.water, width: palette.isReport ? 3 : 4 },
        itemStyle: {
          color: palette.water,
          borderColor: palette.edge,
          borderWidth: 1,
        },
        areaStyle: {
          color: withAlpha(palette.water, palette.isReport ? '14' : '2a'),
        },
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

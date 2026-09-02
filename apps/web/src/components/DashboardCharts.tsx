import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { type EChartsCoreOption, type EChartsType, init, use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

import type { Dashboard } from '@thingcost/contracts';

import { type ChartPalette, useChartPalette, withAlpha } from '../lib/chart-palette.js';
import { currencyFractionDigits, financialTypeLabel } from '../lib/format.js';
/* 只维护中文界面：图表格式化 locale 固定为 zh-CN。 */
const displayLocale = 'zh-CN';

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const chartFont =
  'ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif';

function majorFromMinor(value: string, currency: string): number {
  return Number(value) / 10 ** currencyFractionDigits(currency);
}

function formatMajorCurrency(value: unknown, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';

  return new Intl.NumberFormat(displayLocale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatSignedMajorCurrency(value: number, currency: string): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(displayLocale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    signDisplay: 'always',
  }).format(value);
}

function formatPercentChange(start: number, current: number): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(current) || start === 0) return null;
  return new Intl.NumberFormat(displayLocale, {
    maximumFractionDigits: 1,
    signDisplay: 'always',
    style: 'percent',
  }).format((current - start) / Math.abs(start));
}

function formatTrendDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) return date;
  return new Intl.DateTimeFormat(displayLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(motionIsReduced);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mediaQuery.matches);
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return reduced;
}

function useTrendCursor(length: number, rangeKey: string) {
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, length - 1));
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    setActiveIndex(Math.max(0, length - 1));
  }, [length, rangeKey]);

  const selectedIndex = Math.min(Math.max(0, activeIndex), Math.max(0, length - 1));
  const selectFromKeyboard = (
    event: KeyboardEvent<HTMLDivElement>,
    describe: (index: number) => string,
    showTip: (index: number) => void,
  ) => {
    let nextIndex = selectedIndex;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextIndex -= 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextIndex += 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = length - 1;
    else return;

    event.preventDefault();
    nextIndex = Math.min(Math.max(0, nextIndex), Math.max(0, length - 1));
    setActiveIndex(nextIndex);
    setAnnouncement(describe(nextIndex));
    showTip(nextIndex);
  };

  return { activeIndex: selectedIndex, announcement, selectFromKeyboard, setActiveIndex };
}

function dataIndexFromPointerEvent(event: unknown, dates: string[]): number | null {
  const pointer = event as {
    dataIndex?: number;
    axesInfo?: Array<{
      value?: number | string;
      seriesDataIndices?: Array<{ dataIndex?: number }>;
    }>;
  };
  if (typeof pointer.dataIndex === 'number') return pointer.dataIndex;
  const axis = pointer.axesInfo?.[0];
  const seriesIndex = axis?.seriesDataIndices?.[0]?.dataIndex;
  if (typeof seriesIndex === 'number') return seriesIndex;
  if (typeof axis?.value === 'number') return axis.value;
  if (typeof axis?.value === 'string') {
    const index = dates.findIndex(
      (date) => date === axis.value || date.slice(5) === axis.value,
    );
    return index >= 0 ? index : null;
  }
  return null;
}

function TrendReading({
  context,
  currency,
  current,
  date,
  decreaseIsPositive,
  initial,
  previous,
  suffix,
}: {
  context: string;
  currency: string;
  current: number | null;
  date: string;
  decreaseIsPositive: boolean | null;
  initial: number | null;
  previous: number | null;
  suffix: string;
}) {
  const dailyDelta = current !== null && previous !== null ? current - previous : null;
  const rangeDelta = current !== null && initial !== null ? current - initial : null;
  const percent =
    current !== null && initial !== null ? formatPercentChange(initial, current) : null;
  const favorable =
    rangeDelta !== null &&
    decreaseIsPositive !== null &&
    (decreaseIsPositive ? rangeDelta < 0 : rangeDelta > 0);
  const changeTone =
    rangeDelta === null || rangeDelta === 0
      ? 'text-muted-foreground'
      : favorable
        ? 'text-success'
        : '';

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-dashed border-border pb-3">
      <div className="space-y-0.5">
        <time
          data-slot="amount"
          className="block text-xs text-muted-foreground"
          dateTime={date}
        >
          {formatTrendDate(date)}
        </time>
        <p className="text-xs text-muted-foreground">{context}</p>
      </div>
      <div className="text-right">
        <strong data-slot="amount" className="block text-lg leading-none text-heading">
          {current === null ? '—' : formatMajorCurrency(current, currency)}
          {current !== null && suffix ? (
            <span className="ml-1 font-sans text-[11px] font-normal text-muted-foreground">
              {suffix}
            </span>
          ) : null}
        </strong>
        {dailyDelta === null || rangeDelta === null ? (
          <p className="mt-1 text-[11px] text-muted-foreground">当日口径不适用</p>
        ) : (
          <p data-slot="amount" className="mt-1 text-[11px] text-muted-foreground">
            较前一日 {formatSignedMajorCurrency(dailyDelta, currency)}
            <span aria-hidden="true"> · </span>
            <span className={changeTone}>
              较区间起点 {formatSignedMajorCurrency(rangeDelta, currency)}
              {percent ? `（${percent}）` : ''}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

function motionIsReduced(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/* 图表实例只在挂载时建立一次；option 变化走 setOption 合并更新，指标与
 * 时间范围切换才会有连续关系，而不是销毁画布后重新闪现。 */
function useChart(
  option: EChartsCoreOption,
  {
    deferUntilVisible = false,
    onInit,
    onReady,
  }: {
    deferUntilVisible?: boolean;
    onInit?: (chart: EChartsType) => void;
    onReady?: (chart: EChartsType) => void;
  } = {},
) {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [hasEntered, setHasEntered] = useState(!deferUntilVisible);
  const onInitRef = useRef(onInit);
  const onReadyRef = useRef(onReady);
  onInitRef.current = onInit;
  onReadyRef.current = onReady;

  useEffect(() => {
    const element = elementRef.current;

    if (!element) {
      return;
    }

    const chart = init(element, undefined, {
      renderer: 'canvas',
      useCoarsePointer: true,
      pointerSize: 44,
    });
    chartRef.current = chart;
    onInitRef.current?.(chart);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    const visibilityObserver =
      deferUntilVisible && 'IntersectionObserver' in window
        ? new IntersectionObserver(
            ([entry]) => {
              if (!entry?.isIntersecting) return;
              setHasEntered(true);
              visibilityObserver?.disconnect();
            },
            { rootMargin: '80px 0px' },
          )
        : null;
    if (visibilityObserver) visibilityObserver.observe(element);
    else setHasEntered(true);

    return () => {
      visibilityObserver?.disconnect();
      observer.disconnect();
      chartRef.current = null;
      chart.dispose();
    };
  }, [deferUntilVisible]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !hasEntered) return;

    chart.setOption(option, {
      lazyUpdate: false,
      notMerge: false,
      replaceMerge: ['series'],
    });
    onReadyRef.current?.(chart);
  }, [hasEntered, option]);

  return elementRef;
}

function chartTooltip(palette: ChartPalette) {
  return {
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
    /* 直角、无柔光 —— tooltip 也是一张纸片 */
    extraCssText: 'border-radius:0;box-shadow:none;padding:8px 10px;',
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
        new Intl.NumberFormat(displayLocale, {
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
  const reducedMotion = useReducedMotion();
  const chartRef = useRef<EChartsType | null>(null);
  const metadata = useMemo(
    () =>
      ({
        netInvestment: {
          name: '持有资产净投入',
          value: (point: Dashboard['trend'][number]) => point.netInvestmentMinor,
          suffix: '',
          /* 净投入是阶梯不是曲线：平的时候什么也没买，跳一级就是入了一件。
           * 插值成斜线等于凭空画出不存在的中间状态。 */
          stepped: true,
        },
        holdingDailyCost: {
          name: '日均持有成本',
          value: (point: Dashboard['trend'][number]) => point.holdingDailyCostMinor,
          suffix: '/天',
          /* 日均成本每天都在变（分母天天涨），是真的连续量 */
          stepped: false,
        },
        serviceDailyCost: {
          name: '日均服役成本',
          value: (point: Dashboard['trend'][number]) => point.dailyCostMinor,
          suffix: '/天',
          stepped: false,
        },
      })[metric],
    [metric],
  );
  const dates = useMemo(() => trend.map((point) => point.date), [trend]);
  const values = useMemo(
    () => trend.map((point) => majorFromMinor(metadata.value(point), currency)),
    [currency, metadata, trend],
  );
  const rangeKey = `${metric}:${dates[0] ?? ''}:${dates.at(-1) ?? ''}`;
  const cursor = useTrendCursor(trend.length, rangeKey);
  const datesRef = useRef(dates);
  const setActiveIndexRef = useRef(cursor.setActiveIndex);
  datesRef.current = dates;
  setActiveIndexRef.current = cursor.setActiveIndex;
  const lastIndex = Math.max(0, values.length - 1);
  const activeIndex = Math.min(cursor.activeIndex, lastIndex);
  const activePoint = trend[activeIndex];
  const activeValue = values[activeIndex] ?? 0;
  const initialValue = values[0] ?? activeValue;
  const previousValue = values[Math.max(0, activeIndex - 1)] ?? activeValue;

  const option = useMemo<EChartsCoreOption>(() => {
    const data = values.map((value, index) => {
      const previous = values[Math.max(0, index - 1)] ?? value;
      const isLedgerEvent = metadata.stepped && index > 0 && value !== previous;
      const isLatest = index === lastIndex;
      return {
        value,
        /* 阶梯在真实跳变处落方章；曲线收笔于最新读数 —— 一颗朱砂顿点。 */
        symbolSize: isLedgerEvent ? 7 : isLatest ? 8 : 0,
        ...(isLatest
          ? {
              symbol: 'circle',
              itemStyle: {
                color: palette.negative,
                borderColor: palette.surface,
                borderWidth: 2,
              },
            }
          : {}),
      };
    });

    return {
      animation: !reducedMotion,
      animationDuration: reducedMotion ? 0 : 480,
      animationDurationUpdate: reducedMotion ? 0 : 280,
      animationEasing: 'cubicOut',
      animationEasingUpdate: 'cubicOut',
      /* containLabel 让 ECharts 自己给坐标轴文字留位置，不用手写 left 边距 */
      grid: { top: 16, right: 16, bottom: 8, left: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        triggerOn: 'mousemove|click',
        confine: true,
        transitionDuration: reducedMotion ? 0 : 0.12,
        valueFormatter: (value: unknown) =>
          `${formatMajorCurrency(value, currency)}${metadata.suffix}`,
        /* 可吸附准星同时服务鼠标、触摸和键盘。 */
        axisPointer: {
          type: 'line',
          snap: true,
          lineStyle: { color: palette.muted, type: 'dashed', width: 1 },
        },
        ...chartTooltip(palette),
      },
      xAxis: categoryAxis(
        palette,
        dates.map((date) => date.slice(5)),
      ),
      yAxis: valueAxis(palette, currency),
      series: [
        {
          id: 'portfolio-trend',
          name: metadata.name,
          type: 'line',
          /* 单序列 —— 图注由 figcaption 承担，不需要图例，颜色也不承担身份。
           * 不平滑：折线是账目，不该被插值美化。 */
          smooth: false,
          step: metadata.stepped ? ('end' as const) : (false as const),
          showSymbol: true,
          symbol: 'rect',
          sampling: 'lttb',
          /* 淡墨入笔：越旧的账墨越淡，越近越黑 */
          lineStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: withAlpha(palette.primary, '8C') },
                { offset: 0.7, color: palette.primary },
                { offset: 1, color: palette.primary },
              ],
            },
            width: 2,
          },
          itemStyle: {
            color: palette.primary,
            borderColor: palette.surface,
            borderWidth: 2,
          },
          emphasis: { scale: reducedMotion ? false : 1.35 },
          /* 净投入依靠阶梯本身表意；连续日均线才保留极淡的摊薄面积。 */
          areaStyle: metadata.stepped
            ? undefined
            : {
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: withAlpha(palette.primary, '18') },
                    { offset: 1, color: withAlpha(palette.primary, '00') },
                  ],
                },
              },
          data,
        },
      ],
    };
  }, [currency, dates, lastIndex, metadata, palette, reducedMotion, values]);

  const ref = useChart(option, {
    deferUntilVisible: true,
    onInit: (chart) => {
      chartRef.current = chart;
      chart.on('updateAxisPointer', (event) => {
        const index = dataIndexFromPointerEvent(event, datesRef.current);
        if (index !== null) setActiveIndexRef.current(index);
      });
      chart.on('click', (event) => {
        const index = dataIndexFromPointerEvent(event, datesRef.current);
        if (index !== null) setActiveIndexRef.current(index);
      });
    },
  });
  const showTip = (index: number) => {
    chartRef.current?.dispatchAction({
      type: 'showTip',
      seriesIndex: 0,
      dataIndex: index,
    });
  };
  const describe = (index: number) => {
    const point = trend[index];
    const value = values[index];
    if (!point || value === undefined) return '';
    return `${formatTrendDate(point.date)}，${metadata.name} ${formatMajorCurrency(value, currency)}${metadata.suffix}`;
  };

  if (!activePoint) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">暂无趋势数据</p>
    );
  }

  return (
    <div className="space-y-2">
      <TrendReading
        context={activeIndex === lastIndex ? '当前账页' : '准星定位账页'}
        currency={currency}
        current={activeValue}
        date={activePoint.date}
        decreaseIsPositive={metric === 'netInvestment' ? null : true}
        initial={initialValue}
        previous={previousValue}
        suffix={metadata.suffix}
      />
      <div
        aria-label={`${metadata.name}趋势图。按左右方向键逐日查看；触摸或拖动图表可移动准星。当前为 ${describe(activeIndex)}`}
        className="h-[260px] w-full touch-pan-y focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-[300px]"
        onKeyDown={(event) => cursor.selectFromKeyboard(event, describe, showTip)}
        ref={ref}
        role="group"
        tabIndex={0}
      />
      <p className="text-[11px] text-muted-foreground">
        拖动准星或使用左右方向键逐日查看；朱砂圆点表示最新读数
        {metadata.stepped ? '，阶梯上的方形印记表示净投入发生变化' : ''}。
      </p>
      <p className="sr-only" aria-live="polite">
        {cursor.announcement}
      </p>
    </div>
  );
}

export interface CostTrendEvent {
  baseAmountMinor: string;
  baseCurrency: string;
  direction: 'inflow' | 'outflow';
  occurredOn: string;
  type: string;
}

export function AssetCostTrendChart({
  currency = 'CNY',
  trend,
  events = [],
  referenceDailyMajor = null,
}: {
  currency?: string;
  trend: Array<{
    date: string;
    dailyCostMinor: string | null;
  }>;
  /* 资金事件：在曲线上落竖向刻度，悬停那一天的 tooltip 里写明金额 */
  events?: CostTrendEvent[];
  /* 合脚线：全期加权日均（major 单位），null 则不画 */
  referenceDailyMajor?: number | null;
}) {
  const palette = useChartPalette();
  const reducedMotion = useReducedMotion();
  const chartRef = useRef<EChartsType | null>(null);
  const dates = useMemo(() => trend.map((point) => point.date), [trend]);
  const values = useMemo(
    () =>
      trend.map((point) =>
        point.dailyCostMinor === null
          ? null
          : majorFromMinor(point.dailyCostMinor, currency),
      ),
    [currency, trend],
  );
  const rangeKey = `${dates[0] ?? ''}:${dates.at(-1) ?? ''}`;
  const cursor = useTrendCursor(trend.length, rangeKey);
  const datesRef = useRef(dates);
  const setActiveIndexRef = useRef(cursor.setActiveIndex);
  datesRef.current = dates;
  setActiveIndexRef.current = cursor.setActiveIndex;
  const lastIndex = Math.max(0, values.length - 1);
  const activeIndex = Math.min(cursor.activeIndex, lastIndex);
  const activePoint = trend[activeIndex];
  const activeValue = values[activeIndex] ?? null;
  const initialValue = values.find((value): value is number => value !== null) ?? null;
  const previousValue = values[Math.max(0, activeIndex - 1)] ?? activeValue;

  /* tooltip 按 MM-DD 查事件；一天多笔就全列出来 */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CostTrendEvent[]>();
    for (const event of events) {
      const key = event.occurredOn.slice(5);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events]);

  /* 刻度只画可视窗口内的事件；一天一笔，位置去重 */
  const visibleEventDates = useMemo(() => {
    const first = dates[0];
    const last = dates.at(-1);
    if (!first || !last) return [];
    return [
      ...new Set(
        events
          .filter((event) => event.occurredOn >= first && event.occurredOn <= last)
          .map((event) => event.occurredOn.slice(5)),
      ),
    ];
  }, [dates, events]);

  const option = useMemo<EChartsCoreOption>(() => {
    const data = values.map((value, index) => {
      const isLatest = index === lastIndex && value !== null;
      return {
        value,
        /* 收笔：最新读数落一颗朱砂顿点 */
        symbolSize: isLatest ? 8 : 0,
        ...(isLatest
          ? {
              symbol: 'circle',
              itemStyle: {
                color: palette.negative,
                borderColor: palette.surface,
                borderWidth: 2,
              },
            }
          : {}),
      };
    });
    return {
      animation: !reducedMotion,
      animationDuration: reducedMotion ? 0 : 480,
      animationDurationUpdate: reducedMotion ? 0 : 280,
      animationEasing: 'cubicOut',
      animationEasingUpdate: 'cubicOut',
      grid: { top: 16, right: 16, bottom: 8, left: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        triggerOn: 'mousemove|click',
        confine: true,
        transitionDuration: reducedMotion ? 0 : 0.12,
        /* 轴 tooltip 同时承担事件说明：这天有账就把账列出来 */
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params];
          const first = list[0] as
            | {
                axisValue?: unknown;
                marker?: unknown;
                seriesName?: unknown;
                value?: unknown;
              }
            | undefined;
          const axisValue = typeof first?.axisValue === 'string' ? first.axisValue : '';
          const seriesName =
            typeof first?.seriesName === 'string' ? first.seriesName : '';
          const marker = typeof first?.marker === 'string' ? first.marker : '';
          const valueLine =
            typeof first?.value === 'number'
              ? `${marker}${seriesName}：${formatMajorCurrency(first.value, currency)}/天`
              : null;
          const eventLines = (eventsByDate.get(axisValue) ?? []).map(
            (event) =>
              `${financialTypeLabel(event.type)} ${
                event.direction === 'inflow' ? '−' : '+'
              }${formatMajorCurrency(
                majorFromMinor(event.baseAmountMinor, event.baseCurrency),
                event.baseCurrency,
              )}`,
          );
          return [`<strong>${axisValue}</strong>`, valueLine, ...eventLines]
            .filter(Boolean)
            .join('<br/>');
        },
        axisPointer: {
          type: 'line',
          snap: true,
          lineStyle: { color: palette.muted, type: 'dashed', width: 1 },
        },
        ...chartTooltip(palette),
      },
      xAxis: categoryAxis(
        palette,
        dates.map((date) => date.slice(5)),
      ),
      yAxis: valueAxis(palette, currency),
      series: [
        {
          id: 'asset-daily-cost',
          name: '日均成本',
          type: 'line',
          smooth: false,
          showSymbol: true,
          symbol: 'rect',
          /* 淡墨入笔：越旧的账墨越淡，越近越黑，最后接朱砂顿点 */
          lineStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: withAlpha(palette.primary, '8C') },
                { offset: 0.7, color: palette.primary },
                { offset: 1, color: palette.primary },
              ],
            },
            width: 2,
          },
          itemStyle: {
            color: palette.primary,
            borderColor: palette.surface,
            borderWidth: 2,
          },
          emphasis: { scale: reducedMotion ? false : 1.35 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(palette.primary, '18') },
                { offset: 1, color: withAlpha(palette.primary, '00') },
              ],
            },
          },
          /* 事件刻度与全期日均合脚线共享同一条 markLine，
           * 刻度不写字——写了刻度就成了标语，金额等悬停 */
          markLine: {
            silent: true,
            symbol: 'none',
            animation: false,
            label: { show: false },
            lineStyle: {
              color: withAlpha(palette.muted, '66'),
              type: 'dashed',
              width: 1,
            },
            data: [
              ...visibleEventDates.map((date) => ({ xAxis: date })),
              ...(referenceDailyMajor !== null
                ? [
                    {
                      yAxis: referenceDailyMajor,
                      /* 合脚线比事件刻度略重、比折线的淡墨段轻，
                       * 避免在"淡墨入笔"区间里主次倒挂 */
                      lineStyle: {
                        color: withAlpha(palette.muted, '80'),
                        type: 'dashed' as const,
                        width: 1,
                      },
                      label: {
                        show: true,
                        position: 'insideEndTop' as const,
                        formatter: '全期日均',
                        color: palette.muted,
                        fontSize: 11,
                      },
                    },
                  ]
                : []),
            ],
          },
          data,
        },
      ],
    };
  }, [
    currency,
    dates,
    eventsByDate,
    lastIndex,
    palette,
    reducedMotion,
    referenceDailyMajor,
    values,
    visibleEventDates,
  ]);

  const ref = useChart(option, {
    deferUntilVisible: true,
    onInit: (chart) => {
      chartRef.current = chart;
      chart.on('updateAxisPointer', (event) => {
        const index = dataIndexFromPointerEvent(event, datesRef.current);
        if (index !== null) setActiveIndexRef.current(index);
      });
      chart.on('click', (event) => {
        const index = dataIndexFromPointerEvent(event, datesRef.current);
        if (index !== null) setActiveIndexRef.current(index);
      });
    },
  });
  const showTip = (index: number) => {
    chartRef.current?.dispatchAction({
      type: 'showTip',
      seriesIndex: 0,
      dataIndex: index,
    });
  };
  const describe = (index: number) => {
    const point = trend[index];
    const value = values[index];
    if (!point) return '';
    return value === null
      ? `${formatTrendDate(point.date)}，日均成本口径不适用`
      : `${formatTrendDate(point.date)}，日均成本 ${formatMajorCurrency(value, currency)}/天`;
  };

  if (!activePoint) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">暂无趋势数据</p>
    );
  }

  return (
    <div className="space-y-2">
      <TrendReading
        context={activeIndex === lastIndex ? '当前成本账页' : '准星定位账页'}
        currency={currency}
        current={activeValue}
        date={activePoint.date}
        decreaseIsPositive
        initial={initialValue}
        previous={previousValue}
        suffix="/天"
      />
      <div
        aria-label={`物品日均成本趋势图。按左右方向键逐日查看；触摸或拖动图表可移动准星。当前为 ${describe(activeIndex)}`}
        className="h-[260px] w-full touch-pan-y focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onKeyDown={(event) => cursor.selectFromKeyboard(event, describe, showTip)}
        ref={ref}
        role="group"
        tabIndex={0}
      />
      <p className="text-[11px] text-muted-foreground">
        拖动准星或使用左右方向键逐日查看；朱砂圆点是最新日均，竖向虚线标记资金事件。
      </p>
      <p className="sr-only" aria-live="polite">
        {cursor.announcement}
      </p>
    </div>
  );
}

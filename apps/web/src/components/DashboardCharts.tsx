import { LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { type EChartsCoreOption, init, use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';

import type { Dashboard } from '@thingcost/contracts';

use([
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

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

export function CostTrendChart({ trend }: { trend: Dashboard['trend'] }) {
  const option: EChartsCoreOption = {
    animationDuration: 450,
    grid: { top: 24, right: 18, bottom: 30, left: 52 },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => `¥${Number(value).toFixed(2)}/天`,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((point) => point.date.slice(5)),
      axisLine: { lineStyle: { color: '#7f8a80' } },
      axisLabel: { color: '#7f8a80', fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#7f8a80', fontSize: 10, formatter: '¥{value}' },
      splitLine: { lineStyle: { color: 'rgba(127,138,128,.16)' } },
    },
    series: [
      {
        name: '总体日均成本',
        type: 'line',
        smooth: 0.25,
        showSymbol: false,
        lineStyle: { color: '#85a860', width: 2.5 },
        itemStyle: { color: '#85a860' },
        areaStyle: { color: 'rgba(133,168,96,.16)' },
        data: trend.map((point) => Number(point.dailyCostMinor) / 100),
      },
    ],
  };
  const ref = useChart(option);
  return (
    <div className="chart-canvas" ref={ref} role="img" aria-label="日均成本趋势图" />
  );
}

export function AssetCostTrendChart({
  trend,
}: {
  trend: Array<{
    date: string;
    dailyCostMinor: string | null;
  }>;
}) {
  const showSymbol = trend.length <= 14;
  const option: EChartsCoreOption = {
    animationDuration: 450,
    grid: { top: 24, right: 18, bottom: 30, left: 52 },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) =>
        value === null || value === undefined ? '—' : `¥${Number(value).toFixed(2)}/天`,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((point) => point.date.slice(5)),
      axisLine: { lineStyle: { color: '#7f8a80' } },
      axisLabel: { color: '#7f8a80', fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#7f8a80', fontSize: 10, formatter: '¥{value}' },
      splitLine: { lineStyle: { color: 'rgba(127,138,128,.16)' } },
    },
    series: [
      {
        name: '日均成本',
        type: 'line',
        smooth: 0.25,
        showSymbol,
        symbolSize: 7,
        lineStyle: { color: '#85a860', width: 2.5 },
        itemStyle: { color: '#85a860' },
        areaStyle: { color: 'rgba(133,168,96,.14)' },
        data: trend.map((point) =>
          point.dailyCostMinor === null ? null : Number(point.dailyCostMinor) / 100,
        ),
      },
    ],
  };
  const ref = useChart(option);
  return (
    <div className="chart-canvas" ref={ref} role="img" aria-label="物品日均成本趋势图" />
  );
}

export function CategoryCompositionChart({
  categories,
}: {
  categories: Dashboard['categories'];
}) {
  const option: EChartsCoreOption = {
    animationDuration: 450,
    tooltip: {
      trigger: 'item',
      formatter: (parameters: unknown) => {
        const item = parameters as { name?: string; value?: number; percent?: number };
        return `${item.name ?? ''}<br/>¥${Number(item.value ?? 0).toFixed(2)} · ${String(item.percent ?? 0)}%`;
      },
    },
    legend: {
      bottom: 0,
      icon: 'roundRect',
      itemWidth: 9,
      itemHeight: 9,
      textStyle: { color: '#7f8a80', fontSize: 10 },
    },
    series: [
      {
        type: 'pie',
        radius: ['52%', '72%'],
        center: ['50%', '43%'],
        avoidLabelOverlap: true,
        label: { show: false },
        itemStyle: { borderWidth: 3, borderColor: 'rgba(0,0,0,0)' },
        data: categories.map((category) => ({
          name: category.name,
          value: Number(category.netCostMinor) / 100,
          itemStyle: category.color ? { color: category.color } : undefined,
        })),
      },
    ],
  };
  const ref = useChart(option);
  return (
    <div className="chart-canvas" ref={ref} role="img" aria-label="分类成本构成图" />
  );
}

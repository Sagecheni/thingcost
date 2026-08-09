import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Layers3,
  Plus,
  WalletCards,
} from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';

import { cn } from '@thingcost/ui';

import { api } from '../lib/api.js';
import { formatDailyMinorCurrency, formatMinorCurrency } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { PageHeader } from '../components/ui/page-header.js';
import { SegmentedControl } from '../components/ui/segmented-control.js';

const PortfolioTrendChart = lazy(() =>
  import('../components/DashboardCharts.js').then((module) => ({
    default: module.PortfolioTrendChart,
  })),
);
const AssetMapChart = lazy(() =>
  import('../components/DashboardCharts.js').then((module) => ({
    default: module.AssetMapChart,
  })),
);

type TrendMetric = 'netInvestment' | 'holdingDailyCost' | 'serviceDailyCost';

const trendMetricOptions = [
  { value: 'netInvestment', label: '净投入变化' },
  { value: 'holdingDailyCost', label: '日均持有' },
  { value: 'serviceDailyCost', label: '日均服役' },
] as const satisfies readonly { value: TrendMetric; label: string }[];

const periodOptions = [
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
  { value: 180, label: '180 天' },
] as const;

const trendMetricLabels: Record<TrendMetric, string> = {
  netInvestment: '净投入变化',
  holdingDailyCost: '日均持有',
  serviceDailyCost: '日均服役',
};

function absoluteMinor(value: string): string {
  const amount = BigInt(value);
  return (amount < 0n ? -amount : amount).toString();
}

function categoryShare(value: string, total: bigint): number {
  const amount = BigInt(value);
  if (amount <= 0n || total <= 0n) return 0;
  return Number((amount * 1000n) / total) / 10;
}

/* 章节小标题：图标 + 标题，配一行说明。档案里每一段都先自报家门。 */
function PanelHeading({
  title,
  hint,
  id,
  action,
}: {
  title: string;
  hint?: string;
  id?: string;
  action?: React.ReactNode;
}) {
  return (
    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
      <div className="min-w-0 space-y-0.5">
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        <CardTitle id={id}>{title}</CardTitle>
      </div>
      {action}
    </CardHeader>
  );
}

/* 排名序号：两位数字，等宽对齐，弱化成档案编号 */
function RankIndex({ index }: { index: number }) {
  return (
    <span className="tnum w-6 shrink-0 text-xs text-muted-foreground">
      {String(index + 1).padStart(2, '0')}
    </span>
  );
}

export function DashboardPage() {
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('netInvestment');
  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(periodDays),
    queryFn: () => api.dashboard(periodDays),
  });

  const dashboard = dashboardQuery.data;
  const positiveCategoryTotal = useMemo(
    () =>
      dashboard?.categories.reduce((total, category) => {
        const amount = BigInt(category.netCostMinor);
        return amount > 0n ? total + amount : total;
      }, 0n) ?? 0n,
    [dashboard],
  );

  if (dashboardQuery.isPending) {
    return <p className="py-16 text-center text-sm text-muted-foreground">正在生成资产报表…</p>;
  }

  if (dashboardQuery.isError) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive-subtle px-4 py-3 text-sm text-destructive">
        {dashboardQuery.error.message}
      </p>
    );
  }

  if (!dashboard) {
    return null;
  }

  const currency = dashboard.baseCurrency;
  const netInvestmentIsGain = BigInt(dashboard.currentNetInvestmentMinor) < 0n;
  const holdingDailyIsGain = Number(dashboard.currentHoldingDailyCostMinor) < 0;
  const serviceDailyIsGain = Number(dashboard.currentDailyCostMinor) < 0;
  const periodIsNetInflow = BigInt(dashboard.periodNetSpendingMinor) < 0n;
  const attentionCount =
    dashboard.idleCount +
    dashboard.loanedCount +
    dashboard.repairCount +
    dashboard.retiredCount;
  const statusItems = [
    { label: '服役', value: dashboard.serviceItemCount },
    { label: '闲置', value: dashboard.idleCount },
    { label: '借出', value: dashboard.loanedCount },
    { label: '维修', value: dashboard.repairCount },
    { label: '退役持有', value: dashboard.retiredCount },
  ];
  const gainText = (isGain: boolean) => (isGain ? 'text-success' : 'text-foreground');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        eyebrow="个人资产报表"
        title="资产总览"
        actions={
          <>
            <time
              className="tnum text-xs text-muted-foreground"
              dateTime={dashboard.asOfDate}
            >
              截至 {dashboard.asOfDate}
            </time>
            <Button asChild>
              <Link to="/assets/new">
                <Plus aria-hidden="true" />
                添加物品
              </Link>
            </Button>
          </>
        }
      />

      {/* 主读数 + 三个派生指标 */}
      <Card aria-labelledby="asset-overview-title">
        <CardContent className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-8">
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <WalletCards aria-hidden="true" className="size-4" strokeWidth={1.8} />
              <span id="asset-overview-title">持有资产净投入</span>
            </p>
            <strong
              className={cn(
                'tnum block text-4xl leading-tight font-semibold sm:text-5xl',
                gainText(netInvestmentIsGain),
              )}
            >
              {formatMinorCurrency(dashboard.currentNetInvestmentMinor, currency)}
            </strong>
            <p className="text-sm text-muted-foreground">
              当前持有 {dashboard.heldItemCount} 件 · 其中服役{' '}
              {dashboard.serviceItemCount} 件
            </p>
            {dashboard.unknownCostCount > 0 && (
              /* 未知成本从不并进总额，只在这里显式提示 */
              <Link
                className={cn(
                  'mt-1 inline-flex items-center gap-1 rounded-sm border border-warning/25',
                  'bg-warning-subtle px-2 py-1 text-xs text-warning hover:underline',
                )}
                to="/assets"
                search={{ costKnowledge: 'unknown' }}
              >
                {dashboard.unknownCostCount} 件物品尚未记录成本
              </Link>
            )}
          </div>

          <dl className="grid gap-4 sm:grid-cols-3 lg:border-l lg:border-border lg:pl-8">
            <div className="space-y-1">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                日均持有成本
              </dt>
              <dd
                className={cn('tnum text-lg font-semibold', gainText(holdingDailyIsGain))}
              >
                {formatDailyMinorCurrency(
                  dashboard.currentHoldingDailyCostMinor,
                  currency,
                )}
              </dd>
              <p className="text-xs text-muted-foreground">包含闲置、借出与退役持有</p>
            </div>
            <div className="space-y-1">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CircleDollarSign
                  aria-hidden="true"
                  className="size-3.5"
                  strokeWidth={1.8}
                />
                日均服役成本
              </dt>
              <dd
                className={cn('tnum text-lg font-semibold', gainText(serviceDailyIsGain))}
              >
                {formatDailyMinorCurrency(dashboard.currentDailyCostMinor, currency)}
              </dd>
              <p className="text-xs text-muted-foreground">按实际服役天数摊薄</p>
            </div>
            <div className="space-y-1">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {periodIsNetInflow ? (
                  <ArrowDownRight
                    aria-hidden="true"
                    className="size-3.5"
                    strokeWidth={1.8}
                  />
                ) : (
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-3.5"
                    strokeWidth={1.8}
                  />
                )}
                近 {dashboard.periodDays} 天{periodIsNetInflow ? '净流入' : '净支出'}
              </dt>
              <dd className={cn('tnum text-lg font-semibold', gainText(periodIsNetInflow))}>
                {formatMinorCurrency(
                  absoluteMinor(dashboard.periodNetSpendingMinor),
                  currency,
                )}
              </dd>
              <p className="tnum text-xs text-muted-foreground">
                流出 {formatMinorCurrency(dashboard.periodSpendingMinor, currency)} · 流入{' '}
                {formatMinorCurrency(dashboard.periodInflowMinor, currency)}
              </p>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* 资产版图：树图 + 排行表（排行同时充当图表的表格视图） */}
      <Card aria-labelledby="asset-map-title">
        <PanelHeading
          id="asset-map-title"
          title="资产版图"
          hint="按当前持有物品的净投入"
          action={
            <span className="tnum shrink-0 text-xs text-muted-foreground">
              {dashboard.categories.length} 个分类
            </span>
          }
        />
        <CardContent>
          {dashboard.categories.length === 0 ? (
            <EmptyState icon={Archive} title="添加物品后生成资产版图" />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <figure className="m-0">
                <Suspense
                  fallback={
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      正在绘制资产版图…
                    </p>
                  }
                >
                  <AssetMapChart
                    categories={dashboard.categories}
                    currency={dashboard.baseCurrency}
                  />
                </Suspense>
              </figure>

              <div className="flex flex-col gap-3" aria-label="分类净投入排行">
                {dashboard.categories.map((category, index) => {
                  const share = categoryShare(
                    category.netCostMinor,
                    positiveCategoryTotal,
                  );
                  return (
                    <div className="space-y-1.5" key={category.categoryId}>
                      <div className="flex items-baseline gap-2">
                        <RankIndex index={index} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {category.name}
                        </span>
                        <span className="tnum shrink-0 text-xs text-muted-foreground">
                          {category.itemCount} 件
                        </span>
                        <span className="tnum shrink-0 text-sm font-medium">
                          {formatMinorCurrency(category.netCostMinor, currency)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pl-8">
                        <span
                          className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
                          aria-hidden="true"
                        >
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{
                              width: `${String(share)}%`,
                              ...(category.color
                                ? { backgroundColor: category.color }
                                : {}),
                            }}
                          />
                        </span>
                        <span className="tnum w-24 shrink-0 text-right text-xs text-muted-foreground">
                          {share > 0 ? `${share.toFixed(1)}%` : '净投入不为正'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 趋势 */}
      <Card aria-labelledby="trend-title">
        <PanelHeading
          id="trend-title"
          title="资产趋势"
          hint="持有规模与每日成本的时间变化"
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <SegmentedControl
                label="趋势指标"
                value={trendMetric}
                options={trendMetricOptions}
                onChange={setTrendMetric}
              />
              <SegmentedControl
                label="报表时间范围"
                value={periodDays}
                options={periodOptions}
                onChange={setPeriodDays}
              />
            </div>
          }
        />
        <CardContent>
          <figure className="m-0 space-y-2">
            {/* 单序列折线不需要图例，标题即图注 */}
            <figcaption className="text-xs text-muted-foreground">
              {trendMetricLabels[trendMetric]}
            </figcaption>
            <Suspense
              fallback={
                <p className="py-12 text-center text-sm text-muted-foreground">
                  正在绘制资产趋势…
                </p>
              }
            >
              <PortfolioTrendChart
                currency={dashboard.baseCurrency}
                metric={trendMetric}
                trend={dashboard.trend}
              />
            </Suspense>
          </figure>
        </CardContent>
      </Card>

      {/* 两个排行 */}
      <section className="grid gap-6 lg:grid-cols-2" aria-label="资产效率">
        <Card>
          <PanelHeading
            title="日均持有成本最高"
            hint="优先关注每天仍在摊薄的高成本物品"
          />
          <CardContent className="flex flex-col">
            {dashboard.assetRankings.highestHoldingDailyCost.length === 0 ? (
              <EmptyState title="暂无可计算成本的物品" />
            ) : (
              dashboard.assetRankings.highestHoldingDailyCost.map((asset, index) => (
                <Link
                  key={asset.assetId}
                  className="flex items-center gap-3 border-b border-border py-2.5 last:border-0 hover:bg-accent"
                  to="/assets/$assetId"
                  params={{ assetId: asset.assetId }}
                >
                  <RankIndex index={index} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {asset.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {asset.categoryName} · {asset.statusName}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tnum block text-sm font-medium">
                      {formatDailyMinorCurrency(asset.holdingDailyCostMinor, currency)}
                    </span>
                    <span className="tnum block text-xs text-muted-foreground">
                      {asset.holdingDays} 天
                    </span>
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <PanelHeading title="持有时间最长" hint="已经陪伴最久的当前持有物品" />
          <CardContent className="flex flex-col">
            {dashboard.assetRankings.longestHeld.length === 0 ? (
              <EmptyState title="暂无持有中的物品" />
            ) : (
              dashboard.assetRankings.longestHeld.map((asset, index) => (
                <Link
                  key={asset.assetId}
                  className="flex items-center gap-3 border-b border-border py-2.5 last:border-0 hover:bg-accent"
                  to="/assets/$assetId"
                  params={{ assetId: asset.assetId }}
                >
                  <RankIndex index={index} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {asset.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {asset.categoryName} · {asset.statusName}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tnum block text-sm font-medium">
                      {asset.holdingDays} 天
                    </span>
                    <span className="tnum block text-xs text-muted-foreground">
                      {formatDailyMinorCurrency(asset.holdingDailyCostMinor, currency)}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* 状态 + 提醒 */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <PanelHeading
            title="持有状态"
            hint={attentionCount > 0 ? `${attentionCount} 件需要留意` : '当前状态平稳'}
            action={
              <Layers3
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground"
                strokeWidth={1.7}
              />
            }
          />
          <CardContent>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-5">
              {statusItems.map((item) => (
                <div className="bg-card px-3 py-2.5 text-center" key={item.label}>
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="tnum mt-0.5 text-lg font-semibold">{item.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <PanelHeading
            title="即将到期"
            hint="未来 90 天"
            action={
              <Button asChild variant="link" size="sm" className="h-auto p-0">
                <Link to="/reminders">查看全部</Link>
              </Button>
            }
          />
          <CardContent className="flex flex-col">
            {dashboard.upcomingReminders.length === 0 ? (
              <EmptyState icon={Bell} title="暂无即将到期的提醒" />
            ) : (
              dashboard.upcomingReminders.slice(0, 4).map((reminder) => (
                <Link
                  key={reminder.id}
                  className="flex items-center gap-3 border-b border-border py-2.5 last:border-0 hover:bg-accent"
                  to="/reminders/$reminderId"
                  params={{ reminderId: reminder.reminderId }}
                >
                  <CalendarDays
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.8}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {reminder.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {reminder.assetName ?? '全局提醒'}
                    </span>
                  </span>
                  <time
                    className="tnum shrink-0 text-xs text-muted-foreground"
                    dateTime={reminder.dueAt}
                  >
                    {new Intl.DateTimeFormat('zh-CN', {
                      timeZone: reminder.timeZone,
                      month: 'short',
                      day: 'numeric',
                    }).format(new Date(reminder.dueAt))}
                  </time>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {dashboard.totalItemCount === 0 && (
        <EmptyState
          icon={Archive}
          title="从第一件物品开始建立资产报表"
          description="记录取得成本和状态后，净投入、日均成本与资产版图会自动生成。"
          action={
            <Button asChild>
              <Link to="/assets/new">添加第一件物品</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

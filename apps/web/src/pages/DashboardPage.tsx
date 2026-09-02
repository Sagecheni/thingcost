import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Archive, Plus } from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '@thingcost/ui';

import { api } from '../lib/api.js';
import { formatMinorCurrency } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { FormError } from '../components/ui/form.js';
import { ChartBoard, PanelGhost } from '../components/ui/ledger-skeleton.js';
import { PageHeader } from '../components/ui/page-header.js';
import { SegmentedControl } from '../components/ui/segmented-control.js';
import { SealMark } from '../components/SealMark.js';
import { TypeBlock } from '../components/TypeBlock.js';
import { VaultRack } from '../components/VaultRack.js';

const PortfolioTrendChart = lazy(() =>
  import('../components/DashboardCharts.js').then((module) => ({
    default: module.PortfolioTrendChart,
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
  netInvestment: '净投入变化 · 阶梯的每一级是一次取得',
  holdingDailyCost: '日均持有成本',
  serviceDailyCost: '日均服役成本',
};

function absoluteMinor(value: string): string {
  const amount = BigInt(value);
  return (amount < 0n ? -amount : amount).toString();
}

/* 日均票面：只出数字，单位"/ 天"由调用处单独排小一号。
 * 缺值用破折号而不是"成本未知"—— 这里缺的是分母，不是金额。 */
function dailyFace(amountMinor: string | null, currency: string): string {
  return amountMinor === null ? '—' : formatMinorCurrency(amountMinor, currency, 2);
}

function categoryShare(value: string, total: bigint): number {
  const amount = BigInt(value);
  if (amount <= 0n || total <= 0n) return 0;
  return Number((amount * 1000n) / total) / 10;
}

/* 面板头：眉批 + 标题，右上角放操作 */
function PanelHeading({
  title,
  hint,
  id,
  action,
}: {
  title: string;
  hint?: string;
  id?: string;
  action?: ReactNode;
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

/* 副读数：票面小一号，口径写在下面。 */
function ReadingSheet({
  label,
  value,
  unit,
  note,
  isGain,
}: {
  label: string;
  value: string;
  unit?: string;
  note: ReactNode;
  isGain: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1.5 p-5">
        <dt data-slot="ledger-label">{label}</dt>
        <dd className="flex items-baseline gap-1">
          <span
            data-slot="amount"
            className={cn(
              'text-[26px] leading-none font-medium',
              isGain ? 'text-success' : 'text-heading',
            )}
          >
            {value}
          </span>
          {unit ? (
            <span className="text-[11px] text-muted-foreground">{unit}</span>
          ) : null}
        </dd>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

/* 排名序号：两位数字，等宽对齐 */
function RankIndex({ index }: { index: number }) {
  return (
    <span data-slot="amount" className="w-6 shrink-0 text-xs text-muted-foreground">
      {String(index + 1).padStart(2, '0')}
    </span>
  );
}

const rankRow = cn(
  'flex items-center gap-3 border-b border-dashed border-border py-2.5 last:border-0',
  'transition-colors hover:bg-accent',
);

export function DashboardPage() {
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('netInvestment');
  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(periodDays),
    queryFn: () => api.dashboard(periodDays),
    /* 周期切换时保留上一张账页，待新范围返回后让同一图表实例连续过渡。 */
    placeholderData: keepPreviousData,
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

  /* 大数字落印：只有金额真正变化时才重新盖章 —— 淡入回满墨，不做滚动行情。 */
  const [netInvestmentPrintKey, setNetInvestmentPrintKey] = useState(0);
  const prevNetInvestmentMinor = useRef<string | null>(null);
  useEffect(() => {
    const value = dashboard?.currentNetInvestmentMinor;
    if (value === undefined) return;
    if (
      prevNetInvestmentMinor.current !== null &&
      prevNetInvestmentMinor.current !== value
    ) {
      setNetInvestmentPrintKey((key) => key + 1);
    }
    prevNetInvestmentMinor.current = value;
  }, [dashboard?.currentNetInvestmentMinor]);

  if (dashboardQuery.isPending) {
    return (
      <div aria-busy="true" className="mx-auto flex max-w-6xl flex-col gap-5">
        {/* 总账页的骨架：一张总存根 + 三张副读数 + 两块图表格 */}
        <PanelGhost lines={3} />
        <div className="grid gap-5 sm:grid-cols-3">
          <PanelGhost lines={2} />
          <PanelGhost lines={2} />
          <PanelGhost lines={2} />
        </div>
        <PanelGhost chart />
        <PanelGhost lines={4} />
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-stretch gap-3 pt-8">
        <FormError>{dashboardQuery.error.message}</FormError>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void dashboardQuery.refetch()}
        >
          重新读取
        </Button>
      </div>
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader
        eyebrow="个人资产总账"
        title="资产总览"
        actions={
          <Button asChild>
            <Link to="/assets/new">
              <Plus aria-hidden="true" />
              添加物品
            </Link>
          </Button>
        }
      />

      {/* 主读数：整页唯一的大票面 —— 一张总存根。
       * 头联写眉批和盖章日期，票面是大数字和口径，骑缝之下是存根脚：
       * 持有与服役只报数量，不把未知成本混进任何合计。 */}
      <Card aria-labelledby="asset-overview-title">
        <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border px-5 pt-4 pb-2.5 sm:px-6">
          <p data-slot="ledger-label" id="asset-overview-title">
            持有资产净投入
          </p>
          <time data-slot="ledger-label" dateTime={dashboard.asOfDate}>
            截至 {dashboard.asOfDate}
          </time>
        </div>
        <CardContent className="space-y-2 p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <strong
              key={netInvestmentPrintKey}
              data-slot="amount"
              className={cn(
                'block text-[44px] leading-none font-medium sm:text-[56px]',
                netInvestmentPrintKey > 0 && 'ledger-print',
                netInvestmentIsGain ? 'text-success' : 'text-heading',
              )}
            >
              {formatMinorCurrency(dashboard.currentNetInvestmentMinor, currency)}
            </strong>
            {/* 总存根也凭印 —— 数额更新时，印章和大数字一起回落 */}
            <SealMark
              key={netInvestmentPrintKey}
              stamped={netInvestmentPrintKey > 0}
              className="mb-1 shrink-0"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            按实际现金流计：取得、维修等加计，卖出回款与退款冲减。
          </p>
          {dashboard.unknownCostCount > 0 && (
            /* 藤黄待办 —— 欠了一步的账划在左边，不判错。
             * 未知成本从不并进上面那个总额。 */
            <Link
              className="mt-1 inline-block text-[13px] font-semibold hover:underline"
              data-slot="pending"
              to="/assets"
              search={{ costKnowledge: 'unknown' }}
            >
              {dashboard.unknownCostCount} 件物品尚未记录成本，未计入总额
            </Link>
          )}
        </CardContent>
        <div data-slot="perforation" aria-hidden="true" className="mt-2" />
        <dl className="flex justify-between gap-3 px-5 pt-3 pb-4 sm:px-6">
          <div className="flex gap-1.5">
            <dt className="text-xs text-muted-foreground">当前持有</dt>
            <dd data-slot="amount" className="text-sm text-heading">
              {dashboard.heldItemCount} 件
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-xs text-muted-foreground">其中服役</dt>
            <dd data-slot="amount" className="text-sm text-heading">
              {dashboard.serviceItemCount} 件
            </dd>
          </div>
        </dl>
      </Card>

      {/* 三个成本口径，各自一张 */}
      <dl className="grid gap-5 sm:grid-cols-3">
        <ReadingSheet
          label="日均持有成本"
          value={formatMinorCurrency(dashboard.currentHoldingDailyCostMinor, currency, 2)}
          unit="/ 天"
          note="包含闲置、借出与退役持有"
          isGain={holdingDailyIsGain}
        />
        <ReadingSheet
          label="日均服役成本"
          value={formatMinorCurrency(dashboard.currentDailyCostMinor, currency, 2)}
          unit="/ 天"
          note="按实际服役天数摊薄"
          isGain={serviceDailyIsGain}
        />
        <ReadingSheet
          label={`近 ${String(dashboard.periodDays)} 天${periodIsNetInflow ? '净流入' : '净支出'}`}
          value={formatMinorCurrency(
            absoluteMinor(dashboard.periodNetSpendingMinor),
            currency,
          )}
          note={
            <>
              流出 {formatMinorCurrency(dashboard.periodSpendingMinor, currency)} · 流入{' '}
              {formatMinorCurrency(dashboard.periodInflowMinor, currency)}
            </>
          }
          isGain={periodIsNetInflow}
        />
      </dl>

      {/* 资产趋势 */}
      <Card aria-busy={dashboardQuery.isFetching} aria-labelledby="trend-title">
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
            <figcaption className="flex min-h-4 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{trendMetricLabels[trendMetric]}</span>
              <span
                className="inline-flex min-w-14 items-center justify-end gap-1.5"
                role="status"
              >
                {dashboardQuery.isFetching ? (
                  <>
                    {/* 正在重新落墨：一小段呼吸的账页行线，
                     * 与骨架屏和图表格同一语言 */}
                    <span
                      aria-hidden="true"
                      className="h-3 w-4 bg-[repeating-linear-gradient(0deg,transparent_0_3px,var(--primary)_3px_4px)] motion-safe:animate-pulse"
                    />
                    更新中
                  </>
                ) : null}
              </span>
            </figcaption>
            <Suspense fallback={<ChartBoard />}>
              <PortfolioTrendChart
                currency={dashboard.baseCurrency}
                metric={trendMetric}
                trend={dashboard.trend}
              />
            </Suspense>
          </figure>
        </CardContent>
      </Card>

      {/* 资产版图：树图 + 排行表（排行同时充当图表的表格视图） */}
      <Card aria-labelledby="asset-map-title">
        <PanelHeading
          id="asset-map-title"
          title="资产版图"
          hint="按当前持有物品的净投入"
          action={
            <span data-slot="amount" className="shrink-0 text-xs text-muted-foreground">
              {dashboard.categories.length} 个分类
            </span>
          }
        />
        <CardContent className="flex flex-col gap-6">
          {dashboard.categories.length === 0 ? (
            <EmptyState icon={Archive} title="添加物品后生成资产版图" />
          ) : (
            <>
              {/* 库房货架满宽顶格，底册排行在下方承接读数 */}
              <VaultRack
                categories={dashboard.categories}
                currency={dashboard.baseCurrency}
              />

              <div
                className="grid gap-4 gap-x-8 sm:grid-cols-2"
                aria-label="分类净投入排行"
              >
                {dashboard.categories.map((category, index) => {
                  const share = categoryShare(
                    category.netCostMinor,
                    positiveCategoryTotal,
                  );
                  return (
                    <div className="space-y-1.5" key={category.categoryId}>
                      <div className="flex items-baseline gap-2">
                        <RankIndex index={index} />
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
                          <TypeBlock name={category.name} />
                          <span className="truncate">{category.name}</span>
                        </span>
                        <span
                          data-slot="amount"
                          className="shrink-0 text-xs text-muted-foreground"
                        >
                          {category.itemCount} 件
                        </span>
                        <span data-slot="amount" className="shrink-0 text-sm">
                          {formatMinorCurrency(category.netCostMinor, currency)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pl-8">
                        {/* 占比条用同一支墨的透明度，不引入新颜色 */}
                        <span
                          className="h-1.5 flex-1 overflow-hidden bg-muted"
                          aria-hidden="true"
                        >
                          <span
                            className="block h-full bg-foreground/60"
                            style={{
                              width: `${String(share)}%`,
                              ...(category.color
                                ? { backgroundColor: category.color }
                                : {}),
                            }}
                          />
                        </span>
                        <span
                          data-slot="amount"
                          className="w-24 shrink-0 text-right text-xs text-muted-foreground"
                        >
                          {share > 0 ? `${share.toFixed(1)}%` : '净投入不为正'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 两个排行 */}
      <section className="grid gap-5 lg:grid-cols-2" aria-label="资产效率">
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
                  className={rankRow}
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
                    <span data-slot="amount" className="block text-sm">
                      {dailyFace(asset.holdingDailyCostMinor, currency)}
                      <span className="text-[11px] text-muted-foreground"> / 天</span>
                    </span>
                    <span
                      data-slot="amount"
                      className="block text-xs text-muted-foreground"
                    >
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
                  className={rankRow}
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
                    <span data-slot="amount" className="block text-sm">
                      {asset.holdingDays} 天
                    </span>
                    <span
                      data-slot="amount"
                      className="block text-xs text-muted-foreground"
                    >
                      {dailyFace(asset.holdingDailyCostMinor, currency)} / 天
                    </span>
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {dashboard.totalItemCount === 0 && (
        <EmptyState
          icon={Archive}
          title="从第一件物品开始建立总账"
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

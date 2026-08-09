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

import { api } from '../lib/api.js';
import { formatDailyMinorCurrency, formatMinorCurrency } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

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

export function DashboardPage() {
  const [periodDays, setPeriodDays] = useState(30);
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
    return <div className="report-dashboard-loading">正在生成资产报表…</div>;
  }

  if (dashboardQuery.isError) {
    return <div className="form-error">{dashboardQuery.error.message}</div>;
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
    { label: '服役', value: dashboard.serviceItemCount, tone: 'service' },
    { label: '闲置', value: dashboard.idleCount, tone: 'idle' },
    { label: '借出', value: dashboard.loanedCount, tone: 'loaned' },
    { label: '维修', value: dashboard.repairCount, tone: 'repair' },
    { label: '退役持有', value: dashboard.retiredCount, tone: 'retired' },
  ] as const;

  return (
    <div className="asset-report-dashboard">
      <header className="report-page-header">
        <div>
          <span className="report-page-kicker">个人资产报表</span>
          <h1>资产总览</h1>
        </div>
        <div className="report-page-actions">
          <time dateTime={dashboard.asOfDate}>截至 {dashboard.asOfDate}</time>
          <Link className="report-primary-action" to="/assets/new">
            <Plus aria-hidden="true" size={18} strokeWidth={2} />
            添加物品
          </Link>
        </div>
      </header>

      <section className="report-overview-card" aria-labelledby="asset-overview-title">
        <div className="report-overview-lead">
          <div className="report-section-label">
            <WalletCards aria-hidden="true" size={18} strokeWidth={1.8} />
            <h2 id="asset-overview-title">持有资产净投入</h2>
          </div>
          <strong className={netInvestmentIsGain ? 'is-gain' : undefined}>
            {formatMinorCurrency(dashboard.currentNetInvestmentMinor, currency)}
          </strong>
          <p>
            当前持有 {dashboard.heldItemCount} 件 · 其中服役 {dashboard.serviceItemCount}{' '}
            件
          </p>
          {dashboard.unknownCostCount > 0 && (
            <Link
              className="report-data-warning"
              to="/assets"
              search={{ costKnowledge: 'unknown' }}
            >
              {dashboard.unknownCostCount} 件物品尚未记录成本
            </Link>
          )}
        </div>

        <dl className="report-overview-metrics">
          <div>
            <dt>
              <Clock3 aria-hidden="true" size={17} strokeWidth={1.8} />
              日均持有成本
            </dt>
            <dd className={holdingDailyIsGain ? 'is-gain' : undefined}>
              {formatDailyMinorCurrency(dashboard.currentHoldingDailyCostMinor, currency)}
            </dd>
            <small>包含闲置、借出与退役持有</small>
          </div>
          <div>
            <dt>
              <CircleDollarSign aria-hidden="true" size={17} strokeWidth={1.8} />
              日均服役成本
            </dt>
            <dd className={serviceDailyIsGain ? 'is-gain' : undefined}>
              {formatDailyMinorCurrency(dashboard.currentDailyCostMinor, currency)}
            </dd>
            <small>按实际服役天数摊薄</small>
          </div>
          <div>
            <dt>
              {periodIsNetInflow ? (
                <ArrowDownRight aria-hidden="true" size={17} strokeWidth={1.8} />
              ) : (
                <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.8} />
              )}
              近 {dashboard.periodDays} 天{periodIsNetInflow ? '净流入' : '净支出'}
            </dt>
            <dd className={periodIsNetInflow ? 'is-gain' : undefined}>
              {formatMinorCurrency(
                absoluteMinor(dashboard.periodNetSpendingMinor),
                currency,
              )}
            </dd>
            <small>
              流出 {formatMinorCurrency(dashboard.periodSpendingMinor, currency)} · 流入{' '}
              {formatMinorCurrency(dashboard.periodInflowMinor, currency)}
            </small>
          </div>
        </dl>
      </section>

      <section
        className="report-panel report-map-panel"
        aria-labelledby="asset-map-title"
      >
        <header className="report-panel-header">
          <div>
            <span>按当前持有物品的净投入</span>
            <h2 id="asset-map-title">资产版图</h2>
          </div>
          <strong>{dashboard.categories.length} 个分类</strong>
        </header>

        {dashboard.categories.length === 0 ? (
          <div className="report-empty-state">
            <Archive aria-hidden="true" size={24} strokeWidth={1.7} />
            <span>添加物品后生成资产版图</span>
          </div>
        ) : (
          <div className="report-map-layout">
            <figure className="report-map-figure">
              <Suspense
                fallback={<div className="report-chart-loading">正在绘制资产版图…</div>}
              >
                <AssetMapChart
                  categories={dashboard.categories}
                  currency={dashboard.baseCurrency}
                />
              </Suspense>
            </figure>

            <div className="report-category-ranking" aria-label="分类净投入排行">
              {dashboard.categories.map((category, index) => {
                const share = categoryShare(category.netCostMinor, positiveCategoryTotal);
                return (
                  <div className="report-category-row" key={category.categoryId}>
                    <div className="report-category-copy">
                      <span className="report-rank-index">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <strong>{category.name}</strong>
                        <span>{category.itemCount} 件</span>
                      </div>
                      <div className="report-category-value">
                        <strong>
                          {formatMinorCurrency(category.netCostMinor, currency)}
                        </strong>
                        <span>{share > 0 ? `${share.toFixed(1)}%` : '净投入不为正'}</span>
                      </div>
                    </div>
                    <span className="report-category-track" aria-hidden="true">
                      <span
                        style={{
                          width: `${String(share)}%`,
                          ...(category.color ? { backgroundColor: category.color } : {}),
                        }}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="report-panel report-trend-panel" aria-labelledby="trend-title">
        <header className="report-panel-header report-trend-header">
          <div>
            <span>持有规模与每日成本的时间变化</span>
            <h2 id="trend-title">资产趋势</h2>
          </div>
          <div className="report-chart-controls">
            <div className="report-segmented-control" aria-label="趋势指标">
              {(Object.keys(trendMetricLabels) as TrendMetric[]).map((metric) => (
                <button
                  className={trendMetric === metric ? 'active' : undefined}
                  key={metric}
                  type="button"
                  aria-pressed={trendMetric === metric}
                  onClick={() => setTrendMetric(metric)}
                >
                  {trendMetricLabels[metric]}
                </button>
              ))}
            </div>
            <div className="report-period-control" aria-label="报表时间范围">
              {[30, 90, 180].map((days) => (
                <button
                  className={periodDays === days ? 'active' : undefined}
                  key={days}
                  type="button"
                  aria-pressed={periodDays === days}
                  onClick={() => setPeriodDays(days)}
                >
                  {days} 天
                </button>
              ))}
            </div>
          </div>
        </header>
        <figure className="report-trend-figure">
          <figcaption>{trendMetricLabels[trendMetric]}</figcaption>
          <Suspense
            fallback={<div className="report-chart-loading">正在绘制资产趋势…</div>}
          >
            <PortfolioTrendChart
              currency={dashboard.baseCurrency}
              metric={trendMetric}
              trend={dashboard.trend}
            />
          </Suspense>
        </figure>
      </section>

      <section className="report-insight-grid" aria-label="资产效率">
        <article className="report-panel report-ranking-panel">
          <header className="report-panel-header">
            <div>
              <span>优先关注每天仍在摊薄的高成本物品</span>
              <h2>日均持有成本最高</h2>
            </div>
          </header>
          <div className="report-asset-ranking">
            {dashboard.assetRankings.highestHoldingDailyCost.length === 0 ? (
              <div className="report-empty-state">暂无可计算成本的物品</div>
            ) : (
              dashboard.assetRankings.highestHoldingDailyCost.map((asset, index) => (
                <Link
                  key={asset.assetId}
                  to="/assets/$assetId"
                  params={{ assetId: asset.assetId }}
                >
                  <span className="report-rank-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="report-ranked-asset-copy">
                    <strong>{asset.name}</strong>
                    <small>
                      {asset.categoryName} · {asset.statusName}
                    </small>
                  </span>
                  <span className="report-ranked-asset-value">
                    <strong>
                      {formatDailyMinorCurrency(asset.holdingDailyCostMinor, currency)}
                    </strong>
                    <small>{asset.holdingDays} 天</small>
                  </span>
                </Link>
              ))
            )}
          </div>
        </article>

        <article className="report-panel report-ranking-panel">
          <header className="report-panel-header">
            <div>
              <span>已经陪伴最久的当前持有物品</span>
              <h2>持有时间最长</h2>
            </div>
          </header>
          <div className="report-asset-ranking">
            {dashboard.assetRankings.longestHeld.length === 0 ? (
              <div className="report-empty-state">暂无持有中的物品</div>
            ) : (
              dashboard.assetRankings.longestHeld.map((asset, index) => (
                <Link
                  key={asset.assetId}
                  to="/assets/$assetId"
                  params={{ assetId: asset.assetId }}
                >
                  <span className="report-rank-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="report-ranked-asset-copy">
                    <strong>{asset.name}</strong>
                    <small>
                      {asset.categoryName} · {asset.statusName}
                    </small>
                  </span>
                  <span className="report-ranked-asset-value">
                    <strong>{asset.holdingDays} 天</strong>
                    <small>
                      {formatDailyMinorCurrency(asset.holdingDailyCostMinor, currency)}
                    </small>
                  </span>
                </Link>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="report-utility-grid">
        <article className="report-panel report-status-panel">
          <header className="report-panel-header">
            <div>
              <span>
                {attentionCount > 0 ? `${attentionCount} 件需要留意` : '当前状态平稳'}
              </span>
              <h2>持有状态</h2>
            </div>
            <Layers3 aria-hidden="true" size={20} strokeWidth={1.7} />
          </header>
          <dl className="report-status-list">
            {statusItems.map((item) => (
              <div key={item.label} data-tone={item.tone}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="report-panel report-reminder-panel">
          <header className="report-panel-header">
            <div>
              <span>未来 90 天</span>
              <h2>即将到期</h2>
            </div>
            <Link className="report-text-link" to="/reminders">
              查看全部
            </Link>
          </header>
          {dashboard.upcomingReminders.length === 0 ? (
            <div className="report-empty-state">
              <Bell aria-hidden="true" size={21} strokeWidth={1.7} />
              <span>暂无即将到期的提醒</span>
            </div>
          ) : (
            <div className="report-reminder-list">
              {dashboard.upcomingReminders.slice(0, 4).map((reminder) => (
                <Link
                  key={reminder.id}
                  to="/reminders/$reminderId"
                  params={{ reminderId: reminder.reminderId }}
                >
                  <span className="report-reminder-icon" aria-hidden="true">
                    <CalendarDays size={17} strokeWidth={1.8} />
                  </span>
                  <span>
                    <strong>{reminder.title}</strong>
                    <small>{reminder.assetName ?? '全局提醒'}</small>
                  </span>
                  <time dateTime={reminder.dueAt}>
                    {new Intl.DateTimeFormat('zh-CN', {
                      timeZone: reminder.timeZone,
                      month: 'short',
                      day: 'numeric',
                    }).format(new Date(reminder.dueAt))}
                  </time>
                </Link>
              ))}
            </div>
          )}
        </article>
      </section>

      {dashboard.totalItemCount === 0 && (
        <section className="report-empty-collection">
          <Archive aria-hidden="true" size={28} strokeWidth={1.6} />
          <div>
            <h2>从第一件物品开始建立资产报表</h2>
            <p>记录取得成本和状态后，净投入、日均成本与资产版图会自动生成。</p>
          </div>
          <Link className="report-primary-action" to="/assets/new">
            添加第一件物品
          </Link>
        </section>
      )}
    </div>
  );
}

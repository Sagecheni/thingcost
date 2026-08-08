import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  BellRing,
  Clock3,
  PackageOpen,
  Plus,
  RotateCcw,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import { api } from '../lib/api.js';
import { formatDailyMinorCurrency, formatMinorCurrency } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

const CostTrendChart = lazy(() =>
  import('../components/DashboardCharts.js').then((module) => ({
    default: module.CostTrendChart,
  })),
);
const CategoryCompositionChart = lazy(() =>
  import('../components/DashboardCharts.js').then((module) => ({
    default: module.CategoryCompositionChart,
  })),
);

export function DashboardPage() {
  const [periodDays, setPeriodDays] = useState(30);
  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(periodDays),
    queryFn: () => api.dashboard(periodDays),
  });

  if (dashboardQuery.isPending) {
    return <div className="page-loading">正在重建你的器物成本曲线…</div>;
  }

  if (dashboardQuery.isError) {
    return <div className="form-error">{dashboardQuery.error.message}</div>;
  }

  const dashboard = dashboardQuery.data;
  const isNetGain = Number(dashboard.currentDailyCostMinor) < 0;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">截至 {dashboard.asOfDate}</p>
          <h1>每一件拥有，都在时间里留下刻度。</h1>
        </div>
        <Link className="primary-action" to="/assets/new">
          <Plus size={18} aria-hidden="true" />
          添加物品
        </Link>
      </header>

      <section className="hero-card" aria-labelledby="daily-cost-title">
        <div className="pixel-corner pixel-corner-top" aria-hidden="true" />
        <div className="pixel-corner pixel-corner-bottom" aria-hidden="true" />
        <div>
          <p className="metric-label" id="daily-cost-title">
            {isNetGain ? '当前总体日均净收益' : '当前总体日均成本'}
          </p>
          <p className="hero-value hero-value-live">
            {formatDailyMinorCurrency(dashboard.currentDailyCostMinor).replace('/天', '')}
            <small>/ 天</small>
          </p>
          <p className="hero-hint">
            由 {dashboard.serviceItemCount}{' '}
            件当前服役物品相加得出；退役与已处置物品不进入此指标。
          </p>
        </div>
        <div className="service-status">
          <span className="status-dot status-dot-online" />
          数据完整度 {dashboard.dataCompletenessPercent}%
        </div>
      </section>

      <section className="metric-grid dashboard-metric-grid" aria-label="资产摘要">
        <article className="metric-card">
          <span className="metric-icon metric-icon-moss">
            <PackageOpen size={20} aria-hidden="true" />
          </span>
          <p>当前持有</p>
          <strong>{dashboard.heldItemCount} 件</strong>
          <small>全部档案 {dashboard.totalItemCount} 件</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-amber">
            <WalletCards size={20} aria-hidden="true" />
          </span>
          <p>当前净投入</p>
          <strong>{formatMinorCurrency(dashboard.currentNetInvestmentMinor)}</strong>
          <small>
            {dashboard.unknownCostCount > 0
              ? `${dashboard.unknownCostCount} 件成本未知`
              : '数据口径完整'}
          </small>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-blue">
            <Clock3 size={20} aria-hidden="true" />
          </span>
          <p>近 {dashboard.periodDays} 天支出</p>
          <strong>{formatMinorCurrency(dashboard.periodSpendingMinor)}</strong>
          <small>按实际出账事件统计</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-rose">
            <RotateCcw size={20} aria-hidden="true" />
          </span>
          <p>需要留意</p>
          <strong>
            {dashboard.idleCount +
              dashboard.loanedCount +
              dashboard.repairCount +
              dashboard.retiredCount}{' '}
            件
          </strong>
          <small>
            闲置 {dashboard.idleCount} · 借出 {dashboard.loanedCount} · 维修{' '}
            {dashboard.repairCount} · 退役 {dashboard.retiredCount}
          </small>
        </article>
      </section>

      <section className="valuation-overview-card">
        <div className="valuation-overview-heading">
          <span className="metric-icon metric-icon-amber">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">ADOPTED VALUATION</p>
            <h2>当前采用估值</h2>
          </div>
        </div>
        {dashboard.adoptedValuationMinor === null ? (
          <div className="valuation-overview-empty">
            <p>尚未采用任何 AI 估值快照。</p>
            <small>估值只作为市场参考，不会改写真实现金账本。</small>
          </div>
        ) : (
          <div className="valuation-overview-metrics">
            <div>
              <span>组合参考价值</span>
              <strong>{formatMinorCurrency(dashboard.adoptedValuationMinor)}</strong>
            </div>
            <div>
              <span>对应物品净投入</span>
              <strong>{formatMinorCurrency(dashboard.valuedNetInvestmentMinor)}</strong>
            </div>
            <div>
              <span>参考差额</span>
              <strong>{formatMinorCurrency(dashboard.valuationDeltaMinor)}</strong>
            </div>
            <div>
              <span>估值覆盖</span>
              <strong>{dashboard.valuationCoveragePercent}%</strong>
              <small>
                {dashboard.valuedItemCount} / {dashboard.heldItemCount} 件持有物品
              </small>
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-chart-grid">
        <article className="chart-card chart-card-wide">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Cost curve</p>
              <h2>日均成本趋势</h2>
            </div>
            <div className="period-switch" aria-label="趋势时间范围">
              {[30, 90, 180].map((days) => (
                <button
                  className={periodDays === days ? 'active' : ''}
                  key={days}
                  type="button"
                  onClick={() => setPeriodDays(days)}
                >
                  {days} 天
                </button>
              ))}
            </div>
          </div>
          <Suspense
            fallback={<div className="chart-shell page-loading">正在绘制趋势…</div>}
          >
            <CostTrendChart trend={dashboard.trend} />
          </Suspense>
        </article>

        <article className="chart-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Composition</p>
              <h2>分类净成本</h2>
            </div>
          </div>
          {dashboard.categories.length > 0 ? (
            <Suspense
              fallback={<div className="chart-shell page-loading">正在绘制构成…</div>}
            >
              <CategoryCompositionChart categories={dashboard.categories} />
            </Suspense>
          ) : (
            <div className="chart-empty">添加物品后生成分类构成</div>
          )}
        </article>
      </section>

      <section className="dashboard-lower-grid">
        <article className="chart-card status-insight-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Collection pulse</p>
              <h2>持有状态</h2>
            </div>
          </div>
          <div className="status-insight-grid">
            <div>
              <strong>{dashboard.serviceItemCount}</strong>
              <span>服役组合</span>
            </div>
            <div>
              <strong>{dashboard.idleCount}</strong>
              <span>闲置</span>
            </div>
            <div>
              <strong>{dashboard.loanedCount}</strong>
              <span>借出</span>
            </div>
            <div>
              <strong>{dashboard.repairCount}</strong>
              <span>维修</span>
            </div>
          </div>
        </article>

        <article className="chart-card activity-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h2>最近活动</h2>
            </div>
            <Link className="text-link" to="/assets">
              查看全部物品
            </Link>
          </div>
          {dashboard.recentActivity.length === 0 ? (
            <div className="activity-empty">
              <Sparkles size={18} /> 第一条记录会出现在这里
            </div>
          ) : (
            <div className="activity-list">
              {dashboard.recentActivity.slice(0, 7).map((activity) => (
                <Link
                  key={activity.id}
                  to="/assets/$assetId"
                  params={{ assetId: activity.assetId }}
                >
                  <span className="activity-dot" />
                  <div>
                    <strong>{activity.assetName}</strong>
                    <p>{activity.title}</p>
                  </div>
                  <time>{activity.occurredOn}</time>
                </Link>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="chart-card dashboard-reminder-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Next signals</p>
            <h2>即将到期</h2>
          </div>
          <Link className="text-link" to="/reminders">
            打开提醒中心
          </Link>
        </div>
        {dashboard.upcomingReminders.length === 0 ? (
          <div className="activity-empty">
            <BellRing size={18} /> 未来 90 天暂无提醒
          </div>
        ) : (
          <div className="dashboard-reminder-list">
            {dashboard.upcomingReminders.map((reminder) => (
              <Link
                key={reminder.id}
                to="/reminders/$reminderId"
                params={{ reminderId: reminder.reminderId }}
              >
                <span className="activity-dot" />
                <div>
                  <strong>{reminder.title}</strong>
                  <p>{reminder.assetName ?? '全局提醒'}</p>
                </div>
                <time>
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
      </section>

      {dashboard.totalItemCount === 0 && (
        <section className="empty-state dashboard-empty-state">
          <span className="empty-pixel" aria-hidden="true">
            +
          </span>
          <h3>还没有物品记录</h3>
          <p>从一件每天都会使用的物品开始，不必一次填完所有资料。</p>
          <Link className="primary-action" to="/assets/new">
            添加第一件物品
          </Link>
        </section>
      )}
    </>
  );
}

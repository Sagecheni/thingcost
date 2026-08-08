import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CreditCard, Plus } from 'lucide-react';

import { api } from '../lib/api.js';
import { formatMinorCurrency } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

const statusLabel: Record<string, string> = {
  trial: '试用中',
  active: '进行中',
  paused: '已暂停',
  cancelled: '已取消',
  expired: '已到期',
};

export function SubscriptionListPage() {
  const listQuery = useQuery({
    queryKey: queryKeys.subscriptions,
    queryFn: api.subscriptions,
  });

  if (listQuery.isPending) {
    return <section className="content-card">正在加载订阅…</section>;
  }
  if (listQuery.isError) {
    return (
      <section className="content-card form-error">{listQuery.error.message}</section>
    );
  }

  const data = listQuery.data;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Subscriptions</p>
          <h1>订阅与数字许可</h1>
          <p className="muted-copy">独立于实物资产；不保存密码或 License Key。</p>
        </div>
        <Link className="primary-action" to="/subscriptions/new">
          <Plus size={16} />
          新建
        </Link>
      </header>

      <section className="dashboard-metrics">
        <article className="metric-card">
          <p>进行中</p>
          <strong>{data.totals.activeCount}</strong>
        </article>
        <article className="metric-card">
          <p>预计月支出</p>
          <strong>{formatMinorCurrency(data.totals.projectedMonthlyMinor)}</strong>
        </article>
        <article className="metric-card">
          <p>预计年支出</p>
          <strong>{formatMinorCurrency(data.totals.projectedYearlyMinor)}</strong>
        </article>
        <article className="metric-card">
          <p>实际已支出</p>
          <strong>{formatMinorCurrency(data.totals.actualSpendMinor)}</strong>
        </article>
      </section>

      {data.items.length === 0 ? (
        <section className="empty-state">
          <CreditCard size={28} aria-hidden="true" />
          <h2>还没有订阅</h2>
          <p>把云服务、域名、买断软件单独记在这里，不与实物物品混在一起。</p>
        </section>
      ) : (
        <section className="card-grid">
          {data.items.map((item) => (
            <Link
              key={item.id}
              className="content-card list-card"
              to="/subscriptions/$subscriptionId"
              params={{ subscriptionId: item.id }}
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">
                    {item.kind === 'digital_license' ? '数字许可' : '周期订阅'}
                  </p>
                  <h2>{item.name}</h2>
                </div>
                <span className="status-badge">
                  {statusLabel[item.status] ?? item.status}
                </span>
              </div>
              <p className="muted-copy">
                {item.vendor || '未填厂商'} ·{' '}
                {formatMinorCurrency(item.amountMinor, item.currency)} /{' '}
                {item.billingCycle}
              </p>
              <p className="muted-copy">
                预计月{' '}
                {formatMinorCurrency(item.metrics.projectedMonthlyMinor, item.currency)}
                {' · '}
                实际 {formatMinorCurrency(item.metrics.actualSpendMinor, item.currency)}
              </p>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

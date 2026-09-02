import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CreditCard, Plus } from 'lucide-react';

import type { SubscriptionList } from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { api } from '../lib/api.js';
import { useBaseCurrency } from '../lib/application-settings.js';
import { formatMinorCurrency } from '../lib/format.js';
import { useFreshMark } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { FormError } from '../components/ui/form.js';
import { StubGhostGrid } from '../components/ui/ledger-skeleton.js';
import { PageHeader } from '../components/ui/page-header.js';

const statusLabel: Record<string, string> = {
  trial: '试用中',
  active: '进行中',
  paused: '已暂停',
  cancelled: '已取消',
  expired: '已到期',
};

/* 已取消/到期的订阅不该和进行中的长得一样 */
const statusTone: Record<string, 'success' | 'warning' | 'outline'> = {
  trial: 'warning',
  active: 'success',
  paused: 'warning',
  cancelled: 'outline',
  expired: 'outline',
};

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div data-slot="card" className="space-y-1 p-4">
      <dt data-slot="ledger-label">{label}</dt>
      <dd data-slot="amount" className="text-xl leading-none font-medium text-heading">
        {value}
      </dd>
    </div>
  );
}

export function SubscriptionListPage() {
  const baseCurrency = useBaseCurrency();
  const listQuery = useQuery({
    queryKey: queryKeys.subscriptions,
    queryFn: api.subscriptions,
  });

  if (listQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <StubGhostGrid count={6} />
      </div>
    );
  }
  if (listQuery.isError) {
    return <FormError>{listQuery.error.message}</FormError>;
  }

  const data = listQuery.data;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader
        eyebrow="Subscriptions"
        title="订阅与数字许可"
        description="独立于实物资产；不保存密码或 License Key。"
        actions={
          <Button asChild>
            <Link to="/subscriptions/new">
              <Plus aria-hidden="true" /> 新建
            </Link>
          </Button>
        }
      />

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Reading label="进行中" value={String(data.totals.activeCount)} />
        <Reading
          label="预计月支出"
          value={formatMinorCurrency(data.totals.projectedMonthlyMinor, baseCurrency)}
        />
        <Reading
          label="预计年支出"
          value={formatMinorCurrency(data.totals.projectedYearlyMinor, baseCurrency)}
        />
        <Reading
          label="实际已支出"
          value={formatMinorCurrency(data.totals.actualSpendMinor, baseCurrency)}
        />
      </dl>

      {data.items.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="还没有订阅"
          description="把云服务、域名、买断软件单独记在这里，不与实物物品混在一起。"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((item) => (
            <SubscriptionCard item={item} key={item.id} />
          ))}
        </div>
      )}
    </div>
  );
}

/* 新记下的一笔订阅：短暂墨迹未干。 */
function SubscriptionCard({ item }: { item: SubscriptionList['items'][number] }) {
  const fresh = useFreshMark(item.id);
  return (
    <Link
      data-slot="card"
      data-interactive="true"
      className={cn('flex flex-col gap-2 p-4 text-card-foreground', fresh && 'fresh-ink')}
      to="/subscriptions/$subscriptionId"
      params={{ subscriptionId: item.id }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p data-slot="ledger-label">
            {item.kind === 'digital_license' ? '数字许可' : '周期订阅'}
          </p>
          <h2 className="truncate text-sm font-semibold text-heading">{item.name}</h2>
        </div>
        <Badge variant={statusTone[item.status] ?? 'outline'}>
          {statusLabel[item.status] ?? item.status}
        </Badge>
      </div>
      <p data-slot="amount" className="text-xs text-muted-foreground">
        {item.vendor || '未填厂商'} ·{' '}
        {formatMinorCurrency(item.amountMinor, item.currency)} / {item.billingCycle}
      </p>
      <p data-slot="amount" className="text-xs text-muted-foreground">
        预计月 {formatMinorCurrency(item.metrics.projectedMonthlyMinor, item.currency)}
        {' · '}
        实际 {formatMinorCurrency(item.metrics.actualSpendMinor, item.currency)}
      </p>
    </Link>
  );
}

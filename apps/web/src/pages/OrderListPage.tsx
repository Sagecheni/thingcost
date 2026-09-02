import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, PackageCheck, Plus, ReceiptText } from 'lucide-react';

import type { PurchaseOrderSummary } from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { formatMinorCurrency } from '../lib/format.js';
import { api } from '../lib/api.js';
import { useFreshMark } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from '../components/ui/button.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { FormError } from '../components/ui/form.js';
import { StubGhostGrid } from '../components/ui/ledger-skeleton.js';
import { PageHeader } from '../components/ui/page-header.js';

export function OrderListPage() {
  const ordersQuery = useQuery({ queryKey: queryKeys.orders, queryFn: api.orders });
  const orders = ordersQuery.data ?? [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        eyebrow="Purchase ledger"
        title="购买订单"
        description="把共享优惠和运费精确分回每一件新物品。"
        actions={
          <Button asChild>
            <Link to="/orders/new">
              <Plus aria-hidden="true" /> 录入订单
            </Link>
          </Button>
        }
      />

      {ordersQuery.isPending ? <StubGhostGrid count={6} /> : null}
      <FormError>{ordersQuery.error?.message}</FormError>

      {!ordersQuery.isPending && orders.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="还没有多商品订单"
          description="单件物品仍可快速添加；遇到满减、共享运费时再使用订单模式。"
          action={
            <Button asChild variant="secondary">
              <Link to="/orders/new">创建第一笔订单</Link>
            </Button>
          }
        />
      ) : null}

      {orders.length > 0 ? (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* 新下的一笔订单：短暂墨迹未干。 */
function OrderRow({ order }: { order: PurchaseOrderSummary }) {
  const fresh = useFreshMark(order.id);
  return (
    <Link
      data-slot="card"
      data-interactive="true"
      className={cn(
        'flex items-center gap-3 p-4 text-card-foreground',
        fresh && 'fresh-ink',
      )}
      to="/orders/$orderId"
      params={{ orderId: order.id }}
    >
      <ReceiptText
        aria-hidden="true"
        className="size-[22px] shrink-0 text-muted-foreground"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-heading">
              {order.merchant || '未填写商家'}
            </h2>
            <p data-slot="amount" className="truncate text-xs text-muted-foreground">
              {order.orderNumber || '无订单号'}
            </p>
          </div>
          <strong data-slot="amount" className="shrink-0 text-base font-medium">
            {formatMinorCurrency(order.totalPaidMinor, order.currency)}
          </strong>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <PackageCheck aria-hidden="true" className="size-3.5" />
            <span data-slot="amount">{order.itemCount} 件物品</span>
          </span>
          <span data-slot="amount">{order.orderedOn}</span>
          {order.discountMinor !== '0' ? (
            <span data-slot="amount">
              优惠 {formatMinorCurrency(order.discountMinor, order.currency)}
            </span>
          ) : null}
          <span>
            {order.allocationMethod === 'manual' ? '手工分摊' : '按原价比例分摊'}
          </span>
        </div>
      </div>
      <ArrowRight
        aria-hidden="true"
        className="size-[19px] shrink-0 text-muted-foreground"
      />
    </Link>
  );
}

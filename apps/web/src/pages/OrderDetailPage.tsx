import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';

import { api } from '../lib/api.js';
import { formatMinorCurrency } from '../lib/format.js';
import { useFreshMark } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Badge } from '../components/ui/badge.js';
import { FormError, Panel } from '../components/ui/form.js';
import { PanelGhost } from '../components/ui/ledger-skeleton.js';
import { cn } from '@thingcost/ui';

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

export function OrderDetailPage() {
  const { orderId } = useParams({ from: '/orders/$orderId' });
  const orderQuery = useQuery({
    queryKey: queryKeys.order(orderId),
    queryFn: () => api.order(orderId),
  });
  const fresh = useFreshMark(orderId);

  if (orderQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <PanelGhost lines={5} />
      </div>
    );
  }
  if (orderQuery.isError) {
    return <FormError>{orderQuery.error.message}</FormError>;
  }

  const order = orderQuery.data;
  const sharedFees = (
    BigInt(order.shippingMinor) +
    BigInt(order.taxMinor) +
    BigInt(order.feeMinor)
  ).toString();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header
        className={cn(
          'flex flex-col gap-3 border-b border-border pb-5',
          fresh && 'fresh-ink',
        )}
      >
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          to="/orders"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 返回订单
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p data-slot="ledger-label">Order archive</p>
            <h1 className="text-2xl font-semibold text-heading">
              {order.merchant || '购买订单'}
            </h1>
            <p data-slot="amount" className="text-sm text-muted-foreground">
              {order.orderNumber || '无订单号'} · {order.orderedOn}
            </p>
          </div>
          <div className="shrink-0 space-y-0.5 text-right">
            <p data-slot="ledger-label">订单实付</p>
            <strong
              data-slot="amount"
              className="block text-[28px] leading-none font-medium text-heading"
            >
              {formatMinorCurrency(order.totalPaidMinor, order.currency)}
            </strong>
            <small className="text-xs text-muted-foreground">
              {order.currency !== order.baseCurrency
                ? `折算 ${formatMinorCurrency(order.baseTotalPaidMinor, order.baseCurrency)} · 汇率 ${order.exchangeRate}${order.exchangeRateFallback ? '（回退日期）' : ''}`
                : order.allocationMethod === 'manual'
                  ? '手工分摊'
                  : '按原价比例分摊'}
            </small>
          </div>
        </div>
      </header>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Reading
          label="商品原价"
          value={formatMinorCurrency(order.subtotalMinor, order.currency)}
        />
        <Reading
          label="订单优惠"
          value={`−${formatMinorCurrency(order.discountMinor, order.currency)}`}
        />
        <Reading
          label="共享费用"
          value={formatMinorCurrency(sharedFees, order.currency)}
        />
      </dl>

      <Panel
        eyebrow="Allocation ledger"
        title="物品与分摊明细"
        action={<Badge variant="outline">{order.itemCount} 件</Badge>}
      >
        <ol className="flex flex-col">
          {order.items.map((item) => (
            <li
              className="flex gap-3 border-b border-dashed border-border py-3 last:border-0"
              key={item.id}
            >
              <span
                data-slot="amount"
                className="w-6 shrink-0 text-xs text-muted-foreground"
              >
                {String(item.sortOrder + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    {item.asset.id ? (
                      <Link
                        className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
                        to="/assets/$assetId"
                        params={{ assetId: item.asset.id }}
                      >
                        {item.asset.name}
                        <ArrowUpRight aria-hidden="true" className="size-3.5" />
                      </Link>
                    ) : (
                      <strong className="text-sm font-medium text-heading">
                        {item.asset.name}
                      </strong>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {item.asset.categoryName} · {item.asset.statusName}
                      {!item.asset.id ? ' · 物品记录已永久删除' : ''}
                    </p>
                  </div>
                  <strong data-slot="amount" className="shrink-0 text-sm font-medium">
                    {formatMinorCurrency(item.allocatedAmountMinor, order.currency)}
                  </strong>
                </div>
                {/* 分摊拆解逐项列出 —— 分摊口径必须可复算，不能只给一个结果 */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span data-slot="amount">
                    原价 {formatMinorCurrency(item.listedPriceMinor, order.currency)}
                  </span>
                  {item.allocatedDiscountMinor !== '0' ? (
                    <span data-slot="amount">
                      优惠 −
                      {formatMinorCurrency(item.allocatedDiscountMinor, order.currency)}
                    </span>
                  ) : null}
                  {item.allocatedShippingMinor !== '0' ? (
                    <span data-slot="amount">
                      运费 +
                      {formatMinorCurrency(item.allocatedShippingMinor, order.currency)}
                    </span>
                  ) : null}
                  {item.allocatedTaxMinor !== '0' ? (
                    <span data-slot="amount">
                      税费 +{formatMinorCurrency(item.allocatedTaxMinor, order.currency)}
                    </span>
                  ) : null}
                  {item.allocatedFeeMinor !== '0' ? (
                    <span data-slot="amount">
                      其他费用 +
                      {formatMinorCurrency(item.allocatedFeeMinor, order.currency)}
                    </span>
                  ) : null}
                  {item.allocationAdjustmentMinor !== '0' ? (
                    <span data-slot="amount">
                      {order.allocationMethod === 'manual' ? '手工平衡' : '舍入平衡'}{' '}
                      {formatMinorCurrency(
                        item.allocationAdjustmentMinor,
                        order.currency,
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      {order.note ? (
        <Panel eyebrow="Note" title="订单备注">
          <p className="text-sm text-foreground">{order.note}</p>
        </Panel>
      ) : null}
    </div>
  );
}

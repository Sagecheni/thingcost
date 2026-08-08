import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgePercent,
  PackageCheck,
  ReceiptText,
} from 'lucide-react';

import { api } from '../lib/api.js';
import { formatMinorCurrency } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

export function OrderDetailPage() {
  const { orderId } = useParams({ from: '/orders/$orderId' });
  const orderQuery = useQuery({
    queryKey: queryKeys.order(orderId),
    queryFn: () => api.order(orderId),
  });

  if (orderQuery.isPending) return <div className="page-loading">正在读取订单…</div>;
  if (orderQuery.isError)
    return <div className="form-error">{orderQuery.error.message}</div>;

  const order = orderQuery.data;
  return (
    <>
      <Link className="back-link" to="/orders">
        <ArrowLeft size={16} /> 返回订单
      </Link>

      <header className="topbar detail-topbar order-detail-topbar">
        <div>
          <p className="eyebrow">Order archive</p>
          <h1>{order.merchant || '购买订单'}</h1>
          <p className="muted-copy">
            {order.orderNumber || '无订单号'} · {order.orderedOn}
          </p>
        </div>
        <div className="detail-cost-block">
          <span>订单实付</span>
          <strong>{formatMinorCurrency(order.totalPaidMinor, order.currency)}</strong>
          <small>
            {order.currency !== order.baseCurrency
              ? `折算 ${formatMinorCurrency(order.baseTotalPaidMinor, order.baseCurrency)} · 汇率 ${order.exchangeRate}${order.exchangeRateFallback ? '（回退日期）' : ''}`
              : order.allocationMethod === 'manual'
                ? '手工分摊'
                : '按原价比例分摊'}
          </small>
        </div>
      </header>

      <section className="order-summary-grid">
        <article>
          <ReceiptText size={19} />
          <span>商品原价</span>
          <strong>{formatMinorCurrency(order.subtotalMinor, order.currency)}</strong>
        </article>
        <article>
          <BadgePercent size={19} />
          <span>订单优惠</span>
          <strong>−{formatMinorCurrency(order.discountMinor, order.currency)}</strong>
        </article>
        <article>
          <PackageCheck size={19} />
          <span>共享费用</span>
          <strong>
            {formatMinorCurrency(
              (
                BigInt(order.shippingMinor) +
                BigInt(order.taxMinor) +
                BigInt(order.feeMinor)
              ).toString(),
              order.currency,
            )}
          </strong>
        </article>
      </section>

      <section className="content-card order-items-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Allocation ledger</p>
            <h2>物品与分摊明细</h2>
          </div>
          <span className="status-badge">{order.itemCount} 件</span>
        </div>

        <div className="order-item-list">
          {order.items.map((item) => (
            <article className="order-item-row" key={item.id}>
              <div className="order-item-index">
                {String(item.sortOrder + 1).padStart(2, '0')}
              </div>
              <div className="order-item-main">
                <div>
                  {item.asset.id ? (
                    <Link to="/assets/$assetId" params={{ assetId: item.asset.id }}>
                      {item.asset.name} <ArrowUpRight size={14} />
                    </Link>
                  ) : (
                    <strong>{item.asset.name}</strong>
                  )}
                  <p>
                    {item.asset.categoryName} · {item.asset.statusName}
                    {!item.asset.id ? ' · 物品记录已永久删除' : ''}
                  </p>
                </div>
                <strong>
                  {formatMinorCurrency(item.allocatedAmountMinor, order.currency)}
                </strong>
              </div>
              <div className="allocation-breakdown">
                <span>
                  原价 {formatMinorCurrency(item.listedPriceMinor, order.currency)}
                </span>
                {item.allocatedDiscountMinor !== '0' && (
                  <span>
                    优惠 −
                    {formatMinorCurrency(item.allocatedDiscountMinor, order.currency)}
                  </span>
                )}
                {item.allocatedShippingMinor !== '0' && (
                  <span>
                    运费 +
                    {formatMinorCurrency(item.allocatedShippingMinor, order.currency)}
                  </span>
                )}
                {item.allocatedTaxMinor !== '0' && (
                  <span>
                    税费 +{formatMinorCurrency(item.allocatedTaxMinor, order.currency)}
                  </span>
                )}
                {item.allocatedFeeMinor !== '0' && (
                  <span>
                    其他费用 +
                    {formatMinorCurrency(item.allocatedFeeMinor, order.currency)}
                  </span>
                )}
                {item.allocationAdjustmentMinor !== '0' && (
                  <span>
                    {order.allocationMethod === 'manual' ? '手工平衡' : '舍入平衡'}{' '}
                    {formatMinorCurrency(item.allocationAdjustmentMinor, order.currency)}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {order.note && (
        <section className="content-card order-note-card">
          <p className="eyebrow">Note</p>
          <h2>订单备注</h2>
          <p>{order.note}</p>
        </section>
      )}
    </>
  );
}

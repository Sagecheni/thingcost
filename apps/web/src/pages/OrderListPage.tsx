import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, PackageCheck, Plus, ReceiptText } from 'lucide-react';

import { formatMinorCurrency } from '../lib/format.js';
import { api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';

export function OrderListPage() {
  const ordersQuery = useQuery({ queryKey: queryKeys.orders, queryFn: api.orders });
  const orders = ordersQuery.data ?? [];

  return (
    <>
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">Purchase ledger</p>
          <h1>购买订单</h1>
          <p className="muted-copy">把共享优惠和运费精确分回每一件新物品。</p>
        </div>
        <Link className="primary-action" to="/orders/new">
          <Plus size={18} /> 录入订单
        </Link>
      </header>

      {ordersQuery.isPending && <div className="page-loading">正在读取订单…</div>}
      {ordersQuery.isError && (
        <div className="form-error">{ordersQuery.error.message}</div>
      )}

      {!ordersQuery.isPending && orders.length === 0 && (
        <div className="empty-state order-empty-state">
          <span className="empty-pixel">单</span>
          <h3>还没有多商品订单</h3>
          <p>单件物品仍可快速添加；遇到满减、共享运费时再使用订单模式。</p>
          <Link className="secondary-action" to="/orders/new">
            创建第一笔订单
          </Link>
        </div>
      )}

      {orders.length > 0 && (
        <div className="order-list">
          {orders.map((order) => (
            <Link
              className="order-card"
              key={order.id}
              to="/orders/$orderId"
              params={{ orderId: order.id }}
            >
              <div className="order-card-icon" aria-hidden="true">
                <ReceiptText size={22} />
              </div>
              <div className="order-card-main">
                <div className="order-card-heading">
                  <div>
                    <h2>{order.merchant || '未填写商家'}</h2>
                    <p>{order.orderNumber || '无订单号'}</p>
                  </div>
                  <strong>
                    {formatMinorCurrency(order.totalPaidMinor, order.currency)}
                  </strong>
                </div>
                <div className="order-card-meta">
                  <span>
                    <PackageCheck size={15} /> {order.itemCount} 件物品
                  </span>
                  <span>{order.orderedOn}</span>
                  {order.discountMinor !== '0' && (
                    <span>
                      优惠 {formatMinorCurrency(order.discountMinor, order.currency)}
                    </span>
                  )}
                  <span>
                    {order.allocationMethod === 'manual' ? '手工分摊' : '按原价比例分摊'}
                  </span>
                </div>
              </div>
              <ArrowRight size={19} aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

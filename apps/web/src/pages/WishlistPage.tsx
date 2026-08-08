import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { CalendarDays, ExternalLink, Plus, Search, Sprout, Target } from 'lucide-react';

import type { WishlistListQuery } from '@thingcost/contracts';

import { api } from '../lib/api.js';
import { formatMinorCurrency } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';
import type { WishlistListSearch } from '../router.js';

const priorityLabels = { low: '随缘', medium: '想要', high: '优先' } as const;

export function WishlistPage() {
  const rawSearch = useSearch({ from: '/wishlist' });
  const navigate = useNavigate({ from: '/wishlist' });
  const search: {
    q: string;
    categoryId: string;
    priority: '' | NonNullable<WishlistListSearch['priority']>;
    status: NonNullable<WishlistListSearch['status']>;
    sort: NonNullable<WishlistListSearch['sort']>;
  } = {
    q: rawSearch.q ?? '',
    categoryId: rawSearch.categoryId ?? '',
    priority: rawSearch.priority ?? '',
    status: rawSearch.status ?? 'active',
    sort: rawSearch.sort ?? 'updated_desc',
  };
  const filters: Partial<WishlistListQuery> = {
    ...(search.q ? { q: search.q } : {}),
    ...(search.categoryId ? { categoryId: search.categoryId } : {}),
    ...(search.priority ? { priority: search.priority } : {}),
    status: search.status,
    sort: search.sort,
  };
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
  });
  const wishlistQuery = useQuery({
    queryKey: queryKeys.wishlists(filters),
    queryFn: () => api.wishlists(filters),
  });

  function updateSearch(patch: Partial<Record<keyof typeof search, string>>) {
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        return Object.fromEntries(
          Object.entries(next).filter(([, value]) => value !== '' && value !== undefined),
        );
      },
      replace: true,
    });
  }

  const items = wishlistQuery.data?.items ?? [];
  const targetReached = items.filter(
    (item) =>
      item.currentPriceMinor !== null &&
      item.targetPriceMinor !== null &&
      BigInt(item.currentPriceMinor) <= BigInt(item.targetPriceMinor),
  ).length;

  return (
    <>
      <header className="topbar page-topbar wishlist-heading">
        <div>
          <p className="eyebrow">Things worth waiting for</p>
          <h1>种草清单</h1>
          <p className="muted-copy">
            把冲动放进时间里，等价格、预算和真正的需要一起对齐。
          </p>
        </div>
        <Link className="primary-action" to="/wishlist/new">
          <Plus size={18} /> 添加种草
        </Link>
      </header>

      <section className="wishlist-overview-grid">
        <article>
          <Sprout size={19} />
          <span>
            <small>当前关注</small>
            <strong>{search.status === 'active' ? items.length : '—'}</strong>
          </span>
        </article>
        <article>
          <Target size={19} />
          <span>
            <small>达到目标价</small>
            <strong>{targetReached}</strong>
          </span>
        </article>
        <article>
          <CalendarDays size={19} />
          <span>
            <small>有购买计划</small>
            <strong>{items.filter((item) => item.plannedPurchaseDate).length}</strong>
          </span>
        </article>
      </section>

      <section className="wishlist-toolbar content-card">
        <label className="wishlist-search">
          <Search size={16} />
          <input
            value={search.q}
            onChange={(event) => updateSearch({ q: event.target.value })}
            placeholder="搜索种草名称"
          />
        </label>
        <select
          value={search.categoryId}
          onChange={(event) => updateSearch({ categoryId: event.target.value })}
        >
          <option value="">全部分类</option>
          {(categoriesQuery.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          value={search.priority}
          onChange={(event) => updateSearch({ priority: event.target.value })}
        >
          <option value="">全部优先级</option>
          <option value="high">优先</option>
          <option value="medium">想要</option>
          <option value="low">随缘</option>
        </select>
        <select
          value={search.status}
          onChange={(event) => updateSearch({ status: event.target.value })}
        >
          <option value="active">进行中</option>
          <option value="converted">已购入</option>
          <option value="archived">已归档</option>
        </select>
        <select
          value={search.sort}
          onChange={(event) => updateSearch({ sort: event.target.value })}
        >
          <option value="updated_desc">最近更新</option>
          <option value="priority_desc">优先级</option>
          <option value="planned_asc">计划日期</option>
          <option value="price_asc">当前价格</option>
        </select>
      </section>

      {wishlistQuery.isPending && <div className="page-loading">正在整理心愿…</div>}
      {wishlistQuery.isError && (
        <div className="form-error">{wishlistQuery.error.message}</div>
      )}
      {!wishlistQuery.isPending && items.length === 0 && (
        <section className="empty-state wishlist-empty">
          <span className="empty-pixel">+</span>
          <h3>{search.status === 'active' ? '还没有正在关注的物品' : '这里还是空的'}</h3>
          <p>先记下一件想买但不急着买的东西，让价格留下变化轨迹。</p>
          {search.status === 'active' && (
            <Link className="primary-action" to="/wishlist/new">
              添加第一条种草
            </Link>
          )}
        </section>
      )}

      <section className="wishlist-card-grid">
        {items.map((item) => {
          const reached =
            item.currentPriceMinor !== null &&
            item.targetPriceMinor !== null &&
            BigInt(item.currentPriceMinor) <= BigInt(item.targetPriceMinor);
          return (
            <Link
              className="wishlist-card"
              key={item.id}
              to="/wishlist/$wishlistId"
              params={{ wishlistId: item.id }}
            >
              <div className="wishlist-card-image">
                {item.image ? (
                  <img src={item.image.thumbnailUrl} alt="" />
                ) : (
                  <Sprout size={27} />
                )}
                <span className={`wishlist-priority ${item.priority}`}>
                  {priorityLabels[item.priority]}
                </span>
              </div>
              <div className="wishlist-card-body">
                <div className="wishlist-card-title">
                  <div>
                    <small>{item.category.name}</small>
                    <h2>{item.name}</h2>
                  </div>
                  {item.linkCount > 0 && (
                    <span>
                      <ExternalLink size={12} /> {item.linkCount}
                    </span>
                  )}
                </div>
                <div className="wishlist-price-row">
                  <span>
                    <small>当前价格</small>
                    <strong>
                      {formatMinorCurrency(item.currentPriceMinor, item.currency)}
                    </strong>
                  </span>
                  <span>
                    <small>目标价格</small>
                    <strong>
                      {formatMinorCurrency(item.targetPriceMinor, item.currency)}
                    </strong>
                  </span>
                </div>
                <div className="wishlist-card-meta">
                  <span
                    className={reached ? 'wishlist-target reached' : 'wishlist-target'}
                  >
                    {reached
                      ? '已达到目标价'
                      : item.snapshotCount > 0
                        ? `${item.snapshotCount} 个价格点`
                        : '等待价格记录'}
                  </span>
                  <time>
                    {item.plannedPurchaseDate
                      ? `计划 ${item.plannedPurchaseDate}`
                      : item.status === 'converted'
                        ? '已转为物品'
                        : '未设购买日期'}
                  </time>
                </div>
              </div>
            </Link>
          );
        })}
      </section>
    </>
  );
}

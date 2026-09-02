import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ExternalLink, Plus, Search, Sprout } from 'lucide-react';

import type { WishlistItemSummary, WishlistListQuery } from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { api } from '../lib/api.js';
import { formatMinorCurrency } from '../lib/format.js';
import { useFreshMark } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import type { WishlistListSearch } from '../router.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { FormError, SelectInput } from '../components/ui/form.js';
import { StubGhostGrid } from '../components/ui/ledger-skeleton.js';
import { PageHeader } from '../components/ui/page-header.js';

const priorityLabels = { low: '随缘', medium: '想要', high: '优先' } as const;
const priorityTone = {
  low: 'outline',
  medium: 'default',
  high: 'warning',
} as const;

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
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader
        eyebrow="Things worth waiting for"
        title="种草清单"
        description="把冲动放进时间里，等价格、预算和真正的需要一起对齐。"
        actions={
          <Button asChild>
            <Link to="/wishlist/new">
              <Plus aria-hidden="true" /> 添加种草
            </Link>
          </Button>
        }
      />

      <dl className="grid gap-4 sm:grid-cols-3">
        <Reading
          label="当前关注"
          value={search.status === 'active' ? String(items.length) : '—'}
        />
        <Reading label="达到目标价" value={String(targetReached)} />
        <Reading
          label="有购买计划"
          value={String(items.filter((item) => item.plannedPurchaseDate).length)}
        />
      </dl>

      <div data-slot="card" className="flex flex-wrap gap-2 p-3">
        <label
          data-slot="field"
          className="flex h-9 min-w-0 flex-1 basis-48 items-center gap-2 px-2.5"
        >
          <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground focus-visible:outline-none"
            value={search.q}
            onChange={(event) => updateSearch({ q: event.target.value })}
            placeholder="搜索种草名称"
          />
        </label>
        <SelectInput
          className="w-auto"
          aria-label="分类"
          value={search.categoryId}
          onChange={(event) => updateSearch({ categoryId: event.target.value })}
        >
          <option value="">全部分类</option>
          {(categoriesQuery.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          className="w-auto"
          aria-label="优先级"
          value={search.priority}
          onChange={(event) => updateSearch({ priority: event.target.value })}
        >
          <option value="">全部优先级</option>
          <option value="high">优先</option>
          <option value="medium">想要</option>
          <option value="low">随缘</option>
        </SelectInput>
        <SelectInput
          className="w-auto"
          aria-label="状态"
          value={search.status}
          onChange={(event) => updateSearch({ status: event.target.value })}
        >
          <option value="active">进行中</option>
          <option value="converted">已购入</option>
          <option value="archived">已归档</option>
        </SelectInput>
        <SelectInput
          className="w-auto"
          aria-label="排序"
          value={search.sort}
          onChange={(event) => updateSearch({ sort: event.target.value })}
        >
          <option value="updated_desc">最近更新</option>
          <option value="priority_desc">优先级</option>
          <option value="planned_asc">计划日期</option>
          <option value="price_asc">当前价格</option>
        </SelectInput>
      </div>

      {wishlistQuery.isPending ? <StubGhostGrid count={6} /> : null}
      <FormError>{wishlistQuery.error?.message}</FormError>

      {!wishlistQuery.isPending && items.length === 0 ? (
        <EmptyState
          icon={Sprout}
          title={search.status === 'active' ? '还没有正在关注的物品' : '这里还是空的'}
          description="先记下一件想买但不急着买的东西，让价格留下变化轨迹。"
          action={
            search.status === 'active' ? (
              <Button asChild>
                <Link to="/wishlist/new">添加第一条种草</Link>
              </Button>
            ) : null
          }
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <WishlistCard item={item} key={item.id} />
        ))}
      </div>
    </div>
  );
}

/* 新记下的一条心愿：短暂墨迹未干。 */
function WishlistCard({ item }: { item: WishlistItemSummary }) {
  const fresh = useFreshMark(item.id);
  const reached =
    item.currentPriceMinor !== null &&
    item.targetPriceMinor !== null &&
    BigInt(item.currentPriceMinor) <= BigInt(item.targetPriceMinor);
  return (
    <Link
      data-slot="card"
      data-interactive="true"
      className={cn('flex flex-col text-card-foreground', fresh && 'fresh-ink')}
      to="/wishlist/$wishlistId"
      params={{ wishlistId: item.id }}
    >
      <div className="relative flex h-28 items-center justify-center border-b border-border bg-muted/40">
        {item.image ? (
          <img
            className="block size-full object-cover"
            src={item.image.thumbnailUrl}
            alt=""
          />
        ) : (
          <Sprout aria-hidden="true" className="size-7 text-muted-foreground" />
        )}
        <span className="absolute top-0 left-0">
          <Badge variant={priorityTone[item.priority]}>
            {priorityLabels[item.priority]}
          </Badge>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p data-slot="ledger-label">{item.category.name}</p>
            <h2 className="truncate text-sm font-semibold text-heading">{item.name}</h2>
          </div>
          {item.linkCount > 0 ? (
            <span
              data-slot="amount"
              className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
            >
              <ExternalLink aria-hidden="true" className="size-3" />
              {item.linkCount}
            </span>
          ) : null}
        </div>

        <dl className="flex justify-between gap-2 border-t border-dashed border-border pt-2">
          <div>
            <dt data-slot="ledger-label">当前价格</dt>
            <dd data-slot="amount" className="text-sm font-medium text-heading">
              {formatMinorCurrency(item.currentPriceMinor, item.currency)}
            </dd>
          </div>
          <div className="text-right">
            <dt data-slot="ledger-label">目标价格</dt>
            <dd data-slot="amount" className="text-sm font-medium">
              {formatMinorCurrency(item.targetPriceMinor, item.currency)}
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          <span
            className={reached ? 'font-medium text-success' : 'text-muted-foreground'}
          >
            {reached
              ? '已达到目标价'
              : item.snapshotCount > 0
                ? `${item.snapshotCount} 个价格点`
                : '等待价格记录'}
          </span>
          <time data-slot="amount" className="text-muted-foreground">
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
}

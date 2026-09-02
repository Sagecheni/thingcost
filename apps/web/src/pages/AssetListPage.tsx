import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Filter, Grid2X2, List, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { AssetListQuery, AssetSummary } from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { AssetCard } from '../components/AssetCard.js';
import { TypeBlock } from '../components/TypeBlock.js';
import { Button } from '../components/ui/button.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { FormError, SelectInput } from '../components/ui/form.js';
import { LedgerRowsGhost, StubGhostGrid } from '../components/ui/ledger-skeleton.js';
import { PageHeader } from '../components/ui/page-header.js';
import { api } from '../lib/api.js';
import { useBaseCurrency } from '../lib/application-settings.js';
import { useFreshMark } from '../lib/fresh-marks.js';
import {
  conditionGradeLabel,
  formatMinorCurrency,
  signedMajorToMinor,
} from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';
import type { AssetListSearch } from '../router.js';

const conditionGrades = ['new', 'like_new', 'good', 'fair', 'poor'] as const;

/* 成本排序在前 —— 这是这个产品最常问的问题：什么东西每天最贵。 */
const sortOptions = [
  { value: 'daily_cost_desc', label: '日均成本最高' },
  { value: 'net_cost_desc', label: '净成本最高' },
  { value: 'acquired_desc', label: '最近取得' },
  { value: 'updated_desc', label: '最近更新' },
  { value: 'name_asc', label: '名称' },
] as const;

interface AssetListUiSearch {
  q: string;
  categoryId: string;
  statusId: string;
  tagId: string;
  conditionGrade: '' | NonNullable<AssetListSearch['conditionGrade']>;
  costKnowledge: '' | NonNullable<AssetListSearch['costKnowledge']>;
  acquiredFrom: string;
  acquiredTo: string;
  minCost: string;
  maxCost: string;
  sort: NonNullable<AssetListSearch['sort']>;
}

function initialView(): 'grid' | 'table' {
  return window.localStorage.getItem('chronicle-asset-view') === 'table'
    ? 'table'
    : 'grid';
}

/* 按成本排序时，排序键为空的物品不能混进来假装排在最后一名 ——
 * 它们是"还没量过"，不是"量出来最小"。分成两组，各自说清楚。 */
function sortKeyMissing(item: AssetSummary, sort: AssetListUiSearch['sort']): boolean {
  if (sort === 'daily_cost_desc') return item.metrics.netDailyCostMinor === null;
  if (sort === 'net_cost_desc') return item.metrics.netCostMinor === null;
  return false;
}

const fieldLabel = 'flex flex-col gap-1.5 text-xs text-muted-foreground';
const field = cn(
  'h-9 w-full px-2.5 text-sm text-foreground',
  'focus-visible:outline-none',
);

export function AssetListPage() {
  const baseCurrency = useBaseCurrency();
  const rawSearch = useSearch({ from: '/assets' });
  const search: AssetListUiSearch = {
    q: rawSearch.q ?? '',
    categoryId: rawSearch.categoryId ?? '',
    statusId: rawSearch.statusId ?? '',
    tagId: rawSearch.tagId ?? '',
    conditionGrade: rawSearch.conditionGrade ?? '',
    costKnowledge: rawSearch.costKnowledge ?? '',
    acquiredFrom: rawSearch.acquiredFrom ?? '',
    acquiredTo: rawSearch.acquiredTo ?? '',
    minCost: rawSearch.minCost ?? '',
    maxCost: rawSearch.maxCost ?? '',
    /* 默认按日均成本降序 */
    sort: rawSearch.sort ?? 'daily_cost_desc',
  };
  const navigate = useNavigate({ from: '/assets' });
  const [view, setView] = useState<'grid' | 'table'>(initialView);
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
  });
  const statusesQuery = useQuery({ queryKey: queryKeys.statuses, queryFn: api.statuses });
  const tagsQuery = useQuery({ queryKey: queryKeys.tags, queryFn: api.tags });
  const apiFilters: Partial<AssetListQuery> = {
    ...(search.q ? { q: search.q } : {}),
    ...(search.categoryId ? { categoryId: search.categoryId } : {}),
    ...(search.statusId ? { statusId: search.statusId } : {}),
    ...(search.tagId ? { tagId: search.tagId } : {}),
    ...(search.conditionGrade ? { conditionGrade: search.conditionGrade } : {}),
    ...(search.costKnowledge ? { costKnowledge: search.costKnowledge } : {}),
    ...(search.acquiredFrom ? { acquiredFrom: search.acquiredFrom } : {}),
    ...(search.acquiredTo ? { acquiredTo: search.acquiredTo } : {}),
    ...(signedMajorToMinor(search.minCost, baseCurrency)
      ? {
          minNetCostMinor: signedMajorToMinor(search.minCost, baseCurrency) ?? undefined,
        }
      : {}),
    ...(signedMajorToMinor(search.maxCost, baseCurrency)
      ? {
          maxNetCostMinor: signedMajorToMinor(search.maxCost, baseCurrency) ?? undefined,
        }
      : {}),
    sort: search.sort,
  };
  const assetsQuery = useQuery({
    queryKey: queryKeys.assets(apiFilters),
    queryFn: () => api.assets(apiFilters),
  });

  useEffect(() => {
    window.localStorage.setItem('chronicle-asset-view', view);
  }, [view]);

  const updateSearch = (patch: Partial<Record<keyof typeof search, string>>) => {
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        return Object.fromEntries(
          Object.entries(next).filter(([, value]) => value !== '' && value !== undefined),
        );
      },
      replace: true,
    });
  };
  const clearFilters = () => {
    updateSearch({
      categoryId: '',
      statusId: '',
      tagId: '',
      conditionGrade: '',
      costKnowledge: '',
      acquiredFrom: '',
      acquiredTo: '',
      minCost: '',
      maxCost: '',
    });
  };
  const activeFilterCount = [
    search.categoryId,
    search.statusId,
    search.tagId,
    search.conditionGrade,
    search.costKnowledge,
    search.acquiredFrom,
    search.acquiredTo,
    search.minCost,
    search.maxCost,
  ].filter(Boolean).length;

  const items = assetsQuery.data?.items ?? [];
  /* 服务端已经把排序键为空的排在后面；这里只是把它们摘出来单独成组，
   * 好让标题能解释清楚"为什么这几件不参与排名"。 */
  const measured = items.filter((item) => !sortKeyMissing(item, search.sort));
  const unmeasured = items.filter((item) => sortKeyMissing(item, search.sort));
  const filtersOpen = activeFilterCount > 0;
  const emptyAfterFilter = Boolean(search.q) || activeFilterCount > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader
        eyebrow="全部物品"
        title="器物档案"
        description="默认按日均成本排序。筛选条件保存在地址里；成本未知不会被当作零。"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/assets/recycle-bin">
                <Trash2 aria-hidden="true" />
                回收站
              </Link>
            </Button>
            <Button asChild>
              <Link to="/assets/new">
                <Plus aria-hidden="true" />
                添加物品
              </Link>
            </Button>
          </>
        }
      />

      {/* 工具条：搜索 + 排序 + 视图 */}
      <div className="flex flex-wrap items-center gap-2">
        <label
          data-slot="field"
          className="flex h-9 min-w-0 flex-1 basis-56 items-center gap-2 px-2.5"
        >
          <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground focus-visible:outline-none"
            value={search.q}
            onChange={(event) => updateSearch({ q: event.target.value })}
            placeholder="搜索名称、品牌、型号、标签或状态"
          />
          {search.q ? (
            <button
              className="shrink-0 text-muted-foreground hover:text-foreground"
              type="button"
              aria-label="清除搜索"
              onClick={() => updateSearch({ q: '' })}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </label>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          排序
          <SelectInput
            className={cn(field, 'w-36')}
            value={search.sort}
            onChange={(event) => updateSearch({ sort: event.target.value })}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </label>

        {/* 视图切换是一组按钮，不是填写栏：不能挂 data-slot="field"，
         * 否则按钮的焦点框会和 field 的 focus-within 描边叠成两圈。 */}
        <div
          className="flex items-center border border-border bg-input p-0.5"
          role="group"
          aria-label="切换视图"
        >
          <button
            className={cn(
              'flex size-11 items-center justify-center transition duration-150 sm:size-8',
              view === 'grid'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            type="button"
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
            aria-label="存根视图"
          >
            <Grid2X2 aria-hidden="true" className="size-4" />
          </button>
          <button
            className={cn(
              'flex size-11 items-center justify-center transition duration-150 sm:size-8',
              view === 'table'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            type="button"
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
            aria-label="账页视图"
          >
            <List aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      {/* 筛选 */}
      {/* 筛选抽屉是一叠夹纸，不是存根：不要那道 4px 的撕口顶线 */}
      <details
        className="border border-border bg-card [&_summary::-webkit-details-marker]:hidden"
        open={filtersOpen || undefined}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <Filter aria-hidden="true" className="size-4 text-muted-foreground" />
            筛选
            {activeFilterCount > 0 ? (
              <span
                data-slot="amount"
                className="bg-primary px-1.5 text-xs text-primary-foreground"
              >
                {activeFilterCount}
              </span>
            ) : null}
          </span>
          {activeFilterCount > 0 ? (
            <button
              className="text-xs text-link hover:underline"
              type="button"
              onClick={(event) => {
                event.preventDefault();
                clearFilters();
              }}
            >
              清除筛选
            </button>
          ) : null}
        </summary>

        <div className="grid gap-3 border-t border-border px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className={fieldLabel}>
            分类
            <SelectInput
              className={field}
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
          </label>
          <label className={fieldLabel}>
            状态
            <SelectInput
              className={field}
              value={search.statusId}
              onChange={(event) => updateSearch({ statusId: event.target.value })}
            >
              <option value="">全部状态</option>
              {(statusesQuery.data ?? []).map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </SelectInput>
          </label>
          <label className={fieldLabel}>
            标签
            <SelectInput
              className={field}
              value={search.tagId}
              onChange={(event) => updateSearch({ tagId: event.target.value })}
            >
              <option value="">全部标签</option>
              {(tagsQuery.data ?? []).map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </SelectInput>
          </label>
          <label className={fieldLabel}>
            当前成色
            <SelectInput
              className={field}
              value={search.conditionGrade}
              onChange={(event) => updateSearch({ conditionGrade: event.target.value })}
            >
              <option value="">全部成色</option>
              {conditionGrades.map((grade) => (
                <option key={grade} value={grade}>
                  {conditionGradeLabel(grade)}
                </option>
              ))}
            </SelectInput>
          </label>
          <label className={fieldLabel}>
            成本完整度
            <SelectInput
              className={field}
              value={search.costKnowledge}
              onChange={(event) => updateSearch({ costKnowledge: event.target.value })}
            >
              <option value="">全部</option>
              <option value="known_amount">金额已知</option>
              <option value="known_zero">确定为零</option>
              <option value="unknown">成本未知</option>
            </SelectInput>
          </label>
          <label className={fieldLabel}>
            取得日期从
            <input
              data-slot="field"
              className={field}
              type="date"
              value={search.acquiredFrom}
              onChange={(event) => updateSearch({ acquiredFrom: event.target.value })}
            />
          </label>
          <label className={fieldLabel}>
            至
            <input
              data-slot="field"
              className={field}
              type="date"
              value={search.acquiredTo}
              onChange={(event) => updateSearch({ acquiredTo: event.target.value })}
            />
          </label>
          <label className={fieldLabel}>
            最低净成本（{baseCurrency}）
            <input
              data-slot="field"
              className={field}
              inputMode="decimal"
              value={search.minCost}
              onChange={(event) => updateSearch({ minCost: event.target.value })}
              placeholder="0.00"
            />
          </label>
          <label className={fieldLabel}>
            最高净成本（{baseCurrency}）
            <input
              data-slot="field"
              className={field}
              inputMode="decimal"
              value={search.maxCost}
              onChange={(event) => updateSearch({ maxCost: event.target.value })}
              placeholder="不限"
            />
          </label>
        </div>
      </details>

      <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span data-slot="amount">
          {assetsQuery.data ? `共 ${assetsQuery.data.total} 件` : '正在读取'}
        </span>
        {activeFilterCount > 0 ? (
          <span>已启用 {activeFilterCount} 个筛选条件</span>
        ) : null}
      </p>

      {/* 骨架形状跟随视图形态：卡片存根对卡片，账页行对账页 */}
      {assetsQuery.isPending ? (
        view === 'table' ? (
          <LedgerRowsGhost />
        ) : (
          <StubGhostGrid count={8} />
        )
      ) : null}
      {assetsQuery.isError ? (
        <div className="flex flex-col items-start gap-3">
          <FormError>{assetsQuery.error.message}</FormError>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void assetsQuery.refetch()}
          >
            重新读取
          </Button>
        </div>
      ) : null}

      {!assetsQuery.isPending && items.length === 0 ? (
        <EmptyState
          title={emptyAfterFilter ? '没有匹配的物品' : '档案还是空的'}
          description={
            emptyAfterFilter
              ? '调整搜索词或清除部分筛选。'
              : '先添加一件物品，让时间线开始运转。'
          }
          action={
            emptyAfterFilter ? (
              <Button variant="secondary" type="button" onClick={clearFilters}>
                清除筛选
              </Button>
            ) : (
              <Button asChild>
                <Link to="/assets/new">添加第一件物品</Link>
              </Button>
            )
          }
        />
      ) : null}

      {view === 'grid' && items.length > 0 ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {measured.map((item) => (
              <AssetCard asset={item} currency={baseCurrency} key={item.id} />
            ))}
          </div>

          {unmeasured.length > 0 ? (
            <section className="flex flex-col gap-4 border-t border-dashed border-border pt-5">
              <div className="space-y-1">
                <h2 data-slot="ledger-label">待补录 · {unmeasured.length} 件</h2>
                <p className="text-xs text-muted-foreground">
                  {search.sort === 'daily_cost_desc'
                    ? '成本未记录或尚未服役，摊不出日均成本，因此不参与排名。'
                    : '成本未记录，没有净成本可以排名。'}
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {unmeasured.map((item) => (
                  <AssetCard asset={item} currency={baseCurrency} key={item.id} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {view === 'table' && items.length > 0 ? (
        <AssetLedger currency={baseCurrency} items={items} />
      ) : null}
    </div>
  );
}

/* 账页视图：一行一件，金额右对齐真的成列。
 * 物品多起来之后这是唯一还扫得动的形态。 */
function AssetLedger({ currency, items }: { currency: string; items: AssetSummary[] }) {
  return (
    <div data-slot="card" className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-2.5 text-left" data-slot="ledger-label" scope="col">
              物品
            </th>
            <th className="px-4 py-2.5 text-left" data-slot="ledger-label" scope="col">
              分类 · 状态
            </th>
            <th className="px-4 py-2.5 text-right" data-slot="ledger-label" scope="col">
              日均成本
            </th>
            <th className="px-4 py-2.5 text-right" data-slot="ledger-label" scope="col">
              净成本
            </th>
            <th className="px-4 py-2.5 text-right" data-slot="ledger-label" scope="col">
              服役
            </th>
            <th className="px-4 py-2.5 text-right" data-slot="ledger-label" scope="col">
              取得
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <LedgerRow currency={currency} item={item} key={item.id} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* 一行一账目。刚写下的那一行会短暂"墨迹未干"，然后归于平静。 */
function LedgerRow({ currency, item }: { currency: string; item: AssetSummary }) {
  const unknown = item.costKnowledge === 'unknown';
  const fresh = useFreshMark(item.id);
  return (
    <tr
      className={cn(
        'border-b border-dashed border-border last:border-0 hover:bg-accent',
        fresh && 'fresh-ink',
      )}
    >
      <td className="px-4 py-2.5">
        <Link
          className="block min-w-0 hover:underline"
          to="/assets/$assetId"
          params={{ assetId: item.id }}
        >
          <span className="block truncate font-medium text-heading">{item.name}</span>
          {item.brand || item.model ? (
            <span className="block truncate text-xs text-muted-foreground">
              {[item.brand, item.model].filter(Boolean).join(' · ')}
            </span>
          ) : null}
        </Link>
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {/* 铅字块归分类，状态仍是文字 —— 一行一钉，列起来像字盘 */}
        <span className="flex items-center gap-1.5">
          <TypeBlock name={item.category.name} />
          <span className="truncate">
            {item.category.name} · {item.currentStatus.name}
          </span>
        </span>
      </td>
      {/* 未知永远显示破折号，不显示 ¥0 */}
      <td className="px-4 py-2.5 text-right">
        {item.metrics.netDailyCostMinor === null ? (
          <span
            className={cn('text-xs', unknown ? 'text-warning' : 'text-muted-foreground')}
          >
            {unknown ? '未记录' : '—'}
          </span>
        ) : (
          <span data-slot="amount" className="text-heading">
            {formatMinorCurrency(item.metrics.netDailyCostMinor, currency, 2)}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {item.metrics.netCostMinor === null ? (
          <span className="text-xs text-warning">未记录</span>
        ) : (
          <span data-slot="amount">
            {formatMinorCurrency(item.metrics.netCostMinor, currency)}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right text-muted-foreground" data-slot="amount">
        {item.metrics.serviceDays} 天
      </td>
      <td
        className="px-4 py-2.5 text-right text-xs text-muted-foreground"
        data-slot="amount"
      >
        {item.acquisitionDate}
      </td>
    </tr>
  );
}

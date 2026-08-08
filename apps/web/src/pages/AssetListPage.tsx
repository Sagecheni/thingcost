import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Filter, Grid2X2, List, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { AssetListQuery } from '@thingcost/contracts';

import { api } from '../lib/api.js';
import {
  acquisitionTypeLabel,
  formatDailyMinorCurrency,
  formatMinorCurrency,
  signedYuanToMinor,
} from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';
import type { AssetListSearch } from '../router.js';

const conditionLabels = {
  new: '全新',
  like_new: '近新',
  good: '良好',
  fair: '一般',
  poor: '较差',
} as const;

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

export function AssetListPage() {
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
    sort: rawSearch.sort ?? 'updated_desc',
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
    ...(signedYuanToMinor(search.minCost)
      ? { minNetCostMinor: signedYuanToMinor(search.minCost) ?? undefined }
      : {}),
    ...(signedYuanToMinor(search.maxCost)
      ? { maxNetCostMinor: signedYuanToMinor(search.maxCost) ?? undefined }
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

  return (
    <>
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">全部物品</p>
          <h1>器物档案</h1>
          <p className="muted-copy">筛选条件保存在地址中；成本未知不会被当作零。</p>
        </div>
        <div className="page-actions">
          <Link className="secondary-action" to="/assets/recycle-bin">
            <Trash2 size={17} /> 回收站
          </Link>
          <Link className="primary-action" to="/assets/new">
            <Plus size={18} /> 添加物品
          </Link>
        </div>
      </header>

      <div className="list-toolbar">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
            value={search.q}
            onChange={(event) => updateSearch({ q: event.target.value })}
            placeholder="搜索名称、品牌、型号、标签或状态"
          />
          {search.q && (
            <button
              type="button"
              aria-label="清除搜索"
              onClick={() => updateSearch({ q: '' })}
            >
              <X size={15} />
            </button>
          )}
        </label>
        <div className="view-switch" aria-label="切换视图">
          <button
            className={view === 'grid' ? 'active' : ''}
            type="button"
            onClick={() => setView('grid')}
            aria-label="卡片视图"
          >
            <Grid2X2 size={17} />
          </button>
          <button
            className={view === 'table' ? 'active' : ''}
            type="button"
            onClick={() => setView('table')}
            aria-label="表格视图"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      <details className="filter-panel" open={activeFilterCount > 0 || undefined}>
        <summary>
          <span>
            <Filter size={16} /> 筛选与排序
            {activeFilterCount > 0 && <b>{activeFilterCount}</b>}
          </span>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
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
              }}
            >
              清除筛选
            </button>
          )}
        </summary>
        <div className="filter-grid">
          <label>
            分类
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
          </label>
          <label>
            状态
            <select
              value={search.statusId}
              onChange={(event) => updateSearch({ statusId: event.target.value })}
            >
              <option value="">全部状态</option>
              {(statusesQuery.data ?? []).map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            标签
            <select
              value={search.tagId}
              onChange={(event) => updateSearch({ tagId: event.target.value })}
            >
              <option value="">全部标签</option>
              {(tagsQuery.data ?? []).map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            当前成色
            <select
              value={search.conditionGrade}
              onChange={(event) =>
                updateSearch({
                  conditionGrade: event.target.value,
                })
              }
            >
              <option value="">全部成色</option>
              {Object.entries(conditionLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            成本完整度
            <select
              value={search.costKnowledge}
              onChange={(event) =>
                updateSearch({
                  costKnowledge: event.target.value,
                })
              }
            >
              <option value="">全部</option>
              <option value="known_amount">金额已知</option>
              <option value="known_zero">确定为零</option>
              <option value="unknown">成本未知</option>
            </select>
          </label>
          <label>
            排序
            <select
              value={search.sort}
              onChange={(event) => updateSearch({ sort: event.target.value })}
            >
              <option value="updated_desc">最近更新</option>
              <option value="acquired_desc">最近取得</option>
              <option value="name_asc">名称</option>
              <option value="daily_cost_desc">日均成本最高</option>
              <option value="net_cost_desc">净成本最高</option>
            </select>
          </label>
          <label>
            取得日期从
            <input
              type="date"
              value={search.acquiredFrom}
              onChange={(event) => updateSearch({ acquiredFrom: event.target.value })}
            />
          </label>
          <label>
            至
            <input
              type="date"
              value={search.acquiredTo}
              onChange={(event) => updateSearch({ acquiredTo: event.target.value })}
            />
          </label>
          <label>
            最低净成本（元）
            <input
              inputMode="decimal"
              value={search.minCost}
              onChange={(event) => updateSearch({ minCost: event.target.value })}
              placeholder="0.00"
            />
          </label>
          <label>
            最高净成本（元）
            <input
              inputMode="decimal"
              value={search.maxCost}
              onChange={(event) => updateSearch({ maxCost: event.target.value })}
              placeholder="不限"
            />
          </label>
        </div>
      </details>

      <div className="list-result-meta">
        <span>{assetsQuery.data ? `共 ${assetsQuery.data.total} 件` : '正在读取'}</span>
        {activeFilterCount > 0 && <span>已启用 {activeFilterCount} 个筛选条件</span>}
      </div>

      {assetsQuery.isPending && <div className="page-loading">正在读取物品…</div>}
      {assetsQuery.isError && (
        <div className="form-error">{assetsQuery.error.message}</div>
      )}

      {!assetsQuery.isPending && items.length === 0 && (
        <div className="empty-state">
          <span className="empty-pixel">物</span>
          <h3>{search.q || activeFilterCount > 0 ? '没有匹配的物品' : '档案还是空的'}</h3>
          <p>
            {search.q || activeFilterCount > 0
              ? '调整搜索词或清除部分筛选。'
              : '先添加一件物品，让时间线开始运转。'}
          </p>
        </div>
      )}

      {view === 'grid' && items.length > 0 && (
        <div className="asset-grid">
          {items.map((item) => (
            <Link
              className="asset-card"
              key={item.id}
              to="/assets/$assetId"
              params={{ assetId: item.id }}
            >
              {item.coverAttachment?.thumbnailUrl && (
                <div className="asset-card-cover">
                  <img
                    src={item.coverAttachment.thumbnailUrl}
                    alt={item.coverAttachment.caption || `${item.name}封面`}
                    loading="lazy"
                  />
                </div>
              )}
              <div className="asset-card-topline">
                <span className="asset-card-category">{item.category.name}</span>
                <span className="status-badge">{item.currentStatus.name}</span>
              </div>
              <h3>{item.name}</h3>
              <p>
                {[item.brand, item.model].filter(Boolean).join(' · ') ||
                  acquisitionTypeLabel(item.acquisitionType)}
              </p>
              <div className="asset-card-tags">
                {item.currentCondition && (
                  <span>{conditionLabels[item.currentCondition.grade]}</span>
                )}
                {item.tags.slice(0, 3).map((tag) => (
                  <span key={tag.id}>#{tag.name}</span>
                ))}
                {item.hasOpenLoan && <span>借出中</span>}
                {item.hasOpenRepair && <span>维修中</span>}
              </div>
              <div className="asset-card-cost">
                <strong>
                  {item.metrics.netCostMinor !== null &&
                  Number(item.metrics.netCostMinor) < 0
                    ? '日均净收益 '
                    : ''}
                  {formatDailyMinorCurrency(item.metrics.netDailyCostMinor)}
                </strong>
                <small>净成本 {formatMinorCurrency(item.metrics.netCostMinor)}</small>
              </div>
              <div className="asset-card-footer">
                <span>持有 {item.metrics.holdingDays} 天</span>
                <span>服役 {item.metrics.serviceDays} 天</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {view === 'table' && items.length > 0 && (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>物品</th>
                <th>分类 / 标签</th>
                <th>状态</th>
                <th>成色</th>
                <th>取得日期</th>
                <th>净成本</th>
                <th>日均成本</th>
                <th>服役</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to="/assets/$assetId" params={{ assetId: item.id }}>
                      <strong>{item.name}</strong>
                      <small>
                        {[item.brand, item.model].filter(Boolean).join(' · ')}
                      </small>
                    </Link>
                  </td>
                  <td>
                    {item.category.name}
                    <small>{item.tags.map((tag) => `#${tag.name}`).join(' ')}</small>
                  </td>
                  <td>{item.currentStatus.name}</td>
                  <td>
                    {item.currentCondition
                      ? conditionLabels[item.currentCondition.grade]
                      : '未记录'}
                  </td>
                  <td>{item.acquisitionDate}</td>
                  <td>{formatMinorCurrency(item.metrics.netCostMinor)}</td>
                  <td>{formatDailyMinorCurrency(item.metrics.netDailyCostMinor)}</td>
                  <td>{item.metrics.serviceDays} 天</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

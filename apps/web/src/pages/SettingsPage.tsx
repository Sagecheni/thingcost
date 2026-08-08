import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2, Trash2 } from 'lucide-react';

import type { AssetStatus, Category } from '@thingcost/contracts';

import { api, getApiErrorMessage } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

function CategoryEditor({ category }: { category: Category }) {
  const client = useQueryClient();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color ?? '');
  const update = useMutation({
    mutationFn: () =>
      api.updateCategory(category.id, { name, color: color || undefined }),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.categories }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteCategory(category.id),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.categories }),
  });

  if (category.isSystem) {
    return (
      <div className="catalog-row catalog-row-readonly">
        <span
          className="category-dot"
          style={{ background: category.color ?? undefined }}
        />
        <strong>{category.name}</strong>
        <span className="status-chip">系统</span>
      </div>
    );
  }

  return (
    <form
      className="catalog-row catalog-edit-row"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate();
      }}
    >
      <input
        aria-label="分类名称"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <input
        aria-label="分类颜色"
        placeholder="#d97706"
        value={color}
        onChange={(event) => setColor(event.target.value)}
      />
      <button className="secondary-action" disabled={update.isPending} type="submit">
        保存
      </button>
      <button
        aria-label={`删除分类 ${category.name}`}
        className="icon-button danger-icon-button"
        disabled={remove.isPending}
        type="button"
        onClick={() => {
          if (window.confirm(`确定删除分类“${category.name}”吗？`)) remove.mutate();
        }}
      >
        <Trash2 size={16} />
      </button>
      {(update.error || remove.error) && (
        <p className="form-error catalog-row-error">
          {getApiErrorMessage(update.error ?? remove.error)}
        </p>
      )}
    </form>
  );
}

function StatusEditor({ status }: { status: AssetStatus }) {
  const client = useQueryClient();
  const [name, setName] = useState(status.name);
  const [countsTowardService, setCountsTowardService] = useState(
    status.countsTowardService,
  );
  const [ownershipState, setOwnershipState] = useState(status.ownershipState);
  const update = useMutation({
    mutationFn: () =>
      api.updateStatus(status.id, { name, countsTowardService, ownershipState }),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.statuses }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteStatus(status.id),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.statuses }),
  });

  if (status.isSystem) {
    return (
      <div className="catalog-row catalog-row-readonly">
        <strong>{status.name}</strong>
        <span>{status.ownershipState === 'held' ? '仍持有' : '已处置'}</span>
        <span>{status.countsTowardService ? '计入服役' : '停止服役'}</span>
        <span className="status-chip">系统</span>
      </div>
    );
  }

  return (
    <form
      className="catalog-row status-edit-row"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate();
      }}
    >
      <input
        aria-label="状态名称"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <select
        aria-label="持有语义"
        value={ownershipState}
        onChange={(event) => setOwnershipState(event.target.value as 'held' | 'disposed')}
      >
        <option value="held">仍持有</option>
        <option value="disposed">已处置</option>
      </select>
      <label className="compact-check">
        <input
          checked={countsTowardService}
          type="checkbox"
          onChange={(event) => setCountsTowardService(event.target.checked)}
        />
        计入服役
      </label>
      <button className="secondary-action" disabled={update.isPending} type="submit">
        保存
      </button>
      <button
        aria-label={`删除状态 ${status.name}`}
        className="icon-button danger-icon-button"
        disabled={remove.isPending}
        type="button"
        onClick={() => {
          if (window.confirm(`确定删除状态“${status.name}”吗？`)) remove.mutate();
        }}
      >
        <Trash2 size={16} />
      </button>
      {(update.error || remove.error) && (
        <p className="form-error catalog-row-error">
          {getApiErrorMessage(update.error ?? remove.error)}
        </p>
      )}
    </form>
  );
}

export function SettingsPage() {
  const client = useQueryClient();
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState('');
  const [statusName, setStatusName] = useState('');
  const [countsTowardService, setCountsTowardService] = useState(true);
  const [ownershipState, setOwnershipState] = useState<'held' | 'disposed'>('held');
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
  });
  const statuses = useQuery({ queryKey: queryKeys.statuses, queryFn: api.statuses });
  const createCategory = useMutation({
    mutationFn: () =>
      api.createCategory({ name: categoryName, color: categoryColor || undefined }),
    onSuccess: async () => {
      setCategoryName('');
      setCategoryColor('');
      await client.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });
  const createStatus = useMutation({
    mutationFn: () =>
      api.createStatus({ name: statusName, countsTowardService, ownershipState }),
    onSuccess: async () => {
      setStatusName('');
      await client.invalidateQueries({ queryKey: queryKeys.statuses });
    },
  });

  function submitCategory(event: FormEvent) {
    event.preventDefault();
    createCategory.mutate();
  }

  function submitStatus(event: FormEvent) {
    event.preventDefault();
    createStatus.mutate();
  }

  return (
    <main className="page settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h1>分类与状态</h1>
          <p>自定义展示名称，同时明确它是否计入服役以及是否结束持有。</p>
        </div>
        <Settings2 size={28} aria-hidden="true" />
      </header>

      <section className="panel settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CATEGORIES</p>
            <h2>物品分类</h2>
          </div>
        </div>
        <form className="catalog-create-row" onSubmit={submitCategory}>
          <input
            required
            maxLength={80}
            placeholder="新分类名称"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
          />
          <input
            maxLength={24}
            placeholder="颜色，例如 #d97706"
            value={categoryColor}
            onChange={(event) => setCategoryColor(event.target.value)}
          />
          <button
            className="primary-action"
            disabled={createCategory.isPending}
            type="submit"
          >
            添加分类
          </button>
        </form>
        {createCategory.error && (
          <p className="form-error">{getApiErrorMessage(createCategory.error)}</p>
        )}
        <div className="catalog-list">
          {categories.data?.map((category) => (
            <CategoryEditor category={category} key={category.id} />
          ))}
        </div>
      </section>

      <section className="panel settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LIFECYCLE SEMANTICS</p>
            <h2>物品状态</h2>
          </div>
        </div>
        <p className="section-note">
          “仍持有/已处置”控制持有期限；“计入服役”控制日均成本的服役天数。历史记录不会因改名而消失。
        </p>
        <form className="status-create-row" onSubmit={submitStatus}>
          <input
            required
            maxLength={80}
            placeholder="新状态名称"
            value={statusName}
            onChange={(event) => setStatusName(event.target.value)}
          />
          <select
            value={ownershipState}
            onChange={(event) =>
              setOwnershipState(event.target.value as 'held' | 'disposed')
            }
          >
            <option value="held">仍持有</option>
            <option value="disposed">已处置</option>
          </select>
          <label className="compact-check">
            <input
              checked={countsTowardService}
              type="checkbox"
              onChange={(event) => setCountsTowardService(event.target.checked)}
            />
            计入服役
          </label>
          <button
            className="primary-action"
            disabled={createStatus.isPending}
            type="submit"
          >
            添加状态
          </button>
        </form>
        {createStatus.error && (
          <p className="form-error">{getApiErrorMessage(createStatus.error)}</p>
        )}
        <div className="catalog-list">
          {statuses.data?.map((status) => (
            <StatusEditor key={status.id} status={status} />
          ))}
        </div>
      </section>
    </main>
  );
}

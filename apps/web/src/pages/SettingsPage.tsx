import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CircleHelp,
  Coins,
  Globe2,
  Palette,
  Settings2,
  Tags,
  Trash2,
} from 'lucide-react';

import type { AssetStatus, Category, Tag } from '@thingcost/contracts';

import { api, getApiErrorMessage } from '../lib/api';
import { useI18n } from '../lib/i18n.js';
import { queryKeys } from '../lib/query-keys';
import { ThemeToggle } from '../components/ThemeToggle.js';

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
        <Check size={15} aria-hidden="true" /> 保存
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

function TagEditor({ tag }: { tag: Tag }) {
  const client = useQueryClient();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? '');
  const update = useMutation({
    mutationFn: () => api.updateTag(tag.id, { name, color: color || undefined }),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.tags }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteTag(tag.id),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.tags }),
  });

  return (
    <form
      className="catalog-row tag-edit-row"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate();
      }}
    >
      <span className="category-dot" style={{ background: tag.color ?? 'var(--cyan)' }} />
      <input
        aria-label={`标签名称 ${tag.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <input
        aria-label={`标签颜色 ${tag.name}`}
        placeholder="#70d6d0"
        value={color}
        onChange={(event) => setColor(event.target.value)}
      />
      <button className="secondary-action" disabled={update.isPending} type="submit">
        <Check size={15} aria-hidden="true" /> 保存
      </button>
      <button
        aria-label={`删除标签 ${tag.name}`}
        className="icon-button danger-icon-button"
        disabled={remove.isPending}
        type="button"
        onClick={() => {
          if (window.confirm(`确定删除标签“${tag.name}”吗？`)) remove.mutate();
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
      <div className="catalog-row catalog-row-readonly status-readonly-row">
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
        <Check size={15} aria-hidden="true" /> 保存
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

const timezoneOptions = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Seoul',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'America/Los_Angeles',
  'America/New_York',
];

const currencyOptions = ['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'HKD', 'TWD', 'KRW', 'SGD'];

export function SettingsPage() {
  const client = useQueryClient();
  const { locale, setLocale } = useI18n();
  const [timeZone, setTimeZone] = useState('Asia/Shanghai');
  const [baseCurrency, setBaseCurrency] = useState('CNY');
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('');
  const [statusName, setStatusName] = useState('');
  const [countsTowardService, setCountsTowardService] = useState(true);
  const [ownershipState, setOwnershipState] = useState<'held' | 'disposed'>('held');

  const applicationSettings = useQuery({
    queryKey: queryKeys.applicationSettings,
    queryFn: api.applicationSettings,
  });
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
  });
  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: api.tags });
  const statuses = useQuery({ queryKey: queryKeys.statuses, queryFn: api.statuses });

  useEffect(() => {
    if (!applicationSettings.data) return;
    setTimeZone(applicationSettings.data.timeZone);
    setBaseCurrency(applicationSettings.data.baseCurrency);
  }, [applicationSettings.data]);

  const saveApplicationSettings = useMutation({
    mutationFn: () => api.updateApplicationSettings({ timeZone, baseCurrency }),
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: queryKeys.applicationSettings }),
  });
  const createCategory = useMutation({
    mutationFn: () =>
      api.createCategory({ name: categoryName, color: categoryColor || undefined }),
    onSuccess: async () => {
      setCategoryName('');
      setCategoryColor('');
      await client.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });
  const createTag = useMutation({
    mutationFn: () =>
      api.createTag({
        name: tagName,
        ...(tagColor.trim() ? { color: tagColor.trim() } : {}),
      }),
    onSuccess: async () => {
      setTagName('');
      setTagColor('');
      await client.invalidateQueries({ queryKey: queryKeys.tags });
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
    if (categoryName.trim()) createCategory.mutate();
  }

  function submitTag(event: FormEvent) {
    event.preventDefault();
    if (tagName.trim()) createTag.mutate();
  }

  function submitStatus(event: FormEvent) {
    event.preventDefault();
    if (statusName.trim()) createStatus.mutate();
  }

  return (
    <div className="page settings-page">
      <header className="page-header settings-page-header">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h1>设置</h1>
          <p className="muted-copy">
            管理物纪的计算口径、界面偏好，以及分类、标签和生命周期状态。
          </p>
        </div>
        <Settings2 size={30} aria-hidden="true" />
      </header>

      <section className="settings-control-grid" aria-label="应用设置">
        <section className="panel settings-section settings-preferences-section">
          <div className="settings-section-title">
            <span className="settings-section-icon">
              <Globe2 size={20} />
            </span>
            <div>
              <h2>工作区设置</h2>
              <p>影响日期显示、新提醒和金额的基础口径。</p>
            </div>
          </div>
          {applicationSettings.isPending ? (
            <p className="page-loading">正在读取工作区设置…</p>
          ) : applicationSettings.isError ? (
            <p className="form-error">{applicationSettings.error.message}</p>
          ) : (
            <form
              className="settings-preferences-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveApplicationSettings.mutate();
              }}
            >
              <label className="field">
                <span>应用时区</span>
                <input
                  list="chronicle-timezones"
                  value={timeZone}
                  onChange={(event) => setTimeZone(event.target.value)}
                  placeholder="例如 Asia/Shanghai"
                  required
                />
              </label>
              <datalist id="chronicle-timezones">
                {timezoneOptions.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              <label className="field">
                <span>基础币种</span>
                <select
                  value={baseCurrency}
                  disabled={applicationSettings.data?.baseCurrencyLocked}
                  onChange={(event) => setBaseCurrency(event.target.value)}
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>
              <div className="settings-form-actions">
                <button
                  className="primary-action"
                  type="submit"
                  disabled={saveApplicationSettings.isPending}
                >
                  {saveApplicationSettings.isPending ? '保存中…' : '保存工作区设置'}
                </button>
                {saveApplicationSettings.isSuccess && (
                  <span className="settings-saved">
                    <Check size={15} /> 已保存
                  </span>
                )}
              </div>
              {applicationSettings.data?.baseCurrencyLocked && (
                <p className="settings-warning">
                  基础币种已因历史财务记录锁定。历史金额的换算口径不会被设置修改覆盖；如需更换，请从空库重新初始化。
                </p>
              )}
              {saveApplicationSettings.isError && (
                <p className="form-error">{saveApplicationSettings.error.message}</p>
              )}
            </form>
          )}
        </section>

        <section className="panel settings-section settings-preferences-section">
          <div className="settings-section-title">
            <span className="settings-section-icon">
              <Palette size={20} />
            </span>
            <div>
              <h2>界面偏好</h2>
              <p>偏好保存在当前浏览器，不会改变账务数据。</p>
            </div>
          </div>
          <div className="preference-control-row">
            <div>
              <strong>主题</strong>
              <span>跟随系统、浅色或深色</span>
            </div>
            <ThemeToggle />
          </div>
          <div className="preference-control-row">
            <div>
              <strong>界面语言</strong>
              <span>
                {locale === 'zh-CN' ? '当前使用简体中文' : 'Currently using English'}
              </span>
            </div>
            <button
              className="secondary-action"
              type="button"
              onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
            >
              {locale === 'zh-CN' ? '切换 English' : '切换中文'}
            </button>
          </div>
          <div className="settings-help-note">
            <CircleHelp size={17} aria-hidden="true" />
            <span>页面内容会逐步接入完整双语；金额与日期会继续按工作区设置计算。</span>
          </div>
        </section>
      </section>

      <section className="panel settings-section catalog-settings-section">
        <div className="section-heading">
          <div>
            <h2>物品分类</h2>
            <p className="muted-copy">用颜色快速区分你的收藏领域。系统分类不能删除。</p>
          </div>
          <span className="settings-count">{categories.data?.length ?? 0} 个分类</span>
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

      <section className="panel settings-section catalog-settings-section">
        <div className="section-heading">
          <div>
            <h2>标签库</h2>
            <p className="muted-copy">
              标签可以跨分类复用；仍在物品或订阅中使用的标签不能删除。
            </p>
          </div>
          <span className="settings-count">{tags.data?.length ?? 0} 个标签</span>
        </div>
        <form className="catalog-create-row tag-create-row" onSubmit={submitTag}>
          <input
            required
            maxLength={80}
            placeholder="新标签名称，例如 旅行"
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
          />
          <input
            maxLength={24}
            placeholder="颜色，例如 #70d6d0"
            value={tagColor}
            onChange={(event) => setTagColor(event.target.value)}
          />
          <button className="primary-action" disabled={createTag.isPending} type="submit">
            添加标签
          </button>
        </form>
        {createTag.error && (
          <p className="form-error">{getApiErrorMessage(createTag.error)}</p>
        )}
        <div className="catalog-list">
          {tags.data?.map((tag) => (
            <TagEditor tag={tag} key={tag.id} />
          ))}
          {tags.data?.length === 0 && <p className="muted-copy">还没有自定义标签。</p>}
        </div>
      </section>

      <section className="panel settings-section catalog-settings-section">
        <div className="section-heading">
          <div>
            <h2>物品状态</h2>
            <p className="section-note">
              “仍持有/已处置”控制持有期限；“计入服役”控制日均成本的服役天数。历史记录不会因改名而消失。
            </p>
          </div>
          <span className="settings-count">{statuses.data?.length ?? 0} 个状态</span>
        </div>
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

      <section className="settings-footnote">
        <Coins size={17} aria-hidden="true" />
        <span>
          金额历史使用锁定的原币种和汇率记录；修改显示设置不会重写过去发生的事实。
        </span>
        <Tags size={17} aria-hidden="true" />
      </section>
    </div>
  );
}

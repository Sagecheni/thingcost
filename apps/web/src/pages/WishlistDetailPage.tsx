import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  ImagePlus,
  Link2,
  Plus,
  Sprout,
  Target,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';

import type { CreateWishlistItemInput, WishlistItemDetail } from '@thingcost/contracts';

import { TagPicker } from '../components/TagPicker.js';
import { ApiClientError, api } from '../lib/api.js';
import {
  formatMinorCurrency,
  localToday,
  majorToMinor,
  minorToMajor,
} from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

const priorityLabels = { low: '随缘', medium: '想要', high: '优先' } as const;
const statusLabels = {
  active: '进行中',
  converted: '已购入',
  archived: '已归档',
} as const;

export function WishlistDetailPage() {
  const { wishlistId } = useParams({ from: '/wishlist/$wishlistId' });
  const itemQuery = useQuery({
    queryKey: queryKeys.wishlist(wishlistId),
    queryFn: () => api.wishlist(wishlistId),
  });
  if (itemQuery.isPending)
    return <div className="page-loading">正在打开这条种草记录…</div>;
  if (itemQuery.isError)
    return <div className="form-error">{itemQuery.error.message}</div>;
  return <WishlistDetailContent key={itemQuery.data.updatedAt} item={itemQuery.data} />;
}

function WishlistDetailContent({ item }: { item: WishlistItemDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const statusesQuery = useQuery({ queryKey: queryKeys.statuses, queryFn: api.statuses });
  const [editOpen, setEditOpen] = useState(false);
  const [description, setDescription] = useState(item.description ?? '');
  const [targetPrice, setTargetPrice] = useState(
    item.targetPriceMinor ? String(Number(item.targetPriceMinor) / 100) : '',
  );
  const [budget, setBudget] = useState(
    item.budgetMinor ? String(Number(item.budgetMinor) / 100) : '',
  );
  const [priority, setPriority] = useState<CreateWishlistItemInput['priority']>(
    item.priority,
  );
  const [plannedDate, setPlannedDate] = useState(item.plannedPurchaseDate ?? '');
  const [price, setPrice] = useState('');
  const [priceDate, setPriceDate] = useState(localToday());
  const [priceLinkId, setPriceLinkId] = useState('');
  const [priceNote, setPriceNote] = useState('');
  const [linkMarketplace, setLinkMarketplace] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [costKnowledge, setCostKnowledge] = useState<
    'known_amount' | 'known_zero' | 'unknown'
  >('known_amount');
  const [paidPrice, setPaidPrice] = useState(
    minorToMajor(item.currentPriceMinor, item.currency),
  );
  const [conversionExchangeRate, setConversionExchangeRate] = useState('');
  const [conversionExchangeRateSource, setConversionExchangeRateSource] = useState<
    'manual' | 'frankfurter'
  >('manual');
  const [conversionExchangeRateDate, setConversionExchangeRateDate] =
    useState(localToday());
  const [conversionExchangeRateFallback, setConversionExchangeRateFallback] =
    useState(false);
  const [initialStatusId, setInitialStatusId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.wishlist(item.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.wishlistLists }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assets() }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  const update = useMutation({
    mutationFn: (input: Parameters<typeof api.updateWishlist>[1]) =>
      api.updateWishlist(item.id, input),
    onSuccess: refresh,
    onError: setMutationError(setError),
  });
  const archive = useMutation({
    mutationFn: () => api.archiveWishlist(item.id),
    onSuccess: refresh,
    onError: setMutationError(setError),
  });
  const addPrice = useMutation({
    mutationFn: (input: Parameters<typeof api.addWishlistPrice>[1]) =>
      api.addWishlistPrice(item.id, input),
    onSuccess: async () => {
      setPrice('');
      setPriceNote('');
      await refresh();
    },
    onError: setMutationError(setError),
  });
  const addLink = useMutation({
    mutationFn: (input: Parameters<typeof api.addWishlistLink>[1]) =>
      api.addWishlistLink(item.id, input),
    onSuccess: async () => {
      setLinkMarketplace('');
      setLinkUrl('');
      setLinkOpen(false);
      await refresh();
    },
    onError: setMutationError(setError),
  });
  const deleteLink = useMutation({
    mutationFn: (linkId: string) => api.deleteWishlistLink(item.id, linkId),
    onSuccess: refresh,
    onError: setMutationError(setError),
  });
  const uploadImage = useMutation({
    mutationFn: (file: File) => api.uploadWishlistImage(item.id, file),
    onSuccess: refresh,
    onError: setMutationError(setError),
  });
  const deleteImage = useMutation({
    mutationFn: () => api.deleteWishlistImage(item.id),
    onSuccess: refresh,
    onError: setMutationError(setError),
  });
  const quoteConversionRate = useMutation({
    mutationFn: () => api.exchangeRateQuote(item.currency, 'CNY', localToday()),
    onSuccess: (quote) => {
      setConversionExchangeRate(quote.rate);
      setConversionExchangeRateSource('frankfurter');
      setConversionExchangeRateDate(quote.effectiveDate);
      setConversionExchangeRateFallback(quote.fallback);
    },
    onError: setMutationError(setError),
  });
  const convert = useMutation({
    mutationFn: (input: Parameters<typeof api.convertWishlist>[1]) =>
      api.convertWishlist(item.id, input),
    onSuccess: async (result) => {
      await refresh();
      await navigate({ to: '/assets/$assetId', params: { assetId: result.assetId } });
    },
    onError: setMutationError(setError),
  });

  function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const targetMinor = targetPrice ? majorToMinor(targetPrice, item.currency) : null;
    const budgetMinor = budget ? majorToMinor(budget, item.currency) : null;
    if ((targetPrice && !targetMinor) || (budget && !budgetMinor)) {
      setError('价格请使用正确的金额格式。');
      return;
    }
    update.mutate({
      description: description.trim() || null,
      targetPriceMinor: targetMinor,
      budgetMinor,
      priority,
      plannedPurchaseDate: plannedDate || null,
    });
  }

  function savePrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = majorToMinor(price, item.currency);
    if (!amountMinor) {
      setError('请输入正确的价格。');
      return;
    }
    addPrice.mutate({
      amountMinor,
      observedOn: priceDate,
      ...(priceLinkId ? { marketplaceLinkId: priceLinkId } : {}),
      ...(priceNote.trim() ? { note: priceNote.trim() } : {}),
    });
  }

  function saveLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linkMarketplace.trim() || !/^https?:\/\//u.test(linkUrl.trim())) {
      setError('请填写平台名称和 HTTP/HTTPS 链接。');
      return;
    }
    addLink.mutate({ marketplace: linkMarketplace.trim(), url: linkUrl.trim() });
  }

  function convertItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const status =
      initialStatusId ||
      statusesQuery.data?.find((candidate) => candidate.code === 'in_use')?.id;
    const amountMinor = paidPrice ? majorToMinor(paidPrice, item.currency) : null;
    if (!status) {
      setError('请选择初始状态。');
      return;
    }
    if (costKnowledge === 'known_amount' && !amountMinor) {
      setError('已知金额需要填写实付价格。');
      return;
    }
    if (
      costKnowledge === 'known_amount' &&
      item.currency !== 'CNY' &&
      !conversionExchangeRate
    ) {
      setError('外币实付需要填写锁定汇率。');
      return;
    }
    convert.mutate({
      acquisitionDate: localToday(),
      costKnowledge,
      ...(amountMinor ? { paidPriceMinor: amountMinor } : {}),
      ...(item.currency !== 'CNY'
        ? {
            exchangeRate: conversionExchangeRate,
            exchangeRateSource: conversionExchangeRateSource,
            exchangeRateDate: conversionExchangeRateDate,
            exchangeRateFallback: conversionExchangeRateFallback,
          }
        : {}),
      initialStatusId: status,
      tagIds,
    });
  }

  const priceValues = item.priceSnapshots.map((snapshot) => Number(snapshot.amountMinor));
  const maxPrice = Math.max(...priceValues, 1);
  const targetReached =
    item.currentPriceMinor !== null &&
    item.targetPriceMinor !== null &&
    BigInt(item.currentPriceMinor) <= BigInt(item.targetPriceMinor);
  const isMutable = item.status !== 'converted';

  return (
    <>
      <Link className="back-link" to="/wishlist">
        <ArrowLeft size={16} /> 返回种草清单
      </Link>
      <header className="topbar detail-topbar wishlist-detail-topbar">
        <div>
          <p className="eyebrow">Wishlist trace</p>
          <h1>{item.name}</h1>
          <p className="muted-copy">
            {item.category.name} · {item.currency} · {statusLabels[item.status]}
          </p>
        </div>
        <div className="wishlist-detail-actions">
          <span className={`wishlist-status-badge ${item.status}`}>
            {statusLabels[item.status]}
          </span>
          {isMutable && (
            <button
              className="secondary-action"
              type="button"
              onClick={() => setEditOpen((open) => !open)}
            >
              编辑记录
            </button>
          )}
        </div>
      </header>
      {error && <div className="form-error">{error}</div>}

      <section className="wishlist-detail-hero">
        <div className="wishlist-detail-image">
          {item.image ? (
            <img src={item.image.contentUrl} alt={item.name} />
          ) : (
            <Sprout size={42} />
          )}
          {isMutable && (
            <label className="wishlist-image-upload">
              <ImagePlus size={15} />
              {uploadImage.isPending ? '上传中…' : '更换封面'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadImage.mutate(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          )}
          {item.image && isMutable && (
            <button
              className="wishlist-image-delete"
              type="button"
              onClick={() => deleteImage.mutate()}
            >
              <Trash2 size={13} /> 删除
            </button>
          )}
        </div>
        <div className="wishlist-detail-intro">
          <span className={`wishlist-priority ${item.priority}`}>
            {priorityLabels[item.priority]}
          </span>
          <h2>{item.description || '还没有写下想买它的理由。'}</h2>
          <div className="wishlist-detail-facts">
            <span>
              <CalendarDays size={15} />
              {item.plannedPurchaseDate
                ? `计划 ${item.plannedPurchaseDate}`
                : '未设计划日期'}
            </span>
            <span>
              <Link2 size={15} />
              {item.links.length} 个平台链接
            </span>
          </div>
        </div>
      </section>

      <section className="wishlist-detail-metrics">
        <article>
          <WalletCards size={18} />
          <small>当前价格</small>
          <strong>{formatMinorCurrency(item.currentPriceMinor, item.currency)}</strong>
          <span>{item.currentPriceObservedOn ?? '尚无观测日期'}</span>
        </article>
        <article className={targetReached ? 'reached' : ''}>
          <Target size={18} />
          <small>目标价格</small>
          <strong>{formatMinorCurrency(item.targetPriceMinor, item.currency)}</strong>
          <span>{targetReached ? '已达到目标' : '继续观察价格'}</span>
        </article>
        <article>
          <WalletCards size={18} />
          <small>预算上限</small>
          <strong>{formatMinorCurrency(item.budgetMinor, item.currency)}</strong>
          <span>{item.budgetMinor ? '购买决策参考' : '尚未设置预算'}</span>
        </article>
      </section>

      {editOpen && isMutable && (
        <form className="content-card wishlist-edit-form" onSubmit={saveEdit}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Edit intention</p>
              <h2>更新计划</h2>
            </div>
          </div>
          <label>
            备注
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              目标价格
              <input
                inputMode="decimal"
                value={targetPrice}
                onChange={(event) => setTargetPrice(event.target.value)}
              />
            </label>
            <label>
              预算上限
              <input
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              />
            </label>
            <label>
              计划购买日期
              <input
                type="date"
                value={plannedDate}
                onChange={(event) => setPlannedDate(event.target.value)}
              />
            </label>
            <label>
              优先级
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as typeof priority)}
              >
                <option value="high">优先</option>
                <option value="medium">想要</option>
                <option value="low">随缘</option>
              </select>
            </label>
          </div>
          <button className="primary-action" type="submit" disabled={update.isPending}>
            {update.isPending ? '保存中…' : '保存更新'}
          </button>
        </form>
      )}

      <div className="wishlist-detail-columns">
        <section className="content-card wishlist-history-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Price curve</p>
              <h2>手工价格曲线</h2>
            </div>
            {isMutable && <span className="micro-copy">每次记录都会留下快照</span>}
          </div>
          {item.priceSnapshots.length === 0 ? (
            <p className="muted-copy">还没有价格快照。</p>
          ) : (
            <div className="wishlist-price-history">
              {[...item.priceSnapshots].reverse().map((snapshot) => (
                <div className="wishlist-price-point" key={snapshot.id}>
                  <time>{snapshot.observedOn}</time>
                  <div className="wishlist-price-bar">
                    <span
                      style={{
                        width: `${Math.max(4, (Number(snapshot.amountMinor) / maxPrice) * 100)}%`,
                      }}
                    />
                  </div>
                  <strong>
                    {formatMinorCurrency(snapshot.amountMinor, snapshot.currency)}
                  </strong>
                  <small>
                    {snapshot.marketplace ?? '手工记录'}
                    {snapshot.note ? ` · ${snapshot.note}` : ''}
                  </small>
                </div>
              ))}
            </div>
          )}
          {isMutable && (
            <form className="wishlist-price-form" onSubmit={savePrice}>
              <input
                required
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="新增价格"
              />
              <input
                required
                type="date"
                value={priceDate}
                onChange={(event) => setPriceDate(event.target.value)}
              />
              <select
                value={priceLinkId}
                onChange={(event) => setPriceLinkId(event.target.value)}
              >
                <option value="">手工记录</option>
                {item.links.map((link) => (
                  <option key={link.id} value={link.id}>
                    {link.marketplace}
                  </option>
                ))}
              </select>
              <input
                value={priceNote}
                onChange={(event) => setPriceNote(event.target.value)}
                placeholder="备注（可选）"
              />
              <button
                className="primary-action"
                type="submit"
                disabled={addPrice.isPending}
              >
                <Plus size={15} /> 记录价格
              </button>
            </form>
          )}
        </section>

        <section className="content-card wishlist-links-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Marketplace links</p>
              <h2>平台链接</h2>
            </div>
            {isMutable && (
              <button
                className="secondary-action"
                type="button"
                onClick={() => setLinkOpen((open) => !open)}
              >
                <Plus size={15} /> 添加
              </button>
            )}
          </div>
          <div className="wishlist-links-list">
            {item.links.map((link) => (
              <div className="wishlist-link-row" key={link.id}>
                <span className="wishlist-link-icon">
                  <ExternalLink size={15} />
                </span>
                <a href={link.url} target="_blank" rel="noreferrer">
                  {link.marketplace}
                  <small>{link.url}</small>
                </a>
                {isMutable && (
                  <button
                    type="button"
                    title="删除链接"
                    aria-label="删除链接"
                    onClick={() => deleteLink.mutate(link.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {linkOpen && (
            <form className="wishlist-add-link-form" onSubmit={saveLink}>
              <input
                required
                value={linkMarketplace}
                onChange={(event) => setLinkMarketplace(event.target.value)}
                placeholder="平台名称"
              />
              <input
                required
                type="url"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://…"
              />
              <button
                className="primary-action"
                type="submit"
                disabled={addLink.isPending}
              >
                保存
              </button>
            </form>
          )}
        </section>
      </div>

      {item.status === 'converted' && item.convertedAsset && (
        <section className="wishlist-converted-banner">
          <Sprout size={18} />
          <span>
            <small>已保留价格历史</small>
            <strong>这条种草已转为正式物品</strong>
          </span>
          <Link
            className="text-link"
            to="/assets/$assetId"
            params={{ assetId: item.convertedAsset.id }}
          >
            打开物品 →
          </Link>
        </section>
      )}
      {isMutable && (
        <section className="content-card wishlist-convert-card">
          <div>
            <p className="eyebrow">Make it real</p>
            <h2>转为正式物品</h2>
            <p className="muted-copy">
              转入后会创建取得成本和生命周期起点；这条种草记录与全部价格快照仍会保留。
            </p>
          </div>
          <form onSubmit={convertItem}>
            <div className="form-grid">
              <label>
                实际成本
                <input
                  inputMode="decimal"
                  value={paidPrice}
                  onChange={(event) => setPaidPrice(event.target.value)}
                  placeholder="按当前价格预填"
                />
              </label>
              {item.currency !== 'CNY' && costKnowledge === 'known_amount' && (
                <label>
                  锁定汇率（1 {item.currency} = ? CNY）
                  <input
                    inputMode="decimal"
                    value={conversionExchangeRate}
                    onChange={(event) => {
                      setConversionExchangeRate(event.target.value);
                      setConversionExchangeRateSource('manual');
                      setConversionExchangeRateFallback(false);
                    }}
                    placeholder="填写实际结算汇率"
                    required
                  />
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={quoteConversionRate.isPending}
                    onClick={() => quoteConversionRate.mutate()}
                  >
                    {quoteConversionRate.isPending ? '获取中…' : '使用历史参考汇率'}
                  </button>
                </label>
              )}
              <label>
                初始状态
                <select
                  value={
                    (initialStatusId ||
                      statusesQuery.data?.find((status) => status.code === 'in_use')
                        ?.id) ??
                    ''
                  }
                  onChange={(event) => setInitialStatusId(event.target.value)}
                >
                  {(statusesQuery.data ?? [])
                    .filter(
                      (status) =>
                        status.ownershipState === 'held' &&
                        !['lent', 'in_repair'].includes(status.code),
                    )
                    .map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <fieldset className="wishlist-cost-choice">
              <legend>成本知识</legend>
              {(
                [
                  ['known_amount', '记录实际金额'],
                  ['known_zero', '确认是零成本'],
                  ['unknown', '暂时未知'],
                ] as const
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    checked={costKnowledge === value}
                    onChange={() => setCostKnowledge(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <TagPicker selected={tagIds} onChange={setTagIds} />
            <button className="primary-action" type="submit" disabled={convert.isPending}>
              {convert.isPending ? '转换中…' : '创建正式物品'}
            </button>
          </form>
        </section>
      )}
      {isMutable && (
        <button
          className="wishlist-archive-action"
          type="button"
          onClick={() => archive.mutate()}
          disabled={archive.isPending}
        >
          归档这条种草
        </button>
      )}
    </>
  );
}

function setMutationError(setError: (message: string | null) => void) {
  return (error: unknown) =>
    setError(error instanceof ApiClientError ? error.message : '操作失败，请重试。');
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Link2, Plus, Sprout, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { CreateWishlistItemInput } from '@thingcost/contracts';

import { ApiClientError, api } from '../lib/api.js';
import { localToday, majorToMinor } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

interface LinkDraft {
  marketplace: string;
  url: string;
}

export function WishlistCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
  });
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [currentPrice, setCurrentPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [budget, setBudget] = useState('');
  const [priority, setPriority] = useState<CreateWishlistItemInput['priority']>('medium');
  const [plannedPurchaseDate, setPlannedPurchaseDate] = useState('');
  const [links, setLinks] = useState<LinkDraft[]>([{ marketplace: '', url: '' }]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: api.createWishlist,
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.wishlistLists });
      await navigate({ to: '/wishlist/$wishlistId', params: { wishlistId: item.id } });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiClientError
          ? mutationError.message
          : '种草记录保存失败',
      );
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const currentPriceMinor = currentPrice ? majorToMinor(currentPrice, currency) : null;
    const targetPriceMinor = targetPrice ? majorToMinor(targetPrice, currency) : null;
    const budgetMinor = budget ? majorToMinor(budget, currency) : null;
    if (!name.trim() || !categoryId) {
      setError('请填写名称并选择分类。');
      return;
    }
    if (
      (currentPrice && !currentPriceMinor) ||
      (targetPrice && !targetPriceMinor) ||
      (budget && !budgetMinor)
    ) {
      setError('价格请使用正确的金额格式，例如 129.90。');
      return;
    }
    const validLinks = links.filter((link) => link.marketplace.trim() || link.url.trim());
    if (
      validLinks.some(
        (link) => !link.marketplace.trim() || !/^https?:\/\//u.test(link.url.trim()),
      )
    ) {
      setError('平台链接需要填写名称，并使用 HTTP 或 HTTPS 地址。');
      return;
    }
    create.mutate({
      name: name.trim(),
      categoryId,
      ...(description.trim() ? { description: description.trim() } : {}),
      currency,
      ...(currentPriceMinor
        ? { currentPriceMinor, currentPriceObservedOn: localToday() }
        : {}),
      ...(targetPriceMinor ? { targetPriceMinor } : {}),
      ...(budgetMinor ? { budgetMinor } : {}),
      priority,
      ...(plannedPurchaseDate ? { plannedPurchaseDate } : {}),
      links: validLinks.map((link) => ({
        marketplace: link.marketplace.trim(),
        url: link.url.trim(),
      })),
    });
  }

  return (
    <>
      <Link className="back-link" to="/wishlist">
        <ArrowLeft size={16} /> 返回种草清单
      </Link>
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">New want</p>
          <h1>添加种草</h1>
          <p className="muted-copy">记录想买的东西，也记录为什么现在还不买。</p>
        </div>
      </header>
      <form className="wishlist-create-layout" onSubmit={submit}>
        <div className="wishlist-form-main">
          <section className="form-card wishlist-form-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">The object</p>
                <h2>物品信息</h2>
              </div>
              <Sprout size={20} />
            </div>
            <div className="form-grid">
              <label>
                名称 *
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：机械键盘"
                />
              </label>
              <label>
                分类 *
                <select
                  required
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">请选择分类</option>
                  {(categoriesQuery.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              备注
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="为什么想要、等待什么条件"
              />
            </label>
          </section>
          <section className="form-card wishlist-form-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Price intention</p>
                <h2>价格与计划</h2>
              </div>
            </div>
            <div className="form-grid">
              <label>
                价格币种
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  <option value="CNY">CNY · 人民币</option>
                  <option value="USD">USD · 美元</option>
                  <option value="EUR">EUR · 欧元</option>
                  <option value="JPY">JPY · 日元</option>
                  <option value="HKD">HKD · 港币</option>
                </select>
              </label>
              <label>
                当前价格（可选）
                <input
                  inputMode="decimal"
                  value={currentPrice}
                  onChange={(event) => setCurrentPrice(event.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label>
                目标价格（可选）
                <input
                  inputMode="decimal"
                  value={targetPrice}
                  onChange={(event) => setTargetPrice(event.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label>
                预算上限（可选）
                <input
                  inputMode="decimal"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label>
                计划购买日期
                <input
                  type="date"
                  value={plannedPurchaseDate}
                  onChange={(event) => setPlannedPurchaseDate(event.target.value)}
                />
              </label>
              <label>
                优先级
                <select
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as CreateWishlistItemInput['priority'])
                  }
                >
                  <option value="high">优先 · 近期想解决</option>
                  <option value="medium">想要 · 等合适时机</option>
                  <option value="low">随缘 · 先记录</option>
                </select>
              </label>
            </div>
          </section>
          <section className="form-card wishlist-form-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Sources</p>
                <h2>平台链接</h2>
              </div>
              <Link2 size={20} />
            </div>
            <p className="micro-copy">
              只保存链接，不保存平台登录信息；价格由你手工记录。
            </p>
            <div className="wishlist-link-drafts">
              {links.map((link, index) => (
                <div className="wishlist-link-draft" key={index}>
                  <span className="wishlist-link-number">{index + 1}</span>
                  <input
                    value={link.marketplace}
                    onChange={(event) =>
                      setLinks((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, marketplace: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="平台名称"
                  />
                  <input
                    type="url"
                    value={link.url}
                    onChange={(event) =>
                      setLinks((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, url: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="https://…"
                  />
                  {links.length > 1 && (
                    <button
                      type="button"
                      title="删除链接"
                      aria-label="删除链接"
                      onClick={() =>
                        setLinks((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="secondary-action"
              type="button"
              onClick={() =>
                setLinks((current) => [...current, { marketplace: '', url: '' }])
              }
              disabled={links.length >= 20}
            >
              <Plus size={15} /> 添加平台链接
            </button>
          </section>
        </div>
        <aside className="wishlist-submit-panel">
          <span className="wishlist-panel-mark">
            <Sprout size={23} />
          </span>
          <p className="eyebrow">A patient list</p>
          <h2>{name || '未命名种草'}</h2>
          <p>
            {currentPrice ? `当前 ${currency} ${currentPrice}` : '还没有当前价格'}
            {plannedPurchaseDate ? ` · ${plannedPurchaseDate} 计划` : ''}
          </p>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-action" type="submit" disabled={create.isPending}>
            {create.isPending ? '保存中…' : '保存种草'}
          </button>
          <small>保存后可以上传封面、记录价格变化，或在合适时转为正式物品。</small>
        </aside>
      </form>
    </>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import type { CreateWishlistItemInput } from '@thingcost/contracts';

import { ApiClientError, api } from '../lib/api.js';
import {
  currencyLabel,
  supportedCurrencies,
  useBaseCurrency,
} from '../lib/application-settings.js';
import { localToday, majorToMinor } from '../lib/format.js';
import { markFresh } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from '../components/ui/button.js';
import {
  FormError,
  FormField,
  FormGrid,
  Panel,
  SelectInput,
  TextArea,
  TextInput,
} from '../components/ui/form.js';

interface LinkDraft {
  marketplace: string;
  url: string;
}

export function WishlistCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const baseCurrency = useBaseCurrency();
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
  });
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState(baseCurrency);
  const [currentPrice, setCurrentPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [budget, setBudget] = useState('');
  const [priority, setPriority] = useState<CreateWishlistItemInput['priority']>('medium');
  const [plannedPurchaseDate, setPlannedPurchaseDate] = useState('');
  const [links, setLinks] = useState<LinkDraft[]>([{ marketplace: '', url: '' }]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrency((current) => (current === 'CNY' ? baseCurrency : current));
  }, [baseCurrency]);

  const create = useMutation({
    mutationFn: api.createWishlist,
    onSuccess: async (item) => {
      markFresh(item.id);
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

  function submit(event: FormEvent<HTMLFormElement>) {
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
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header className="flex flex-col gap-2 border-b border-border pb-5">
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          to="/wishlist"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 返回种草清单
        </Link>
        <p data-slot="ledger-label">New want</p>
        <h1 className="text-2xl font-semibold text-heading">添加种草</h1>
        <p className="text-sm text-muted-foreground">
          记录想买的东西，也记录为什么现在还不买。
        </p>
      </header>

      <form className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]" onSubmit={submit}>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel eyebrow="The object" title="物品信息">
            <FormGrid>
              <FormField label="名称 *">
                <TextInput
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：机械键盘"
                />
              </FormField>
              <FormField label="分类 *">
                <SelectInput
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
                </SelectInput>
              </FormField>
            </FormGrid>
            <FormField label="备注">
              <TextArea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="为什么想要、等待什么条件"
              />
            </FormField>
          </Panel>

          <Panel eyebrow="Price intention" title="价格与计划">
            <FormGrid>
              <FormField label="价格币种">
                <SelectInput
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  {[baseCurrency, ...supportedCurrencies]
                    .filter((value, index, all) => all.indexOf(value) === index)
                    .map((value) => (
                      <option value={value} key={value}>
                        {currencyLabel(value)}
                      </option>
                    ))}
                </SelectInput>
              </FormField>
              <FormField label="当前价格（可选）">
                <TextInput
                  inputMode="decimal"
                  value={currentPrice}
                  onChange={(event) => setCurrentPrice(event.target.value)}
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="目标价格（可选）">
                <TextInput
                  inputMode="decimal"
                  value={targetPrice}
                  onChange={(event) => setTargetPrice(event.target.value)}
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="预算上限（可选）">
                <TextInput
                  inputMode="decimal"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="计划购买日期">
                <TextInput
                  type="date"
                  value={plannedPurchaseDate}
                  onChange={(event) => setPlannedPurchaseDate(event.target.value)}
                />
              </FormField>
              <FormField label="优先级">
                <SelectInput
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as CreateWishlistItemInput['priority'])
                  }
                >
                  <option value="high">优先 · 近期想解决</option>
                  <option value="medium">想要 · 等合适时机</option>
                  <option value="low">随缘 · 先记录</option>
                </SelectInput>
              </FormField>
            </FormGrid>
          </Panel>

          <Panel
            eyebrow="Sources"
            title="平台链接"
            description="只保存链接，不保存平台登录信息；价格由你手工记录。"
          >
            <div className="flex flex-col gap-2">
              {links.map((link, index) => (
                <div className="flex items-center gap-2" key={index}>
                  <span
                    data-slot="amount"
                    className="w-5 shrink-0 text-xs text-muted-foreground"
                  >
                    {index + 1}
                  </span>
                  <TextInput
                    className="basis-32"
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
                    aria-label={`平台 ${index + 1} 名称`}
                  />
                  <TextInput
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
                    aria-label={`平台 ${index + 1} 链接`}
                  />
                  {links.length > 1 ? (
                    <button
                      className="flex size-9 shrink-0 items-center justify-center border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                      type="button"
                      title="删除链接"
                      aria-label="删除链接"
                      onClick={() =>
                        setLinks((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="w-fit"
              type="button"
              onClick={() =>
                setLinks((current) => [...current, { marketplace: '', url: '' }])
              }
              disabled={links.length >= 20}
            >
              <Plus aria-hidden="true" /> 添加平台链接
            </Button>
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
          <Panel eyebrow="A patient list" title={name || '未命名种草'}>
            <p data-slot="amount" className="text-sm text-muted-foreground">
              {currentPrice ? `当前 ${currency} ${currentPrice}` : '还没有当前价格'}
              {plannedPurchaseDate ? ` · ${plannedPurchaseDate} 计划` : ''}
            </p>
          </Panel>
          <FormError>{error}</FormError>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? '保存中…' : '保存种草'}
          </Button>
          <small className="text-xs text-muted-foreground">
            保存后可以上传封面、记录价格变化，或在合适时转为正式物品。
          </small>
        </aside>
      </form>
    </div>
  );
}

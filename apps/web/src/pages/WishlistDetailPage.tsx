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
  Trash2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { CreateWishlistItemInput, WishlistItemDetail } from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { TagPicker } from '../components/TagPicker.js';
import { ApiClientError, api } from '../lib/api.js';
import { useBaseCurrency } from '../lib/application-settings.js';
import {
  formatMinorCurrency,
  localToday,
  majorToMinor,
  minorToMajor,
} from '../lib/format.js';
import { markFresh, useFreshMark } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Badge } from '../components/ui/badge.js';
import { Button, buttonVariants } from '../components/ui/button.js';
import {
  FormBlock,
  FormError,
  FormField,
  FormGrid,
  Panel,
  SelectInput,
  TextArea,
  TextInput,
} from '../components/ui/form.js';
import { PanelGhost } from '../components/ui/ledger-skeleton.js';

const priorityLabels = { low: '随缘', medium: '想要', high: '优先' } as const;
const priorityTone = { low: 'outline', medium: 'default', high: 'warning' } as const;
const statusLabels = {
  active: '进行中',
  converted: '已购入',
  archived: '已归档',
} as const;

const costChoice = cn(
  'flex flex-1 cursor-pointer items-center justify-center gap-2 border border-border',
  'px-3 py-2 text-sm text-muted-foreground transition duration-150',
  'hover:border-border-strong hover:text-foreground',
  'has-[:checked]:border-primary has-[:checked]:bg-primary',
  'has-[:checked]:text-primary-foreground',
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
  'has-[:focus-visible]:outline-offset-2',
);

export function WishlistDetailPage() {
  const { wishlistId } = useParams({ from: '/wishlist/$wishlistId' });
  const itemQuery = useQuery({
    queryKey: queryKeys.wishlist(wishlistId),
    queryFn: () => api.wishlist(wishlistId),
  });
  if (itemQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <PanelGhost lines={5} />
      </div>
    );
  }
  if (itemQuery.isError) {
    return <FormError>{itemQuery.error.message}</FormError>;
  }
  return <WishlistDetailContent key={itemQuery.data.updatedAt} item={itemQuery.data} />;
}

function Reading({
  label,
  value,
  note,
  isGood = false,
}: {
  label: string;
  value: string;
  note: string;
  isGood?: boolean;
}) {
  return (
    <div data-slot="card" className="space-y-1 p-4">
      <dt data-slot="ledger-label">{label}</dt>
      <dd
        data-slot="amount"
        className={cn(
          'text-xl leading-none font-medium',
          isGood ? 'text-success' : 'text-heading',
        )}
      >
        {value}
      </dd>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function WishlistDetailContent({ item }: { item: WishlistItemDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const baseCurrency = useBaseCurrency();
  const statusesQuery = useQuery({ queryKey: queryKeys.statuses, queryFn: api.statuses });
  const [editOpen, setEditOpen] = useState(false);
  const [description, setDescription] = useState(item.description ?? '');
  const [targetPrice, setTargetPrice] = useState(
    minorToMajor(item.targetPriceMinor, item.currency),
  );
  const [budget, setBudget] = useState(minorToMajor(item.budgetMinor, item.currency));
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
  const punch = async () => {
    markFresh(item.id);
    await refresh();
  };
  const update = useMutation({
    mutationFn: (input: Parameters<typeof api.updateWishlist>[1]) =>
      api.updateWishlist(item.id, input),
    onSuccess: punch,
    onError: setMutationError(setError),
  });
  const archive = useMutation({
    mutationFn: () => api.archiveWishlist(item.id),
    onSuccess: punch,
    onError: setMutationError(setError),
  });
  const addPrice = useMutation({
    mutationFn: (input: Parameters<typeof api.addWishlistPrice>[1]) =>
      api.addWishlistPrice(item.id, input),
    onSuccess: async () => {
      setPrice('');
      setPriceNote('');
      await punch();
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
      await punch();
    },
    onError: setMutationError(setError),
  });
  const deleteLink = useMutation({
    mutationFn: (linkId: string) => api.deleteWishlistLink(item.id, linkId),
    onSuccess: punch,
    onError: setMutationError(setError),
  });
  const uploadImage = useMutation({
    mutationFn: (file: File) => api.uploadWishlistImage(item.id, file),
    onSuccess: punch,
    onError: setMutationError(setError),
  });
  const deleteImage = useMutation({
    mutationFn: () => api.deleteWishlistImage(item.id),
    onSuccess: punch,
    onError: setMutationError(setError),
  });
  const quoteConversionRate = useMutation({
    mutationFn: () => api.exchangeRateQuote(item.currency, baseCurrency, localToday()),
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
      markFresh(result.assetId);
      await refresh();
      await navigate({ to: '/assets/$assetId', params: { assetId: result.assetId } });
    },
    onError: setMutationError(setError),
  });

  function saveEdit(event: FormEvent<HTMLFormElement>) {
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

  function savePrice(event: FormEvent<HTMLFormElement>) {
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

  function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linkMarketplace.trim() || !/^https?:\/\//u.test(linkUrl.trim())) {
      setError('请填写平台名称和 HTTP/HTTPS 链接。');
      return;
    }
    addLink.mutate({ marketplace: linkMarketplace.trim(), url: linkUrl.trim() });
  }

  function convertItem(event: FormEvent<HTMLFormElement>) {
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
      item.currency !== baseCurrency &&
      !conversionExchangeRate
    ) {
      setError('外币实付需要填写锁定汇率。');
      return;
    }
    convert.mutate({
      acquisitionDate: localToday(),
      costKnowledge,
      ...(amountMinor ? { paidPriceMinor: amountMinor } : {}),
      ...(item.currency !== baseCurrency
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
  const fresh = useFreshMark(item.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header
        className={cn(
          'flex flex-col gap-3 border-b border-border pb-5',
          fresh && 'fresh-ink',
        )}
      >
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          to="/wishlist"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 返回种草清单
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p data-slot="ledger-label">Wishlist trace</p>
            <h1 className="text-2xl font-semibold text-heading">{item.name}</h1>
            <p className="text-sm text-muted-foreground">
              {item.category.name} · {item.currency}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={item.status === 'active' ? 'success' : 'outline'}>
              {statusLabels[item.status]}
            </Badge>
            {isMutable ? (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                aria-expanded={editOpen}
                onClick={() => setEditOpen((open) => !open)}
              >
                编辑记录
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <FormError>{error}</FormError>

      <section className="flex flex-col gap-4 sm:flex-row">
        <div data-slot="card" className="relative shrink-0 overflow-hidden">
          {item.image ? (
            <img
              className="block h-44 w-full object-cover sm:w-56"
              src={item.image.contentUrl}
              alt={item.name}
            />
          ) : (
            <div className="flex h-44 w-full items-center justify-center bg-muted/40 sm:w-56">
              <Sprout aria-hidden="true" className="size-10 text-muted-foreground" />
            </div>
          )}
          {isMutable ? (
            <div className="flex flex-wrap gap-1.5 border-t border-border p-2">
              <label
                className={cn(
                  buttonVariants({ variant: 'secondary', size: 'sm' }),
                  'cursor-pointer [&>input]:sr-only',
                )}
              >
                <ImagePlus aria-hidden="true" />
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
              {item.image ? (
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => deleteImage.mutate()}
                >
                  <Trash2 aria-hidden="true" /> 删除
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <Badge variant={priorityTone[item.priority]}>
            {priorityLabels[item.priority]}
          </Badge>
          <h2 className="text-base font-semibold text-heading">
            {item.description || '还没有写下想买它的理由。'}
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              <span data-slot="amount">
                {item.plannedPurchaseDate
                  ? `计划 ${item.plannedPurchaseDate}`
                  : '未设计划日期'}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <Link2 aria-hidden="true" className="size-3.5" />
              <span data-slot="amount">{item.links.length} 个平台链接</span>
            </span>
          </div>
        </div>
      </section>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Reading
          label="当前价格"
          value={formatMinorCurrency(item.currentPriceMinor, item.currency)}
          note={item.currentPriceObservedOn ?? '尚无观测日期'}
        />
        <Reading
          label="目标价格"
          value={formatMinorCurrency(item.targetPriceMinor, item.currency)}
          note={targetReached ? '已达到目标' : '继续观察价格'}
          isGood={targetReached}
        />
        <Reading
          label="预算上限"
          value={formatMinorCurrency(item.budgetMinor, item.currency)}
          note={item.budgetMinor ? '购买决策参考' : '尚未设置预算'}
        />
      </dl>

      {editOpen && isMutable ? (
        <form data-slot="card" className="flex flex-col gap-4 p-5" onSubmit={saveEdit}>
          <div className="space-y-0.5">
            <p data-slot="ledger-label">Edit intention</p>
            <h2 className="text-base font-semibold text-heading">更新计划</h2>
          </div>
          <FormField label="备注">
            <TextArea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
          <FormGrid>
            <FormField label="目标价格">
              <TextInput
                inputMode="decimal"
                value={targetPrice}
                onChange={(event) => setTargetPrice(event.target.value)}
              />
            </FormField>
            <FormField label="预算上限">
              <TextInput
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              />
            </FormField>
            <FormField label="计划购买日期">
              <TextInput
                type="date"
                value={plannedDate}
                onChange={(event) => setPlannedDate(event.target.value)}
              />
            </FormField>
            <FormField label="优先级">
              <SelectInput
                value={priority}
                onChange={(event) => setPriority(event.target.value as typeof priority)}
              >
                <option value="high">优先</option>
                <option value="medium">想要</option>
                <option value="low">随缘</option>
              </SelectInput>
            </FormField>
          </FormGrid>
          <Button className="w-fit" type="submit" disabled={update.isPending}>
            {update.isPending ? '保存中…' : '保存更新'}
          </Button>
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          eyebrow="Price curve"
          title="手工价格曲线"
          description={isMutable ? '每次记录都会留下快照' : undefined}
        >
          {item.priceSnapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有价格快照。</p>
          ) : (
            <ol className="flex flex-col">
              {[...item.priceSnapshots].reverse().map((snapshot) => (
                <li
                  className="space-y-1 border-b border-dashed border-border py-2.5 last:border-0"
                  key={snapshot.id}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <time data-slot="amount" className="text-xs text-muted-foreground">
                      {snapshot.observedOn}
                    </time>
                    <strong data-slot="amount" className="text-sm font-medium">
                      {formatMinorCurrency(snapshot.amountMinor, snapshot.currency)}
                    </strong>
                  </div>
                  {/* 条长按最高价归一 —— 同一支墨的透明度，不引入新颜色 */}
                  <span className="block h-1.5 bg-muted" aria-hidden="true">
                    <span
                      className="block h-full bg-foreground/60"
                      style={{
                        width: `${Math.max(4, (Number(snapshot.amountMinor) / maxPrice) * 100)}%`,
                      }}
                    />
                  </span>
                  <small className="block text-xs text-muted-foreground">
                    {snapshot.marketplace ?? '手工记录'}
                    {snapshot.note ? ` · ${snapshot.note}` : ''}
                  </small>
                </li>
              ))}
            </ol>
          )}
          {isMutable ? (
            <form className="flex flex-col gap-2" onSubmit={savePrice}>
              <FormGrid>
                <FormField label="新增价格">
                  <TextInput
                    required
                    inputMode="decimal"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder="0.00"
                  />
                </FormField>
                <FormField label="观测日期">
                  <TextInput
                    required
                    type="date"
                    value={priceDate}
                    onChange={(event) => setPriceDate(event.target.value)}
                  />
                </FormField>
                <FormField label="来源">
                  <SelectInput
                    value={priceLinkId}
                    onChange={(event) => setPriceLinkId(event.target.value)}
                  >
                    <option value="">手工记录</option>
                    {item.links.map((link) => (
                      <option key={link.id} value={link.id}>
                        {link.marketplace}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
                <FormField label="备注（可选）">
                  <TextInput
                    value={priceNote}
                    onChange={(event) => setPriceNote(event.target.value)}
                  />
                </FormField>
              </FormGrid>
              <Button className="w-fit" type="submit" disabled={addPrice.isPending}>
                <Plus aria-hidden="true" /> 记录价格
              </Button>
            </form>
          ) : null}
        </Panel>

        <Panel
          eyebrow="Marketplace links"
          title="平台链接"
          action={
            isMutable ? (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                aria-expanded={linkOpen}
                onClick={() => setLinkOpen((open) => !open)}
              >
                <Plus aria-hidden="true" /> 添加
              </Button>
            ) : null
          }
        >
          <ul className="flex flex-col">
            {item.links.map((link) => (
              <li
                className="flex items-center gap-2 border-b border-dashed border-border py-2.5 last:border-0"
                key={link.id}
              >
                <ExternalLink
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <a
                  className="min-w-0 flex-1 hover:underline"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="block truncate text-sm font-medium text-link">
                    {link.marketplace}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {link.url}
                  </span>
                </a>
                {isMutable ? (
                  <button
                    className="flex size-7 shrink-0 items-center justify-center border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                    type="button"
                    title="删除链接"
                    aria-label="删除链接"
                    onClick={() => deleteLink.mutate(link.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {linkOpen ? (
            <form className="flex flex-col gap-2" onSubmit={saveLink}>
              <FormField label="平台名称">
                <TextInput
                  required
                  value={linkMarketplace}
                  onChange={(event) => setLinkMarketplace(event.target.value)}
                />
              </FormField>
              <FormField label="链接">
                <TextInput
                  required
                  type="url"
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="https://…"
                />
              </FormField>
              <Button className="w-fit" type="submit" disabled={addLink.isPending}>
                保存
              </Button>
            </form>
          ) : null}
        </Panel>
      </div>

      {item.status === 'converted' && item.convertedAsset ? (
        <section data-slot="card" className="flex flex-wrap items-center gap-3 p-4">
          <Sprout aria-hidden="true" className="size-[18px] shrink-0 text-success" />
          <span className="min-w-0 flex-1">
            <span data-slot="ledger-label" className="block">
              已保留价格历史
            </span>
            <strong className="block text-sm font-medium text-heading">
              这条种草已转为正式物品
            </strong>
          </span>
          <Button asChild variant="secondary" size="sm">
            <Link to="/assets/$assetId" params={{ assetId: item.convertedAsset.id }}>
              打开物品 →
            </Link>
          </Button>
        </section>
      ) : null}

      {isMutable ? (
        <Panel
          eyebrow="Make it real"
          title="转为正式物品"
          description="转入后会创建取得成本和生命周期起点；这条种草记录与全部价格快照仍会保留。"
        >
          <form className="flex flex-col gap-3" onSubmit={convertItem}>
            <fieldset className="flex flex-wrap gap-2 border-0 p-0">
              <legend className="sr-only">成本知识</legend>
              {(
                [
                  ['known_amount', '记录实际金额'],
                  ['known_zero', '确认是零成本'],
                  ['unknown', '暂时未知'],
                ] as const
              ).map(([value, label]) => (
                <label className={costChoice} key={value}>
                  <input
                    className="sr-only"
                    type="radio"
                    name="convertCostKnowledge"
                    checked={costKnowledge === value}
                    onChange={() => setCostKnowledge(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            <FormGrid>
              <FormField label="实际成本">
                <TextInput
                  inputMode="decimal"
                  value={paidPrice}
                  onChange={(event) => setPaidPrice(event.target.value)}
                  placeholder="按当前价格预填"
                />
              </FormField>
              {item.currency !== baseCurrency && costKnowledge === 'known_amount' ? (
                <>
                  <FormField label={`锁定汇率（1 ${item.currency} = ? ${baseCurrency}）`}>
                    <TextInput
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
                  </FormField>
                  <div className="flex items-end">
                    <Button
                      variant="secondary"
                      type="button"
                      disabled={quoteConversionRate.isPending}
                      onClick={() => quoteConversionRate.mutate()}
                    >
                      {quoteConversionRate.isPending ? '获取中…' : '使用历史参考汇率'}
                    </Button>
                  </div>
                </>
              ) : null}
              <FormField label="初始状态">
                <SelectInput
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
                </SelectInput>
              </FormField>
              <FormBlock label="标签" className="sm:col-span-2">
                <TagPicker selected={tagIds} onChange={setTagIds} />
              </FormBlock>
            </FormGrid>

            <Button className="w-fit" type="submit" disabled={convert.isPending}>
              {convert.isPending ? '转换中…' : '创建正式物品'}
            </Button>
          </form>
        </Panel>
      ) : null}

      {isMutable ? (
        <Button
          variant="secondary"
          className="w-fit"
          type="button"
          onClick={() => archive.mutate()}
          disabled={archive.isPending}
        >
          归档这条种草
        </Button>
      ) : null}
    </div>
  );
}

function setMutationError(setError: (message: string | null) => void) {
  return (error: unknown) =>
    setError(error instanceof ApiClientError ? error.message : '操作失败，请重试。');
}

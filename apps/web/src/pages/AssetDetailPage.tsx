import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BellRing,
  Edit3,
  History,
  Plus,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { lazy, Suspense, type FormEvent, type ReactNode, useMemo, useState } from 'react';

import type { AssetDetail, CreateFinancialEventInput } from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { AssetAttachmentsPanel } from '../components/AssetAttachmentsPanel.js';
import { AuditStamp } from '../components/AuditStamp.js';
import { SealMark } from '../components/SealMark.js';
import {
  AssetActivityForms,
  AssetActivityHistory,
} from '../components/AssetActivityPanels.js';
import { TagPicker } from '../components/TagPicker.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import { ConfirmDialog } from '../components/ui/confirm-dialog.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { FactRow, SelectInput } from '../components/ui/form.js';
import { ChartBoard, PanelGhost } from '../components/ui/ledger-skeleton.js';
import { SegmentedControl } from '../components/ui/segmented-control.js';
import { api } from '../lib/api.js';
import {
  currencySymbol,
  supportedCurrencies,
  useBaseCurrency,
} from '../lib/application-settings.js';
import { buildAssetCostTrend } from '../lib/asset-cost-trend.js';
import { markFresh, useFreshMark } from '../lib/fresh-marks.js';
import {
  acquisitionTypeLabel,
  chineseCapitalAmount,
  conditionGradeLabel,
  currencyFractionDigits,
  financialTypeLabel,
  formatMinorCurrency,
  ganZhiYear,
  localToday,
  majorToMinor,
  minorToMajor,
} from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

const AssetCostTrendChart = lazy(() =>
  import('../components/DashboardCharts.js').then((module) => ({
    default: module.AssetCostTrendChart,
  })),
);

const costPeriodOptions = [
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
  { value: 180, label: '180 天' },
] as const;

const fieldLabel = 'flex flex-col gap-1.5 text-xs text-muted-foreground';
const field = 'h-9 w-full px-2.5 text-sm text-foreground focus-visible:outline-none';
const textareaField =
  'w-full px-2.5 py-2 text-sm text-foreground focus-visible:outline-none';
/* 审计操作（更正/作废）永远可见，不藏在悬停里 */
const auditAction = cn(
  'text-xs text-muted-foreground underline-offset-4',
  'hover:text-destructive hover:underline',
);

/* 分区标题：把这一页切成 概览 / 时间线 / 资料 三段 */
function SectionHeading({
  eyebrow,
  title,
  id,
}: {
  eyebrow: string;
  title: string;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
      <div className="space-y-0.5">
        <p data-slot="ledger-label">{eyebrow}</p>
        <h2 className="text-lg font-semibold text-heading" {...(id ? { id } : {})}>
          {title}
        </h2>
      </div>
    </div>
  );
}

/* 一格读数 */
function Reading({
  label,
  value,
  unit,
  note,
  emphasis = false,
  isGain = false,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: ReactNode;
  emphasis?: boolean;
  isGain?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1.5 p-4">
        <dt data-slot="ledger-label">{label}</dt>
        <dd className="flex items-baseline gap-1">
          <span
            data-slot="amount"
            className={cn(
              'leading-none font-medium',
              emphasis ? 'text-[30px]' : 'text-xl',
              isGain ? 'text-success' : 'text-heading',
            )}
          >
            {value}
          </span>
          {unit ? (
            <span className="text-[11px] text-muted-foreground">{unit}</span>
          ) : null}
        </dd>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

/* 资料区的键值行由 ui/form.tsx 提供，这里不再重复一份 */

/* 跳转入口的内容壳。刻意不把 <Link> 包进来 ——
 * TanStack Router 靠 to/params/search 的字面量做类型推断，
 * 一旦抽成泛型 Record<string, string> 推断就断了。 */
const quickLinkClass = 'flex items-center gap-3 px-4 py-3 text-card-foreground';

function QuickLinkBody({
  icon,
  hint,
  title,
}: {
  icon: ReactNode;
  hint: string;
  title: string;
}) {
  return (
    <>
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span data-slot="ledger-label" className="block">
          {hint}
        </span>
        <span className="block truncate text-sm font-medium text-heading">{title}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-xs text-link">
        →
      </span>
    </>
  );
}

export function AssetDetailPage() {
  const { assetId } = useParams({ from: '/assets/$assetId' });
  const assetQuery = useQuery({
    queryKey: queryKeys.asset(assetId),
    queryFn: () => api.asset(assetId),
  });

  if (assetQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PanelGhost lines={5} />
      </div>
    );
  }

  if (assetQuery.isError) {
    return (
      <EmptyState
        title="无法打开这件物品"
        description={assetQuery.error.message}
        action={
          <Button asChild variant="secondary">
            <Link to="/assets">返回全部物品</Link>
          </Button>
        }
      />
    );
  }

  return <AssetDetailContent key={assetQuery.data.updatedAt} asset={assetQuery.data} />;
}

function AssetDetailContent({ asset }: { asset: AssetDetail }) {
  const queryClient = useQueryClient();
  const [confirmRecycle, setConfirmRecycle] = useState(false);
  const fresh = useFreshMark(asset.id);
  const navigate = useNavigate();
  const baseCurrency = useBaseCurrency();
  const statusesQuery = useQuery({ queryKey: queryKeys.statuses, queryFn: api.statuses });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
  });
  const [statusId, setStatusId] = useState('');
  const [statusDate, setStatusDate] = useState(localToday());
  const [statusNote, setStatusNote] = useState('');
  const [financialType, setFinancialType] =
    useState<CreateFinancialEventInput['type']>('repair');
  const [financialAmount, setFinancialAmount] = useState('');
  const [financialCurrency, setFinancialCurrency] = useState(baseCurrency);
  const [financialExchangeRate, setFinancialExchangeRate] = useState('1');
  const [financialExchangeRateSource, setFinancialExchangeRateSource] = useState<
    'manual' | 'frankfurter'
  >('manual');
  const [financialExchangeRateDate, setFinancialExchangeRateDate] =
    useState(localToday());
  const [financialExchangeRateFallback, setFinancialExchangeRateFallback] =
    useState(false);
  const [financialDate, setFinancialDate] = useState(localToday());
  const [financialNote, setFinancialNote] = useState('');
  const [includeInCost, setIncludeInCost] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  /* 档案头盖印计数：每次资料保存成功 +1，印章 key 变重放盖印 */
  const [saveStamp, setSaveStamp] = useState(0);
  const [editName, setEditName] = useState(asset.name);
  const [editBrand, setEditBrand] = useState(asset.brand ?? '');
  const [editModel, setEditModel] = useState(asset.model ?? '');
  const [editSerialNumber, setEditSerialNumber] = useState(asset.serialNumber ?? '');
  const [editPurchaseChannel, setEditPurchaseChannel] = useState(
    asset.purchaseChannel ?? '',
  );
  const [editOrderNumber, setEditOrderNumber] = useState(asset.orderNumber ?? '');
  const [editWarrantyStartDate, setEditWarrantyStartDate] = useState(
    asset.warrantyStartDate ?? '',
  );
  const [editWarrantyEndDate, setEditWarrantyEndDate] = useState(
    asset.warrantyEndDate ?? '',
  );
  const [editExtendedWarrantyEndDate, setEditExtendedWarrantyEndDate] = useState(
    asset.extendedWarrantyEndDate ?? '',
  );
  const [editExtendedWarrantyProvider, setEditExtendedWarrantyProvider] = useState(
    asset.extendedWarrantyProvider ?? '',
  );
  const [editDescription, setEditDescription] = useState(asset.description ?? '');
  const [editCategoryId, setEditCategoryId] = useState(asset.category.id);
  const [editTagIds, setEditTagIds] = useState(asset.tags.map((tag) => tag.id));
  const [costPeriodDays, setCostPeriodDays] = useState(90);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.asset(asset.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assetLists }),
    ]);
  };

  const transition = useMutation({
    mutationFn: api.transitionAsset.bind(null, asset.id),
    onSuccess: async () => {
      markFresh(asset.id);
      setStatusId('');
      setStatusNote('');
      await refresh();
    },
  });
  const quoteExchangeRate = useMutation({
    mutationFn: () =>
      api.exchangeRateQuote(financialCurrency, baseCurrency, financialDate),
    onSuccess: (quote) => {
      setFinancialExchangeRate(quote.rate);
      setFinancialExchangeRateSource('frankfurter');
      setFinancialExchangeRateDate(quote.effectiveDate);
      setFinancialExchangeRateFallback(quote.fallback);
    },
  });
  const addFinancial = useMutation({
    mutationFn: api.addFinancialEvent.bind(null, asset.id),
    onSuccess: async () => {
      markFresh(asset.id);
      setFinancialAmount('');
      setFinancialNote('');
      await refresh();
    },
  });
  const updateAsset = useMutation({
    mutationFn: api.updateAsset.bind(null, asset.id),
    onSuccess: async () => {
      markFresh(asset.id);
      setSaveStamp((count) => count + 1);
      setEditing(false);
      await refresh();
    },
  });
  const correctFinancialEvent = useMutation({
    mutationFn: ({
      eventId,
      input,
    }: {
      eventId: string;
      input: Parameters<typeof api.correctFinancialEvent>[2];
    }) => api.correctFinancialEvent(asset.id, eventId, input),
    onSuccess: async () => {
      markFresh(asset.id);
      await refresh();
    },
  });
  const correctLifecycleEvent = useMutation({
    mutationFn: ({
      eventId,
      input,
    }: {
      eventId: string;
      input: Parameters<typeof api.correctLifecycleEvent>[2];
    }) => api.correctLifecycleEvent(asset.id, eventId, input),
    onSuccess: async () => {
      markFresh(asset.id);
      await refresh();
    },
  });
  const deleteAsset = useMutation({
    mutationFn: () => api.deleteAsset(asset.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assetLists });
      await navigate({ to: '/assets' });
    },
  });

  const currentDisposed = asset.currentStatus.ownershipState === 'disposed';
  const availableStatuses = (statusesQuery.data ?? []).filter(
    (status) =>
      status.id !== asset.currentStatus.id &&
      !['lent', 'in_repair'].includes(status.code),
  );

  const submitStatus = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!statusId) {
      setFormError('请选择新状态');
      return;
    }

    transition.mutate({
      statusId,
      effectiveDate: statusDate,
      ...(statusNote.trim() ? { note: statusNote.trim() } : {}),
    });
  };

  const submitFinancial = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const amountMinor = majorToMinor(financialAmount, financialCurrency);

    if (!amountMinor || amountMinor === '0') {
      setFormError('请输入大于零的金额');
      return;
    }

    const direction =
      financialType === 'refund' || financialType === 'sale_proceeds'
        ? 'inflow'
        : 'outflow';

    if (financialCurrency !== baseCurrency && !financialExchangeRate) {
      setFormError('外币资金事件需要填写锁定汇率');
      return;
    }

    addFinancial.mutate({
      type: financialType,
      direction,
      amountMinor,
      currency: financialCurrency,
      occurredOn: financialDate,
      includeInNetCost: includeInCost,
      ...(financialCurrency !== baseCurrency
        ? {
            exchangeRate: financialExchangeRate,
            exchangeRateSource: financialExchangeRateSource,
            exchangeRateDate: financialExchangeRateDate,
            exchangeRateFallback: financialExchangeRateFallback,
          }
        : {}),
      ...(financialNote.trim() ? { note: financialNote.trim() } : {}),
    });
  };

  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateAsset.mutate({
      name: editName,
      categoryId: editCategoryId,
      brand: editBrand.trim() || null,
      model: editModel.trim() || null,
      serialNumber: editSerialNumber.trim() || null,
      purchaseChannel: editPurchaseChannel.trim() || null,
      orderNumber: editOrderNumber.trim() || null,
      warrantyStartDate: editWarrantyStartDate || null,
      warrantyEndDate: editWarrantyEndDate || null,
      extendedWarrantyEndDate: editExtendedWarrantyEndDate || null,
      extendedWarrantyProvider: editExtendedWarrantyProvider.trim() || null,
      description: editDescription.trim() || null,
      tagIds: editTagIds,
    });
  };

  const voidFinancialEvent = (eventId: string) => {
    const reason = window.prompt('请输入作废原因（会永久保留在审计记录中）');
    if (!reason?.trim()) return;
    correctFinancialEvent.mutate({ eventId, input: { reason: reason.trim() } });
  };

  const replaceFinancialAmount = (event: AssetDetail['financialEvents'][number]) => {
    const nextMajor = window.prompt(
      `输入更正后的金额（${event.currency}）`,
      minorToMajor(event.amountMinor, event.currency),
    );
    if (nextMajor === null) return;
    const amountMinor = majorToMinor(nextMajor, event.currency);
    if (!amountMinor || amountMinor === '0') {
      setFormError('更正金额必须大于零，且小数位数符合币种规则');
      return;
    }
    const reason = window.prompt('请输入更正原因（会永久保留在审计记录中）');
    if (!reason?.trim()) return;
    correctFinancialEvent.mutate({
      eventId: event.id,
      input: {
        reason: reason.trim(),
        replacement: {
          type: event.type,
          direction: event.direction,
          amountMinor,
          currency: event.currency,
          exchangeRate: event.exchangeRate,
          exchangeRateSource: event.exchangeRateSource,
          exchangeRateDate: event.exchangeRateDate,
          exchangeRateFallback: event.exchangeRateFallback,
          occurredOn: event.occurredOn,
          includeInNetCost: event.includeInNetCost,
          ...(event.note ? { note: event.note } : {}),
        },
      },
    });
  };

  const voidLifecycleEvent = (eventId: string) => {
    const reason = window.prompt('请输入状态事件作废原因');
    if (!reason?.trim()) return;
    correctLifecycleEvent.mutate({ eventId, input: { reason: reason.trim() } });
  };

  const replaceLifecycleDate = (event: AssetDetail['lifecycleEvents'][number]) => {
    const effectiveDate = window.prompt('输入更正后的状态日期', event.effectiveDate);
    if (!effectiveDate) return;
    const reason = window.prompt('请输入状态事件更正原因');
    if (!reason?.trim()) return;
    correctLifecycleEvent.mutate({
      eventId: event.id,
      input: {
        reason: reason.trim(),
        replacement: {
          statusId: event.status.id,
          effectiveDate,
          ...(event.note ? { note: event.note } : {}),
        },
      },
    });
  };

  const isNetGain =
    asset.metrics.netCostMinor !== null && Number(asset.metrics.netCostMinor) < 0;
  const costTrend = useMemo(
    () => buildAssetCostTrend(asset, localToday(), costPeriodDays),
    [asset, costPeriodDays],
  );
  /* 曲线上的事件刻度：作废的账不上账页（与图表口径一致） */
  const costTrendEvents = useMemo(
    () =>
      asset.financialEvents
        .filter((event) => event.voidedAt === null)
        .map((event) => ({
          baseAmountMinor: event.baseAmountMinor,
          baseCurrency: event.baseCurrency,
          direction: event.direction,
          occurredOn: event.occurredOn,
          type: event.type,
        })),
    [asset.financialEvents],
  );
  /* 合脚线：全期加权日均。净收益为负时没有这条线 ——
   * 负数日均的参照物不是摊薄水平 */
  const referenceDailyMajor =
    !isNetGain && asset.metrics.serviceDays > 0 && asset.metrics.netCostMinor !== null
      ? Number(asset.metrics.netCostMinor) /
        10 ** currencyFractionDigits(baseCurrency) /
        asset.metrics.serviceDays
      : null;
  const costKnown = asset.costKnowledge !== 'unknown';
  const latestLifecycleEventId = [...asset.lifecycleEvents]
    .reverse()
    .find((event) => !event.voidedAt)?.id;
  const hasPurchaseFacts = Boolean(
    asset.serialNumber ||
    asset.purchaseChannel ||
    asset.orderNumber ||
    asset.warrantyStartDate ||
    asset.warrantyEndDate ||
    asset.extendedWarrantyEndDate,
  );
  const warrantyDate = asset.extendedWarrantyEndDate ?? asset.warrantyEndDate;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {/* ── 档案头 ─────────────────────────────────────── */}
      <header
        className={cn(
          'flex flex-col gap-3 border-b border-border pb-5',
          fresh && 'fresh-ink',
        )}
      >
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          to="/assets"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 返回全部物品
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span data-slot="ledger-label">{asset.category.name}</span>
              <Badge variant={currentDisposed ? 'outline' : 'success'}>
                {asset.currentStatus.name}
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold text-heading">{asset.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[asset.brand, asset.model].filter(Boolean).join(' · ') ||
                `${acquisitionTypeLabel(asset.acquisitionType)}于 ${asset.acquisitionDate}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* 档案头的印：保存成功就落一次 —— 凭印为信在这里闭环 */}
            <SealMark key={saveStamp} stamped={saveStamp > 0} />
            <Button
              variant="secondary"
              type="button"
              onClick={() => setEditing(!editing)}
              aria-expanded={editing}
            >
              <Edit3 aria-hidden="true" /> {editing ? '收起编辑' : '编辑资料'}
            </Button>
          </div>
        </div>
      </header>

      {editing ? (
        <form data-slot="card" onSubmit={submitEdit}>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
            <label className={fieldLabel}>
              名称
              <input
                data-slot="field"
                className={field}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                required
              />
            </label>
            <label className={fieldLabel}>
              分类
              <SelectInput
                className={field}
                value={editCategoryId}
                onChange={(event) => setEditCategoryId(event.target.value)}
              >
                {(categoriesQuery.data ?? []).map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </SelectInput>
            </label>
            <label className={fieldLabel}>
              品牌
              <input
                data-slot="field"
                className={field}
                value={editBrand}
                onChange={(event) => setEditBrand(event.target.value)}
              />
            </label>
            <label className={fieldLabel}>
              型号
              <input
                data-slot="field"
                className={field}
                value={editModel}
                onChange={(event) => setEditModel(event.target.value)}
              />
            </label>
            <label className={fieldLabel}>
              序列号
              <input
                data-slot="field"
                className={field}
                autoComplete="off"
                value={editSerialNumber}
                onChange={(event) => setEditSerialNumber(event.target.value)}
              />
            </label>
            <label className={fieldLabel}>
              购买渠道
              <input
                data-slot="field"
                className={field}
                value={editPurchaseChannel}
                onChange={(event) => setEditPurchaseChannel(event.target.value)}
              />
            </label>
            <label className={fieldLabel}>
              订单号
              <input
                data-slot="field"
                className={field}
                autoComplete="off"
                value={editOrderNumber}
                onChange={(event) => setEditOrderNumber(event.target.value)}
              />
            </label>
            <label className={fieldLabel}>
              保修开始
              <input
                data-slot="field"
                className={field}
                type="date"
                value={editWarrantyStartDate}
                onChange={(event) => setEditWarrantyStartDate(event.target.value)}
              />
            </label>
            <label className={fieldLabel}>
              保修结束
              <input
                data-slot="field"
                className={field}
                type="date"
                min={editWarrantyStartDate || undefined}
                value={editWarrantyEndDate}
                onChange={(event) => setEditWarrantyEndDate(event.target.value)}
              />
            </label>
            <label className={fieldLabel}>
              延保结束
              <input
                data-slot="field"
                className={field}
                type="date"
                min={editWarrantyEndDate || undefined}
                value={editExtendedWarrantyEndDate}
                onChange={(event) => setEditExtendedWarrantyEndDate(event.target.value)}
              />
            </label>
            <label className={fieldLabel}>
              延保服务方
              <input
                data-slot="field"
                className={field}
                value={editExtendedWarrantyProvider}
                onChange={(event) => setEditExtendedWarrantyProvider(event.target.value)}
              />
            </label>
            <div className={cn(fieldLabel, 'sm:col-span-2')}>
              <span>标签</span>
              <TagPicker selected={editTagIds} onChange={setEditTagIds} />
            </div>
            <label className={cn(fieldLabel, 'sm:col-span-2')}>
              简介
              <textarea
                data-slot="field"
                className={textareaField}
                rows={3}
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="secondary" type="button" onClick={() => setEditing(false)}>
                取消
              </Button>
              <Button disabled={updateAsset.isPending}>保存修改</Button>
            </div>
          </CardContent>
        </form>
      ) : null}

      {/* ── 概览 ───────────────────────────────────────── */}
      <section className="flex flex-col gap-4" aria-labelledby="overview-title">
        <SectionHeading eyebrow="Overview" title="概览" id="overview-title" />

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Reading
            label={isNetGain ? '生命周期日均净收益' : '生命周期日均成本'}
            value={
              asset.metrics.netDailyCostMinor === null
                ? '—'
                : formatMinorCurrency(asset.metrics.netDailyCostMinor, baseCurrency, 2)
            }
            {...(asset.metrics.netDailyCostMinor === null ? {} : { unit: '/ 天' })}
            note={
              asset.currentCondition
                ? conditionGradeLabel(asset.currentCondition.grade)
                : '成色未记录'
            }
            emphasis
            isGain={isNetGain}
          />
          <Reading
            label="生命周期净成本"
            value={formatMinorCurrency(asset.metrics.netCostMinor, baseCurrency)}
            isGain={isNetGain}
            note={
              /* 大写防改 —— 当票面额的传统写法，三位小数货币没有大写传统时留空 */
              asset.metrics.netCostMinor === null
                ? undefined
                : (chineseCapitalAmount(asset.metrics.netCostMinor, baseCurrency) ??
                  undefined)
            }
          />
          <Reading
            label="持有天数"
            value={String(asset.metrics.holdingDays)}
            unit="天"
            /* 入册干支：当票开头"兹于某年月日当入"的年注 */
            note={`取得于 ${asset.acquisitionDate} · ${ganZhiYear(Number(asset.acquisitionDate.slice(0, 4)))}`}
          />
          <Reading
            label="服役天数"
            value={String(asset.metrics.serviceDays)}
            unit="天"
            note="退役与闲置期间不累加"
          />
        </dl>

        <Card aria-labelledby="asset-cost-curve-title">
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-0.5">
                <p data-slot="ledger-label">Cost curve</p>
                <h3 className="text-base font-semibold" id="asset-cost-curve-title">
                  成本曲线
                </h3>
              </div>
              <SegmentedControl
                label="成本曲线时间范围"
                value={costPeriodDays}
                options={costPeriodOptions}
                onChange={setCostPeriodDays}
              />
            </div>
            {!costKnown ? (
              <p data-slot="pending" className="py-10 text-center text-sm">
                成本未记录，无法绘制日均成本曲线
              </p>
            ) : costTrend.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                取得日之后才会出现成本曲线
              </p>
            ) : (
              <Suspense fallback={<ChartBoard />}>
                <AssetCostTrendChart
                  currency={baseCurrency}
                  events={costTrendEvents}
                  referenceDailyMajor={referenceDailyMajor}
                  trend={costTrend}
                />
              </Suspense>
            )}
            <p className="text-xs text-muted-foreground">
              日均成本按截至当日的生命周期净成本 ÷
              累计服役天数计算；退役后停止累加服役天数，处置后结束持有。
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          {/* ── 时间线 ─────────────────────────────────── */}
          <section className="flex flex-col gap-4">
            <SectionHeading eyebrow="Ledger" title="时间线" />

            {correctLifecycleEvent.error || correctFinancialEvent.error ? (
              <p
                data-slot="annotation"
                className="border border-destructive/30 bg-destructive-subtle px-4 py-3 text-sm"
                role="alert"
              >
                {(correctLifecycleEvent.error ?? correctFinancialEvent.error)?.message}
              </p>
            ) : null}

            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <History
                      aria-hidden="true"
                      className="size-[18px] text-muted-foreground"
                    />
                    状态时间线
                  </h3>
                  <span data-slot="amount" className="text-xs text-muted-foreground">
                    {asset.lifecycleEvents.length} 条
                  </span>
                </div>
                {asset.lifecycleEvents.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    暂无状态记录
                  </p>
                ) : (
                  <ol className="flex flex-col">
                    {[...asset.lifecycleEvents].reverse().map((event) => (
                      <li
                        className={cn(
                          'flex gap-3 border-b border-dashed border-border py-3 last:border-0',
                          event.voidedAt && 'opacity-60',
                        )}
                        key={event.id}
                      >
                        {/* 4px 竖track，当前状态那一条转成主色 */}
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mt-1 w-1 shrink-0 self-stretch',
                            event.id === latestLifecycleEventId
                              ? 'bg-primary'
                              : 'bg-border',
                          )}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <strong className="text-sm font-medium text-heading">
                              {event.status.name}
                              {event.id === latestLifecycleEventId ? (
                                <span className="ml-2 text-xs font-normal text-link">
                                  当前状态
                                </span>
                              ) : null}
                              {event.correctionOfId ? (
                                <AuditStamp className="ml-2" label="更正" />
                              ) : null}
                              {event.voidedAt ? (
                                <AuditStamp className="ml-2" label="作废" />
                              ) : null}
                            </strong>
                            <time
                              data-slot="amount"
                              className="text-xs text-muted-foreground"
                              dateTime={event.effectiveDate}
                            >
                              {event.effectiveDate}
                            </time>
                          </div>
                          {event.note ? (
                            <p className="text-xs text-muted-foreground">{event.note}</p>
                          ) : null}
                          {event.voidedAt ? (
                            <p data-slot="annotation" className="text-xs">
                              已作废：{event.voidReason}
                            </p>
                          ) : (
                            <div className="flex gap-3 pt-0.5">
                              <button
                                className={auditAction}
                                type="button"
                                onClick={() => replaceLifecycleDate(event)}
                              >
                                更正日期
                              </button>
                              <button
                                className={auditAction}
                                type="button"
                                onClick={() => voidLifecycleEvent(event.id)}
                              >
                                作废
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <WalletCards
                      aria-hidden="true"
                      className="size-[18px] text-muted-foreground"
                    />
                    资金时间线
                  </h3>
                  <span data-slot="amount" className="text-xs text-muted-foreground">
                    {asset.financialEvents.length} 条
                  </span>
                </div>
                {asset.financialEvents.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    暂无资金事件
                  </p>
                ) : (
                  <ol className="flex flex-col">
                    {asset.financialEvents.map((event) => (
                      <li
                        className={cn(
                          'flex items-start gap-3 border-b border-dashed border-border py-3 last:border-0',
                          event.voidedAt && 'opacity-60',
                        )}
                        key={event.id}
                      >
                        <span
                          className={cn(
                            'mt-0.5 shrink-0',
                            event.direction === 'inflow'
                              ? 'text-success'
                              : 'text-muted-foreground',
                          )}
                          aria-label={
                            event.direction === 'inflow' ? '资金流入' : '资金流出'
                          }
                        >
                          {event.direction === 'inflow' ? (
                            <ArrowDownLeft aria-hidden="true" className="size-4" />
                          ) : (
                            <ArrowUpRight aria-hidden="true" className="size-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <strong className="text-sm font-medium text-heading">
                              {financialTypeLabel(event.type)}
                              {event.correctionOfId ? (
                                <AuditStamp className="ml-2" label="更正" />
                              ) : null}
                              {event.voidedAt ? (
                                <AuditStamp className="ml-2" label="作废" />
                              ) : null}
                            </strong>
                            <time
                              data-slot="amount"
                              className="text-xs text-muted-foreground"
                              dateTime={event.occurredOn}
                            >
                              {event.occurredOn}
                            </time>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>
                              {event.includeInNetCost ? '计入净成本' : '不计入净成本'}
                            </span>
                            {event.currency !== event.baseCurrency ? (
                              <span data-slot="amount">
                                {event.currency} → {event.baseCurrency}
                              </span>
                            ) : null}
                          </div>
                          {event.note ? (
                            <p className="text-xs text-muted-foreground">{event.note}</p>
                          ) : null}
                          {event.voidedAt ? (
                            <p data-slot="annotation" className="text-xs">
                              已作废：{event.voidReason}
                            </p>
                          ) : (
                            <div className="flex gap-3 pt-0.5">
                              <button
                                className={auditAction}
                                type="button"
                                onClick={() => replaceFinancialAmount(event)}
                              >
                                更正金额
                              </button>
                              <button
                                className={auditAction}
                                type="button"
                                onClick={() => voidFinancialEvent(event.id)}
                              >
                                作废
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <b
                            data-slot="amount"
                            className={cn(
                              'block text-sm font-medium',
                              event.direction === 'inflow'
                                ? 'text-success'
                                : 'text-heading',
                            )}
                          >
                            {event.direction === 'inflow' ? '−' : '+'}
                            {formatMinorCurrency(
                              event.baseAmountMinor,
                              event.baseCurrency,
                            )}
                          </b>
                          {event.currency !== event.baseCurrency ? (
                            <small
                              data-slot="amount"
                              className="block text-xs text-muted-foreground"
                            >
                              {formatMinorCurrency(event.amountMinor, event.currency)}
                            </small>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </section>

          {/* ── 资料 ───────────────────────────────────── */}
          <section className="flex flex-col gap-4">
            <SectionHeading eyebrow="Dossier" title="资料与附件" />

            {hasPurchaseFacts ? (
              <Card>
                <CardContent className="space-y-2 p-5">
                  <p data-slot="ledger-label">购买与保修</p>
                  <dl className="flex flex-col">
                    {asset.serialNumber ? (
                      <FactRow label="序列号" value={asset.serialNumber} />
                    ) : null}
                    {asset.purchaseChannel ? (
                      <FactRow label="购买渠道" value={asset.purchaseChannel} />
                    ) : null}
                    {asset.orderNumber ? (
                      <FactRow label="订单号" value={asset.orderNumber} />
                    ) : null}
                    {asset.warrantyStartDate ? (
                      <FactRow label="保修开始" value={asset.warrantyStartDate} />
                    ) : null}
                    {asset.warrantyEndDate ? (
                      <FactRow label="原保修结束" value={asset.warrantyEndDate} />
                    ) : null}
                    {asset.extendedWarrantyEndDate ? (
                      <FactRow
                        label="延保结束"
                        value={
                          asset.extendedWarrantyEndDate +
                          (asset.extendedWarrantyProvider
                            ? ` · ${asset.extendedWarrantyProvider}`
                            : '')
                        }
                      />
                    ) : null}
                  </dl>
                </CardContent>
              </Card>
            ) : null}

            {asset.purchaseOrder ? (
              <Link
                data-slot="card"
                data-interactive="true"
                className={quickLinkClass}
                to="/orders/$orderId"
                params={{ orderId: asset.purchaseOrder.id }}
              >
                <QuickLinkBody
                  icon={<ReceiptText aria-hidden="true" className="size-[18px]" />}
                  hint="创建自购买订单"
                  title={`${asset.purchaseOrder.merchant || '未填写商家'} · ${
                    asset.purchaseOrder.orderNumber || asset.purchaseOrder.orderedOn
                  }`}
                />
              </Link>
            ) : null}

            {warrantyDate ? (
              <Link
                data-slot="card"
                data-interactive="true"
                className={quickLinkClass}
                to="/reminders/new"
                search={{
                  assetId: asset.id,
                  kind: 'warranty_expiry',
                  title: `${asset.name} 保修到期`,
                  date: warrantyDate,
                }}
              >
                <QuickLinkBody
                  icon={<ShieldCheck aria-hidden="true" className="size-[18px]" />}
                  hint="保修时间信号"
                  title="为保修到期创建提醒"
                />
              </Link>
            ) : null}

            <Link
              data-slot="card"
              data-interactive="true"
              className={quickLinkClass}
              to="/reminders/new"
              search={{ assetId: asset.id }}
            >
              <QuickLinkBody
                icon={<BellRing aria-hidden="true" className="size-[18px]" />}
                hint="时间信号"
                title="为这件物品添加提醒"
              />
            </Link>

            <div className="space-y-2">
              <p data-slot="ledger-label">成色、借出与维修</p>
              <AssetActivityHistory asset={asset} />
            </div>

            <AssetAttachmentsPanel asset={asset} onUpdated={refresh} />
          </section>
        </div>

        {/* ── 操作台 ───────────────────────────────────── */}
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <SectionHeading eyebrow="Actions" title="记一笔" />

          <AssetActivityForms asset={asset} onUpdated={refresh} />

          {!currentDisposed && !asset.hasOpenLoan && !asset.hasOpenRepair ? (
            <form data-slot="card" onSubmit={submitStatus}>
              <CardContent className="space-y-3 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <RotateCcw
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  切换状态
                </h3>
                <label className={fieldLabel}>
                  新状态
                  <SelectInput
                    className={field}
                    value={statusId}
                    onChange={(event) => setStatusId(event.target.value)}
                    required
                  >
                    <option value="">请选择</option>
                    {availableStatuses.map((status) => (
                      <option value={status.id} key={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </SelectInput>
                </label>
                <label className={fieldLabel}>
                  生效日期
                  <input
                    data-slot="field"
                    className={field}
                    type="date"
                    min={asset.acquisitionDate}
                    max={localToday()}
                    value={statusDate}
                    onChange={(event) => setStatusDate(event.target.value)}
                  />
                </label>
                <label className={fieldLabel}>
                  备注
                  <textarea
                    data-slot="field"
                    className={textareaField}
                    rows={2}
                    value={statusNote}
                    onChange={(event) => setStatusNote(event.target.value)}
                  />
                </label>
                <Button className="w-full" disabled={transition.isPending}>
                  更新状态
                </Button>
              </CardContent>
            </form>
          ) : null}

          <form data-slot="card" onSubmit={submitFinancial}>
            <CardContent className="space-y-3 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Plus aria-hidden="true" className="size-4 text-muted-foreground" />
                记录资金事件
              </h3>
              <label className={fieldLabel}>
                类型
                <SelectInput
                  className={field}
                  value={financialType}
                  onChange={(event) =>
                    setFinancialType(
                      event.target.value as CreateFinancialEventInput['type'],
                    )
                  }
                >
                  <option value="repair">维修</option>
                  <option value="upgrade">升级</option>
                  <option value="accessory">配件</option>
                  <option value="shipping">运费</option>
                  <option value="tax">税费</option>
                  <option value="fee">手续费</option>
                  <option value="disposal_fee">处置费用</option>
                  <option value="refund">退款</option>
                  <option value="sale_proceeds">卖出回款</option>
                  <option value="other">其他支出</option>
                </SelectInput>
              </label>
              <label className={fieldLabel}>
                币种
                <SelectInput
                  className={field}
                  value={financialCurrency}
                  onChange={(event) => {
                    setFinancialCurrency(event.target.value);
                    setFinancialExchangeRate(
                      event.target.value === baseCurrency ? '1' : '',
                    );
                    setFinancialExchangeRateSource('manual');
                    setFinancialExchangeRateFallback(false);
                  }}
                >
                  {[baseCurrency, ...supportedCurrencies]
                    .filter(
                      (currency, index, currencies) =>
                        currencies.indexOf(currency) === index,
                    )
                    .map((currency) => (
                      <option value={currency} key={currency}>
                        {currency}
                      </option>
                    ))}
                </SelectInput>
              </label>
              <label className={fieldLabel}>
                金额（{financialCurrency}）
                <span data-slot="field" className="flex h-9 items-center gap-1 px-2.5">
                  <span
                    data-slot="amount"
                    className="shrink-0 text-sm text-muted-foreground"
                  >
                    {currencySymbol(financialCurrency)}
                  </span>
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground focus-visible:outline-none"
                    inputMode="decimal"
                    placeholder={financialCurrency === 'JPY' ? '0' : '0.00'}
                    value={financialAmount}
                    onChange={(event) => setFinancialAmount(event.target.value)}
                    required
                  />
                </span>
              </label>
              {financialCurrency !== baseCurrency ? (
                <>
                  <label className={fieldLabel}>
                    锁定汇率（1 {financialCurrency} = ? {baseCurrency}）
                    <input
                      data-slot="field"
                      className={field}
                      inputMode="decimal"
                      placeholder="例如 7.20"
                      value={financialExchangeRate}
                      onChange={(event) => {
                        setFinancialExchangeRate(event.target.value);
                        setFinancialExchangeRateSource('manual');
                        setFinancialExchangeRateFallback(false);
                      }}
                      required
                    />
                  </label>
                  <div className="space-y-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      disabled={quoteExchangeRate.isPending}
                      onClick={() => quoteExchangeRate.mutate()}
                    >
                      {quoteExchangeRate.isPending ? '获取中…' : '填入历史参考汇率'}
                    </Button>
                    {quoteExchangeRate.data ? (
                      <p data-slot="amount" className="text-xs text-muted-foreground">
                        {quoteExchangeRate.data.effectiveDate}
                        {quoteExchangeRate.data.fallback ? '（使用此前可用日期）' : ''}
                      </p>
                    ) : null}
                  </div>
                  <label className={fieldLabel}>
                    汇率参考日期
                    <input
                      data-slot="field"
                      className={field}
                      type="date"
                      max={financialDate}
                      value={financialExchangeRateDate}
                      onChange={(event) =>
                        setFinancialExchangeRateDate(event.target.value)
                      }
                    />
                  </label>
                </>
              ) : null}
              <label className={fieldLabel}>
                发生日期
                <input
                  data-slot="field"
                  className={field}
                  type="date"
                  min={asset.acquisitionDate}
                  max={localToday()}
                  value={financialDate}
                  onChange={(event) => setFinancialDate(event.target.value)}
                />
              </label>
              <label className={fieldLabel}>
                备注
                <textarea
                  data-slot="field"
                  className={textareaField}
                  rows={2}
                  value={financialNote}
                  onChange={(event) => setFinancialNote(event.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  className="size-4"
                  type="checkbox"
                  checked={includeInCost}
                  onChange={(event) => setIncludeInCost(event.target.checked)}
                />
                计入生命周期净成本
              </label>
              <Button className="w-full" disabled={addFinancial.isPending}>
                记录资金
              </Button>
            </CardContent>
          </form>

          {formError || transition.error || addFinancial.error || updateAsset.error ? (
            <p
              data-slot="annotation"
              className="border border-destructive/30 bg-destructive-subtle px-4 py-3 text-sm"
              role="alert"
            >
              {formError ??
                transition.error?.message ??
                addFinancial.error?.message ??
                updateAsset.error?.message}
            </p>
          ) : null}

          {/* 破坏性操作永远显式，不藏在菜单里 */}
          <Button
            variant="destructive"
            type="button"
            disabled={deleteAsset.isPending}
            onClick={() => setConfirmRecycle(true)}
          >
            <Trash2 aria-hidden="true" /> 移入回收站
          </Button>
          <ConfirmDialog
            open={confirmRecycle}
            title={`将“${asset.name}”移入回收站？`}
            description="物品保留 30 天，期间可随时恢复；到期后自动清除。"
            confirmLabel="移入回收站"
            pendingLabel="正在移入…"
            pending={deleteAsset.isPending}
            onCancel={() => setConfirmRecycle(false)}
            onConfirm={() =>
              deleteAsset.mutate(undefined, {
                onSettled: () => setConfirmRecycle(false),
              })
            }
          />
        </aside>
      </div>
    </div>
  );
}

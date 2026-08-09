import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  Clock3,
  Edit3,
  History,
  Plus,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { lazy, Suspense, type FormEvent, useMemo, useState } from 'react';

import type { AssetDetail, CreateFinancialEventInput } from '@thingcost/contracts';

import { AssetAttachmentsPanel } from '../components/AssetAttachmentsPanel.js';
import {
  AssetActivityForms,
  AssetActivityHistory,
} from '../components/AssetActivityPanels.js';
import { TagPicker } from '../components/TagPicker.js';
import { api } from '../lib/api.js';
import { buildAssetCostTrend } from '../lib/asset-cost-trend.js';
import {
  acquisitionTypeLabel,
  conditionGradeLabel,
  financialTypeLabel,
  formatDailyMinorCurrency,
  formatMinorCurrency,
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

export function AssetDetailPage() {
  const { assetId } = useParams({ from: '/assets/$assetId' });
  const assetQuery = useQuery({
    queryKey: queryKeys.asset(assetId),
    queryFn: () => api.asset(assetId),
  });

  if (assetQuery.isPending) {
    return <div className="page-loading">正在展开物品时间线…</div>;
  }

  if (assetQuery.isError) {
    return (
      <div className="empty-state">
        <h2>无法打开这件物品</h2>
        <p>{assetQuery.error.message}</p>
        <Link className="secondary-action" to="/assets">
          返回全部物品
        </Link>
      </div>
    );
  }

  return <AssetDetailContent key={assetQuery.data.updatedAt} asset={assetQuery.data} />;
}

function AssetDetailContent({ asset }: { asset: AssetDetail }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
  const [financialCurrency, setFinancialCurrency] = useState('CNY');
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
      setStatusId('');
      setStatusNote('');
      await refresh();
    },
  });
  const baseCurrency = asset.financialEvents[0]?.baseCurrency ?? 'CNY';
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
      setFinancialAmount('');
      setFinancialNote('');
      await refresh();
    },
  });
  const updateAsset = useMutation({
    mutationFn: api.updateAsset.bind(null, asset.id),
    onSuccess: async () => {
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
    onSuccess: refresh,
  });
  const correctLifecycleEvent = useMutation({
    mutationFn: ({
      eventId,
      input,
    }: {
      eventId: string;
      input: Parameters<typeof api.correctLifecycleEvent>[2];
    }) => api.correctLifecycleEvent(asset.id, eventId, input),
    onSuccess: refresh,
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
  const costKnown = asset.costKnowledge !== 'unknown';
  const latestLifecycleEventId = [...asset.lifecycleEvents]
    .reverse()
    .find((event) => !event.voidedAt)?.id;

  return (
    <>
      <header className="detail-header">
        <Link className="back-link" to="/assets">
          <ArrowLeft size={17} /> 返回全部物品
        </Link>
        <div className="detail-title-row">
          <div>
            <div className="detail-kicker">
              <span>{asset.category.name}</span>
              <span className="status-badge">{asset.currentStatus.name}</span>
            </div>
            <h1>{asset.name}</h1>
            <p className="muted-copy">
              {[asset.brand, asset.model].filter(Boolean).join(' · ') ||
                `${acquisitionTypeLabel(asset.acquisitionType)}于 ${asset.acquisitionDate}`}
            </p>
          </div>
          <button
            className="secondary-action"
            type="button"
            onClick={() => setEditing(!editing)}
          >
            <Edit3 size={16} /> {editing ? '收起编辑' : '编辑资料'}
          </button>
        </div>
      </header>

      {editing && (
        <form className="form-card inline-editor" onSubmit={submitEdit}>
          <div className="form-grid">
            <label>
              名称
              <input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                required
              />
            </label>
            <label>
              分类
              <select
                value={editCategoryId}
                onChange={(event) => setEditCategoryId(event.target.value)}
              >
                {(categoriesQuery.data ?? []).map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              品牌
              <input
                value={editBrand}
                onChange={(event) => setEditBrand(event.target.value)}
              />
            </label>
            <label>
              型号
              <input
                value={editModel}
                onChange={(event) => setEditModel(event.target.value)}
              />
            </label>
            <label>
              序列号
              <input
                autoComplete="off"
                value={editSerialNumber}
                onChange={(event) => setEditSerialNumber(event.target.value)}
              />
            </label>
            <label>
              购买渠道
              <input
                value={editPurchaseChannel}
                onChange={(event) => setEditPurchaseChannel(event.target.value)}
              />
            </label>
            <label>
              订单号
              <input
                autoComplete="off"
                value={editOrderNumber}
                onChange={(event) => setEditOrderNumber(event.target.value)}
              />
            </label>
            <label>
              保修开始
              <input
                type="date"
                value={editWarrantyStartDate}
                onChange={(event) => setEditWarrantyStartDate(event.target.value)}
              />
            </label>
            <label>
              保修结束
              <input
                type="date"
                min={editWarrantyStartDate || undefined}
                value={editWarrantyEndDate}
                onChange={(event) => setEditWarrantyEndDate(event.target.value)}
              />
            </label>
            <label>
              延保结束
              <input
                type="date"
                min={editWarrantyEndDate || undefined}
                value={editExtendedWarrantyEndDate}
                onChange={(event) => setEditExtendedWarrantyEndDate(event.target.value)}
              />
            </label>
            <label>
              延保服务方
              <input
                value={editExtendedWarrantyProvider}
                onChange={(event) => setEditExtendedWarrantyProvider(event.target.value)}
              />
            </label>
            <div className="form-span-2 form-field-group">
              <span>标签</span>
              <TagPicker selected={editTagIds} onChange={setEditTagIds} />
            </div>
            <label className="form-span-2">
              简介
              <textarea
                rows={3}
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
            </label>
          </div>
          <div className="editor-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={() => setEditing(false)}
            >
              取消
            </button>
            <button className="primary-action" disabled={updateAsset.isPending}>
              保存修改
            </button>
          </div>
        </form>
      )}

      {asset.purchaseOrder && (
        <Link
          className="asset-order-provenance"
          to="/orders/$orderId"
          params={{ orderId: asset.purchaseOrder.id }}
        >
          <ReceiptText size={18} />
          <span>
            <small>创建自购买订单</small>
            <strong>
              {asset.purchaseOrder.merchant || '未填写商家'} ·{' '}
              {asset.purchaseOrder.orderNumber || asset.purchaseOrder.orderedOn}
            </strong>
          </span>
          <span>查看分摊明细 →</span>
        </Link>
      )}

      {(asset.serialNumber ||
        asset.purchaseChannel ||
        asset.orderNumber ||
        asset.warrantyStartDate ||
        asset.warrantyEndDate ||
        asset.extendedWarrantyEndDate) && (
        <section className="asset-metadata-card">
          <div>
            <p className="eyebrow">PURCHASE & WARRANTY</p>
            <h2>购买与保修资料</h2>
          </div>
          <dl>
            {asset.serialNumber && (
              <div>
                <dt>序列号</dt>
                <dd>{asset.serialNumber}</dd>
              </div>
            )}
            {asset.purchaseChannel && (
              <div>
                <dt>购买渠道</dt>
                <dd>{asset.purchaseChannel}</dd>
              </div>
            )}
            {asset.orderNumber && (
              <div>
                <dt>订单号</dt>
                <dd>{asset.orderNumber}</dd>
              </div>
            )}
            {asset.warrantyStartDate && (
              <div>
                <dt>保修开始</dt>
                <dd>{asset.warrantyStartDate}</dd>
              </div>
            )}
            {asset.warrantyEndDate && (
              <div>
                <dt>原保修结束</dt>
                <dd>{asset.warrantyEndDate}</dd>
              </div>
            )}
            {asset.extendedWarrantyEndDate && (
              <div>
                <dt>延保结束</dt>
                <dd>
                  {asset.extendedWarrantyEndDate}
                  {asset.extendedWarrantyProvider
                    ? ` · ${asset.extendedWarrantyProvider}`
                    : ''}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {(asset.extendedWarrantyEndDate || asset.warrantyEndDate) && (
        <Link
          className="asset-reminder-quicklink warranty-reminder-link"
          to="/reminders/new"
          search={{
            assetId: asset.id,
            kind: 'warranty_expiry',
            title: `${asset.name} 保修到期`,
            date: asset.extendedWarrantyEndDate ?? asset.warrantyEndDate ?? undefined,
          }}
        >
          <ShieldCheck size={18} />
          <span>
            <small>保修时间信号</small>
            <strong>为保修到期创建提醒</strong>
          </span>
          <span>新建 →</span>
        </Link>
      )}

      <Link
        className="asset-reminder-quicklink"
        to="/reminders/new"
        search={{ assetId: asset.id }}
      >
        <BellRing size={18} />
        <span>
          <small>时间信号</small>
          <strong>为这件物品添加提醒</strong>
        </span>
        <span>新建 →</span>
      </Link>

      <AssetAttachmentsPanel asset={asset} onUpdated={refresh} />

      <section className="detail-metrics">
        <article className="detail-metric-primary">
          <p>{isNetGain ? '生命周期日均净收益' : '生命周期净日均成本'}</p>
          <strong>{formatDailyMinorCurrency(asset.metrics.netDailyCostMinor)}</strong>
          <small>
            净成本 {formatMinorCurrency(asset.metrics.netCostMinor)}
            {asset.currentCondition
              ? ` · ${conditionGradeLabel(asset.currentCondition.grade)}`
              : ' · 成色未记录'}
          </small>
        </article>
        <article>
          <WalletCards size={18} />
          <p>生命周期净成本</p>
          <strong>{formatMinorCurrency(asset.metrics.netCostMinor)}</strong>
        </article>
        <article>
          <CalendarDays size={18} />
          <p>持有天数</p>
          <strong>{asset.metrics.holdingDays} 天</strong>
        </article>
        <article>
          <Clock3 size={18} />
          <p>服役天数</p>
          <strong>{asset.metrics.serviceDays} 天</strong>
        </article>
      </section>

      <section
        className="chart-card asset-cost-chart-card"
        aria-labelledby="asset-cost-curve-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Cost curve</p>
            <h2 id="asset-cost-curve-title">物品成本曲线</h2>
          </div>
          <div className="period-switch" aria-label="成本曲线时间范围">
            {[30, 90, 180].map((days) => (
              <button
                className={costPeriodDays === days ? 'active' : ''}
                key={days}
                type="button"
                onClick={() => setCostPeriodDays(days)}
              >
                {days} 天
              </button>
            ))}
          </div>
        </div>
        {!costKnown ? (
          <div className="chart-empty">成本未知，无法绘制日均成本曲线</div>
        ) : costTrend.length === 0 ? (
          <div className="chart-empty">取得日之后才会出现成本曲线</div>
        ) : (
          <Suspense
            fallback={<div className="chart-shell page-loading">正在绘制成本曲线…</div>}
          >
            <AssetCostTrendChart trend={costTrend} />
          </Suspense>
        )}
        <p className="muted-copy asset-cost-chart-note">
          日均成本按截至当日的生命周期净成本 ÷
          累计服役天数计算；退役后停止累加服役天数，处置后结束持有。
        </p>
      </section>

      <div className="detail-columns">
        <section className="section-block detail-main-column">
          {(correctLifecycleEvent.error || correctFinancialEvent.error) && (
            <p className="form-error">
              {(correctLifecycleEvent.error ?? correctFinancialEvent.error)?.message}
            </p>
          )}

          <div className="timeline-panels">
            <section className="timeline-panel timeline-panel-lifecycle">
              <header className="timeline-panel-header">
                <div className="timeline-panel-title">
                  <span className="timeline-panel-icon timeline-panel-icon-status">
                    <History size={19} aria-hidden="true" />
                  </span>
                  <h2>状态时间线</h2>
                </div>
                <div className="timeline-panel-meta">
                  <span className="timeline-current-badge">
                    当前 · {asset.currentStatus.name}
                  </span>
                  <span className="timeline-count">
                    {asset.lifecycleEvents.length} 条
                  </span>
                </div>
              </header>
              <div className="timeline-list">
                {asset.lifecycleEvents.length === 0 ? (
                  <div className="timeline-empty">暂无状态记录</div>
                ) : (
                  [...asset.lifecycleEvents].reverse().map((event) => (
                    <article
                      className={[
                        'timeline-event',
                        event.id === latestLifecycleEventId
                          ? 'timeline-event-current'
                          : '',
                        event.voidedAt ? 'audit-event-voided' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      key={event.id}
                    >
                      <span className="timeline-node" />
                      <div className="timeline-event-body">
                        <div className="timeline-event-topline">
                          <strong>{event.status.name}</strong>
                          <time>{event.effectiveDate}</time>
                        </div>
                        {event.id === latestLifecycleEventId && (
                          <span className="timeline-event-badge">当前状态</span>
                        )}
                        {event.note && (
                          <p className="timeline-event-note">{event.note}</p>
                        )}
                        {event.voidedAt && (
                          <p className="audit-note">已作废：{event.voidReason}</p>
                        )}
                        {!event.voidedAt && (
                          <div className="event-audit-actions">
                            <button
                              type="button"
                              onClick={() => replaceLifecycleDate(event)}
                            >
                              更正日期
                            </button>
                            <button
                              type="button"
                              onClick={() => voidLifecycleEvent(event.id)}
                            >
                              作废
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="timeline-panel timeline-panel-financial">
              <header className="timeline-panel-header">
                <div className="timeline-panel-title">
                  <span className="timeline-panel-icon timeline-panel-icon-financial">
                    <WalletCards size={19} aria-hidden="true" />
                  </span>
                  <h2>资金时间线</h2>
                </div>
                <span className="timeline-count">{asset.financialEvents.length} 条</span>
              </header>
              <div className="financial-list">
                {asset.financialEvents.length === 0 ? (
                  <div className="timeline-empty">暂无资金事件</div>
                ) : (
                  asset.financialEvents.map((event) => (
                    <article
                      className={`financial-event ${event.voidedAt ? 'audit-event-voided' : ''}`}
                      key={event.id}
                    >
                      <span
                        className={`cash-flow-badge ${
                          event.direction === 'inflow' ? 'cash-in' : 'cash-out'
                        }`}
                        aria-label={
                          event.direction === 'inflow' ? '资金流入' : '资金流出'
                        }
                      >
                        {event.direction === 'inflow' ? (
                          <ArrowDownLeft size={17} aria-hidden="true" />
                        ) : (
                          <ArrowUpRight size={17} aria-hidden="true" />
                        )}
                      </span>
                      <div className="financial-event-body">
                        <div className="financial-event-topline">
                          <strong>{financialTypeLabel(event.type)}</strong>
                          <time>{event.occurredOn}</time>
                        </div>
                        <div className="financial-event-meta">
                          <span
                            className={`financial-cost-tag ${
                              event.includeInNetCost
                                ? 'financial-cost-tag-included'
                                : 'financial-cost-tag-excluded'
                            }`}
                          >
                            {event.includeInNetCost ? '计入净成本' : '不计入净成本'}
                          </span>
                          {event.currency !== event.baseCurrency && (
                            <span>
                              {event.currency} → {event.baseCurrency}
                            </span>
                          )}
                        </div>
                        {event.note && (
                          <p className="financial-event-note">{event.note}</p>
                        )}
                        {event.voidedAt && (
                          <p className="audit-note">已作废：{event.voidReason}</p>
                        )}
                        {!event.voidedAt && (
                          <div className="event-audit-actions">
                            <button
                              type="button"
                              onClick={() => replaceFinancialAmount(event)}
                            >
                              更正金额
                            </button>
                            <button
                              type="button"
                              onClick={() => voidFinancialEvent(event.id)}
                            >
                              作废
                            </button>
                          </div>
                        )}
                      </div>
                      <div
                        className={`financial-event-amount ${
                          event.direction === 'inflow'
                            ? 'financial-amount-in'
                            : 'financial-amount-out'
                        }`}
                      >
                        <b>
                          {event.direction === 'inflow' ? '−' : '+'}
                          {formatMinorCurrency(event.baseAmountMinor, event.baseCurrency)}
                        </b>
                        {event.currency !== event.baseCurrency && (
                          <small>
                            {formatMinorCurrency(event.amountMinor, event.currency)}
                          </small>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="section-heading nested-heading">
            <div>
              <p className="eyebrow">Care history</p>
              <h2>成色、借出与维修</h2>
            </div>
          </div>
          <AssetActivityHistory asset={asset} />
        </section>

        <aside className="detail-side-column">
          <AssetActivityForms asset={asset} onUpdated={refresh} />

          {!currentDisposed && !asset.hasOpenLoan && !asset.hasOpenRepair && (
            <form className="form-card compact-form" onSubmit={submitStatus}>
              <div className="compact-form-title">
                <RotateCcw size={18} />
                <h3>切换状态</h3>
              </div>
              <label>
                新状态
                <select
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
                </select>
              </label>
              <label>
                生效日期
                <input
                  type="date"
                  min={asset.acquisitionDate}
                  max={localToday()}
                  value={statusDate}
                  onChange={(event) => setStatusDate(event.target.value)}
                />
              </label>
              <label>
                备注
                <textarea
                  rows={2}
                  value={statusNote}
                  onChange={(event) => setStatusNote(event.target.value)}
                />
              </label>
              <button
                className="primary-action primary-action-wide"
                disabled={transition.isPending}
              >
                更新状态
              </button>
            </form>
          )}

          <form className="form-card compact-form" onSubmit={submitFinancial}>
            <div className="compact-form-title">
              <Plus size={18} />
              <h3>记录资金事件</h3>
            </div>
            <label>
              类型
              <select
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
              </select>
            </label>
            <label>
              币种
              <select
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
                {[baseCurrency, 'USD', 'EUR', 'JPY', 'HKD']
                  .filter(
                    (currency, index, currencies) =>
                      currencies.indexOf(currency) === index,
                  )
                  .map((currency) => (
                    <option value={currency} key={currency}>
                      {currency}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              金额（{financialCurrency}）
              <div className="money-input">
                <span>{financialCurrency === 'CNY' ? '¥' : financialCurrency}</span>
                <input
                  inputMode="decimal"
                  placeholder={financialCurrency === 'JPY' ? '0' : '0.00'}
                  value={financialAmount}
                  onChange={(event) => setFinancialAmount(event.target.value)}
                  required
                />
              </div>
            </label>
            {financialCurrency !== baseCurrency && (
              <>
                <label>
                  锁定汇率（1 {financialCurrency} = ? {baseCurrency}）
                  <input
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
                <div className="form-inline-actions">
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={quoteExchangeRate.isPending}
                    onClick={() => quoteExchangeRate.mutate()}
                  >
                    {quoteExchangeRate.isPending ? '获取中…' : '填入历史参考汇率'}
                  </button>
                  {quoteExchangeRate.data && (
                    <small className="muted-copy">
                      {quoteExchangeRate.data.effectiveDate}
                      {quoteExchangeRate.data.fallback ? '（使用此前可用日期）' : ''}
                    </small>
                  )}
                </div>
                <label>
                  汇率参考日期
                  <input
                    type="date"
                    max={financialDate}
                    value={financialExchangeRateDate}
                    onChange={(event) => setFinancialExchangeRateDate(event.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              发生日期
              <input
                type="date"
                min={asset.acquisitionDate}
                max={localToday()}
                value={financialDate}
                onChange={(event) => setFinancialDate(event.target.value)}
              />
            </label>
            <label>
              备注
              <textarea
                rows={2}
                value={financialNote}
                onChange={(event) => setFinancialNote(event.target.value)}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={includeInCost}
                onChange={(event) => setIncludeInCost(event.target.checked)}
              />
              计入生命周期净成本
            </label>
            <button
              className="primary-action primary-action-wide"
              disabled={addFinancial.isPending}
            >
              记录资金
            </button>
          </form>

          {(formError || transition.error || addFinancial.error || updateAsset.error) && (
            <p className="form-error" role="alert">
              {formError ??
                transition.error?.message ??
                addFinancial.error?.message ??
                updateAsset.error?.message}
            </p>
          )}

          <button
            className="danger-action"
            type="button"
            disabled={deleteAsset.isPending}
            onClick={() => {
              if (window.confirm(`将“${asset.name}”移入回收站？`)) {
                deleteAsset.mutate();
              }
            }}
          >
            <Trash2 size={16} /> 移入回收站
          </button>
        </aside>
      </div>
    </>
  );
}

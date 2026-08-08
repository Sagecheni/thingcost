import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import type {
  CreateSubscriptionPriceChangeInput,
  SubscriptionActionInput,
} from '@thingcost/contracts';

import { api } from '../lib/api.js';
import { formatMinorCurrency, localToday, majorToMinor } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

function formString(form: FormData, key: string, fallback = ''): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : fallback;
}

export function SubscriptionDetailPage() {
  const { subscriptionId } = useParams({ from: '/subscriptions/$subscriptionId' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: queryKeys.subscription(subscriptionId),
    queryFn: () => api.subscription(subscriptionId),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription(subscriptionId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions }),
    ]);
  };

  const priceMutation = useMutation({
    mutationFn: (input: CreateSubscriptionPriceChangeInput) =>
      api.changeSubscriptionPrice(subscriptionId, input),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });
  const actionMutation = useMutation({
    mutationFn: (input: SubscriptionActionInput) =>
      api.applySubscriptionAction(subscriptionId, input),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });
  const attachmentMutation = useMutation({
    mutationFn: (file: File) => api.uploadSubscriptionAttachment(subscriptionId, file),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });
  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      api.deleteSubscriptionAttachment(subscriptionId, attachmentId),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });
  const chargeMutation = useMutation({
    mutationFn: (input: {
      kind: 'planned' | 'actual';
      status?: 'planned' | 'succeeded' | 'failed' | 'refunded' | 'waived';
      amountMinor: string;
      occurredOn: string;
      note?: string;
    }) => api.addSubscriptionCharge(subscriptionId, input),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSubscription(subscriptionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions });
      await navigate({ to: '/subscriptions' });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (detailQuery.isPending) {
    return <section className="content-card">加载中…</section>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <section className="content-card form-error">
        {detailQuery.error?.message ?? '未找到'}
      </section>
    );
  }

  const item = detailQuery.data;
  const runAction = (action: SubscriptionActionInput['action']) => {
    const label =
      action === 'cancel'
        ? '取消订阅'
        : action === 'renew'
          ? '续费恢复'
          : action === 'pause'
            ? '暂停订阅'
            : action === 'resume'
              ? '恢复订阅'
              : '结束试用并转为正式';
    if (!window.confirm(`确认${label}？`)) return;
    actionMutation.mutate({
      action,
      effectiveOn: localToday(),
      ...(action === 'renew' ? { nextBillingOn: item.nextBillingOn ?? undefined } : {}),
    });
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            {item.kind === 'digital_license' ? 'Digital license' : 'Subscription'}
          </p>
          <h1>{item.name}</h1>
          <p className="muted-copy">
            {item.vendor || '未填厂商'} · {item.status} ·{' '}
            {formatMinorCurrency(item.amountMinor, item.currency)} / {item.billingCycle}
            {item.discountMinor !== '0' && (
              <> · 优惠 {formatMinorCurrency(item.discountMinor, item.currency)}</>
            )}
          </p>
        </div>
        <div className="header-actions">
          <Link
            className="secondary-action"
            to="/reminders/new"
            search={{
              subscriptionId,
              kind: 'renewal',
              title: `${item.name}续期提醒`,
              date: item.nextBillingOn ?? localToday(),
            }}
          >
            创建续期提醒
          </Link>
          <Link className="secondary-action" to="/subscriptions">
            返回列表
          </Link>
          {item.status === 'trial' && (
            <button
              className="secondary-action"
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => runAction('convert_trial')}
            >
              转为正式
            </button>
          )}
          {(item.status === 'active' || item.status === 'trial') && (
            <button
              className="secondary-action"
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => runAction('pause')}
            >
              暂停
            </button>
          )}
          {item.status === 'paused' && (
            <button
              className="secondary-action"
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => runAction('resume')}
            >
              恢复
            </button>
          )}
          {(item.status === 'active' ||
            item.status === 'trial' ||
            item.status === 'paused') && (
            <button
              className="secondary-action"
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => runAction('cancel')}
            >
              取消
            </button>
          )}
          {(item.status === 'cancelled' || item.status === 'expired') && (
            <button
              className="secondary-action"
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => runAction('renew')}
            >
              续费恢复
            </button>
          )}
          <button
            className="secondary-action"
            type="button"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm('确认归档删除该订阅？')) deleteMutation.mutate();
            }}
          >
            删除
          </button>
        </div>
      </header>

      <section className="detail-metrics">
        <article className="detail-metric detail-metric-primary">
          <p>预计月支出</p>
          <strong>
            {formatMinorCurrency(item.metrics.projectedMonthlyMinor, item.currency)}
          </strong>
        </article>
        <article className="detail-metric">
          <p>预计年支出</p>
          <strong>
            {formatMinorCurrency(item.metrics.projectedYearlyMinor, item.currency)}
          </strong>
        </article>
        <article className="detail-metric">
          <p>实际已支出</p>
          <strong>
            {formatMinorCurrency(item.metrics.actualSpendMinor, item.currency)}
          </strong>
        </article>
        <article className="detail-metric">
          <p>计划中扣款</p>
          <strong>
            {formatMinorCurrency(item.metrics.plannedSpendMinor, item.currency)}
          </strong>
        </article>
        <article className="detail-metric">
          <p>失败扣款</p>
          <strong>{item.metrics.failedChargeCount}</strong>
        </article>
      </section>

      <section className="content-card">
        <h2>资料</h2>
        <dl className="detail-dl">
          <div>
            <dt>下次扣款</dt>
            <dd>{item.nextBillingOn || '—'}</dd>
          </div>
          <div>
            <dt>试用结束</dt>
            <dd>{item.trialEndsOn || '—'}</dd>
          </div>
          <div>
            <dt>优惠结束</dt>
            <dd>{item.discountEndsOn || '—'}</dd>
          </div>
          <div>
            <dt>自动续费</dt>
            <dd>{item.autoRenew ? '已开启' : '已关闭'}</dd>
          </div>
          <div>
            <dt>到期</dt>
            <dd>{item.expiresOn || '—'}</dd>
          </div>
          <div>
            <dt>席位</dt>
            <dd>{item.seats ?? '—'}</dd>
          </div>
          <div>
            <dt>账号标识</dt>
            <dd>{item.accountHint || '—'}</dd>
          </div>
          <div>
            <dt>密码管理器</dt>
            <dd>
              {item.passwordManagerUrl ? (
                <a href={item.passwordManagerUrl} target="_blank" rel="noreferrer">
                  打开引用
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
        {item.notes && <p className="muted-copy">{item.notes}</p>}
        {item.tags.length > 0 && (
          <div className="tag-row">
            {item.tags.map((tag) => (
              <span className="tag-chip" key={tag.id}>
                #{tag.name}
              </span>
            ))}
          </div>
        )}
        <p className="muted-copy">本系统不保存账号密码或 License Key。</p>
      </section>

      <section className="content-card form-stack">
        <h2>订阅资料</h2>
        <label className="file-upload-label">
          上传发票、合同或许可凭证
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) attachmentMutation.mutate(file);
              event.currentTarget.value = '';
            }}
          />
        </label>
        {item.attachments.length > 0 ? (
          <ul className="data-conflict-list">
            {item.attachments.map((attachment) => (
              <li key={attachment.id}>
                <div>
                  <a href={attachment.contentUrl} target="_blank" rel="noreferrer">
                    {attachment.originalName}
                  </a>
                  <p className="muted-copy">
                    {Math.ceil(attachment.sizeBytes / 1024)} KB
                  </p>
                </div>
                <button
                  className="text-action danger-action"
                  type="button"
                  onClick={() => {
                    if (window.confirm('确认删除该资料？')) {
                      deleteAttachmentMutation.mutate(attachment.id);
                    }
                  }}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">还没有上传资料。</p>
        )}
      </section>

      <section className="content-card form-stack">
        <h2>价格与优惠</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const amountMinor = majorToMinor(
              formString(form, 'priceAmount'),
              item.currency,
            );
            const discountMinor = majorToMinor(
              formString(form, 'priceDiscount', '0'),
              item.currency,
            );
            if (!amountMinor || !discountMinor) {
              setError('金额格式不正确');
              return;
            }
            priceMutation.mutate({
              kind: formString(form, 'priceKind') as 'discount' | 'price_change',
              amountMinor,
              discountMinor,
              discountEndsOn: formString(form, 'priceDiscountEnds') || null,
              effectiveOn: formString(form, 'priceEffectiveOn'),
              note: formString(form, 'priceNote').trim() || undefined,
            });
            event.currentTarget.reset();
          }}
        >
          <label>
            变更类型
            <select name="priceKind" defaultValue="price_change">
              <option value="price_change">价格变更</option>
              <option value="discount">优惠期</option>
            </select>
          </label>
          <label>
            标价（{item.currency}）
            <input
              name="priceAmount"
              required
              inputMode="decimal"
              defaultValue={Number(item.amountMinor) / 100}
            />
          </label>
          <label>
            优惠金额
            <input
              name="priceDiscount"
              inputMode="decimal"
              defaultValue={Number(item.discountMinor) / 100}
            />
          </label>
          <label>
            优惠结束
            <input
              name="priceDiscountEnds"
              type="date"
              defaultValue={item.discountEndsOn ?? ''}
            />
          </label>
          <label>
            生效日
            <input
              name="priceEffectiveOn"
              type="date"
              required
              defaultValue={localToday()}
            />
          </label>
          <label>
            备注
            <input
              name="priceNote"
              maxLength={500}
              placeholder="例如续费涨价或首年优惠"
            />
          </label>
          <button
            className="primary-action"
            type="submit"
            disabled={priceMutation.isPending}
          >
            {priceMutation.isPending ? '保存中…' : '保存价格变更'}
          </button>
        </form>
        {item.priceChanges.length > 0 && (
          <ul className="data-conflict-list">
            {item.priceChanges.map((change) => (
              <li key={change.id}>
                <div>
                  <strong>
                    {change.effectiveOn} · {change.kind} ·{' '}
                    {formatMinorCurrency(change.amountMinor, item.currency)}
                  </strong>
                  {change.discountMinor !== '0' && (
                    <p className="muted-copy">
                      优惠 {formatMinorCurrency(change.discountMinor, item.currency)}
                    </p>
                  )}
                  {change.note && <p className="muted-copy">{change.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="content-card form-stack">
        <h2>登记扣款</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const kind = formString(form, 'kind') as 'planned' | 'actual';
            const statusRaw = formString(form, 'status');
            const note = formString(form, 'note').trim();
            chargeMutation.mutate({
              kind,
              status:
                kind === 'planned'
                  ? 'planned'
                  : statusRaw
                    ? (statusRaw as 'succeeded' | 'failed' | 'refunded' | 'waived')
                    : 'succeeded',
              amountMinor:
                majorToMinor(formString(form, 'amount', '0'), item.currency) ?? '0',
              occurredOn: formString(form, 'occurredOn'),
              ...(note ? { note } : {}),
            });
            event.currentTarget.reset();
          }}
        >
          <label>
            类型
            <select name="kind" defaultValue="actual">
              <option value="actual">实际扣款</option>
              <option value="planned">计划扣款</option>
            </select>
          </label>
          <label>
            实际结果
            <select name="status" defaultValue="succeeded">
              <option value="succeeded">成功</option>
              <option value="failed">失败</option>
              <option value="refunded">退款</option>
              <option value="waived">豁免</option>
            </select>
          </label>
          <label>
            金额（元）
            <input
              name="amount"
              required
              inputMode="decimal"
              defaultValue={(Number(item.amountMinor) / 100).toFixed(2)}
            />
          </label>
          <label>
            日期
            <input
              name="occurredOn"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label>
            备注
            <input name="note" maxLength={500} />
          </label>
          <button
            className="primary-action"
            type="submit"
            disabled={chargeMutation.isPending}
          >
            {chargeMutation.isPending ? '保存中…' : '添加扣款记录'}
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
      </section>

      <section className="content-card">
        <h2>扣款历史</h2>
        {item.charges.length === 0 ? (
          <p className="muted-copy">还没有扣款记录。</p>
        ) : (
          <ul className="data-conflict-list">
            {item.charges.map((charge) => (
              <li key={charge.id}>
                <div>
                  <strong>
                    {charge.occurredOn} · {charge.kind}/{charge.status} ·{' '}
                    {formatMinorCurrency(charge.amountMinor, charge.currency)}
                  </strong>
                  {charge.note && <p className="muted-copy">{charge.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

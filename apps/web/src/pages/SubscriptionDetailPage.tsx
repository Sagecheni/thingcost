import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import type {
  CreateSubscriptionPriceChangeInput,
  SubscriptionActionInput,
  SubscriptionDetail,
  UpdateSubscriptionInput,
} from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { TagPicker } from '../components/TagPicker.js';
import { api } from '../lib/api.js';
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
  CheckboxField,
  FactRow,
  FormActions,
  FormBlock,
  FormError,
  FormField,
  FormGrid,
  Panel,
  SelectInput,
  TextArea,
  TextInput,
} from '../components/ui/form.js';
import { ConfirmDialog } from '../components/ui/confirm-dialog.js';
import { PanelGhost } from '../components/ui/ledger-skeleton.js';

function formString(form: FormData, key: string, fallback = ''): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : fallback;
}

function Reading({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div data-slot="card" className="space-y-1 p-4">
      <dt data-slot="ledger-label">{label}</dt>
      <dd
        data-slot="amount"
        className={cn(
          'leading-none font-medium text-heading',
          emphasis ? 'text-[26px]' : 'text-xl',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function SubscriptionEditForm({
  item,
  pending,
  onSave,
}: {
  item: SubscriptionDetail;
  pending: boolean;
  onSave: (input: UpdateSubscriptionInput) => void;
}) {
  const [tagIds, setTagIds] = useState(item.tags.map((tag) => tag.id));

  return (
    <Panel
      eyebrow="Edit details"
      title={item.kind === 'digital_license' ? '编辑许可资料' : '编辑订阅资料'}
      description="金额和优惠请在价格记录中变更；这里维护名称、日期与账号备注。"
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const seatsRaw = formString(form, 'editSeats').trim();
          onSave({
            name: formString(form, 'editName').trim(),
            vendor: formString(form, 'editVendor').trim() || null,
            categoryLabel: formString(form, 'editCategoryLabel').trim() || null,
            startedOn: formString(form, 'editStartedOn') || null,
            trialEndsOn:
              item.kind === 'subscription'
                ? formString(form, 'editTrialEndsOn') || null
                : null,
            nextBillingOn:
              item.kind === 'subscription'
                ? formString(form, 'editNextBillingOn') || null
                : null,
            expiresOn: formString(form, 'editExpiresOn') || null,
            seats: seatsRaw ? Number(seatsRaw) : null,
            autoRenew: item.kind === 'subscription' && form.get('editAutoRenew') !== null,
            accountHint: formString(form, 'editAccountHint').trim() || null,
            passwordManagerUrl: formString(form, 'editPasswordManagerUrl').trim() || null,
            notes: formString(form, 'editNotes').trim() || null,
            tagIds,
          });
        }}
      >
        <FormGrid>
          <FormField label="名称">
            <TextInput
              name="editName"
              required
              maxLength={160}
              defaultValue={item.name}
            />
          </FormField>
          <FormField label="厂商">
            <TextInput
              name="editVendor"
              maxLength={120}
              defaultValue={item.vendor ?? ''}
            />
          </FormField>
          <FormField label="分类标签">
            <TextInput
              name="editCategoryLabel"
              maxLength={80}
              defaultValue={item.categoryLabel ?? ''}
            />
          </FormField>
          <FormField label="席位 / 授权数">
            <TextInput
              name="editSeats"
              type="number"
              min={1}
              max={100000}
              defaultValue={item.seats ?? ''}
            />
          </FormField>
          <FormField label="开始日">
            <TextInput
              name="editStartedOn"
              type="date"
              defaultValue={item.startedOn ?? ''}
            />
          </FormField>
          {item.kind === 'subscription' ? (
            <>
              <FormField label="试用结束">
                <TextInput
                  name="editTrialEndsOn"
                  type="date"
                  defaultValue={item.trialEndsOn ?? ''}
                />
              </FormField>
              <FormField label="下次扣款">
                <TextInput
                  name="editNextBillingOn"
                  type="date"
                  defaultValue={item.nextBillingOn ?? ''}
                />
              </FormField>
            </>
          ) : null}
          <FormField label="到期日">
            <TextInput
              name="editExpiresOn"
              type="date"
              defaultValue={item.expiresOn ?? ''}
            />
          </FormField>
          <FormField label="账号标识（非密码）">
            <TextInput
              name="editAccountHint"
              maxLength={160}
              defaultValue={item.accountHint ?? ''}
            />
          </FormField>
          <FormField label="密码管理器链接">
            <TextInput
              name="editPasswordManagerUrl"
              type="url"
              defaultValue={item.passwordManagerUrl ?? ''}
              placeholder="https://…"
            />
          </FormField>
          <FormField label="备注" className="sm:col-span-2">
            <TextArea
              name="editNotes"
              rows={3}
              maxLength={4000}
              defaultValue={item.notes ?? ''}
            />
          </FormField>
          <FormBlock label="标签" className="sm:col-span-2">
            <TagPicker selected={tagIds} onChange={setTagIds} />
          </FormBlock>
        </FormGrid>
        {item.kind === 'subscription' ? (
          <CheckboxField
            name="editAutoRenew"
            defaultChecked={item.autoRenew}
            label="自动续费"
          />
        ) : null}
        <FormActions>
          <Button type="submit" disabled={pending}>
            {pending ? '保存中…' : '保存资料'}
          </Button>
        </FormActions>
      </form>
    </Panel>
  );
}

export function SubscriptionDetailPage() {
  const { subscriptionId } = useParams({ from: '/subscriptions/$subscriptionId' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fresh = useFreshMark(subscriptionId);
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

  const punch = async () => {
    markFresh(subscriptionId);
    await refresh();
  };

  const updateMutation = useMutation({
    mutationFn: (input: UpdateSubscriptionInput) =>
      api.updateSubscription(subscriptionId, input),
    onSuccess: async () => {
      setError(null);
      await punch();
    },
    onError: (err: Error) => setError(err.message),
  });
  const priceMutation = useMutation({
    mutationFn: (input: CreateSubscriptionPriceChangeInput) =>
      api.changeSubscriptionPrice(subscriptionId, input),
    onSuccess: async () => {
      setError(null);
      await punch();
    },
    onError: (err: Error) => setError(err.message),
  });
  const actionMutation = useMutation({
    mutationFn: (input: SubscriptionActionInput) =>
      api.applySubscriptionAction(subscriptionId, input),
    onSuccess: async () => {
      setError(null);
      await punch();
    },
    onError: (err: Error) => setError(err.message),
  });
  const attachmentMutation = useMutation({
    mutationFn: (file: File) => api.uploadSubscriptionAttachment(subscriptionId, file),
    onSuccess: async () => {
      setError(null);
      await punch();
    },
    onError: (err: Error) => setError(err.message),
  });
  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      api.deleteSubscriptionAttachment(subscriptionId, attachmentId),
    onSuccess: punch,
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
      await punch();
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

  type ConfirmTarget =
    | { kind: 'action'; action: SubscriptionActionInput['action'] }
    | { kind: 'delete' }
    | { kind: 'attachment'; id: string; name: string };
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

  if (detailQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <PanelGhost lines={5} />
      </div>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <FormError>{detailQuery.error?.message ?? '未找到'}</FormError>;
  }

  const item = detailQuery.data;
  const actionLabel = (action: SubscriptionActionInput['action']): string =>
    action === 'cancel'
      ? '取消订阅'
      : action === 'renew'
        ? '续费恢复'
        : action === 'pause'
          ? '暂停订阅'
          : action === 'resume'
            ? '恢复订阅'
            : '结束试用并转为正式';

  const runAction = (action: SubscriptionActionInput['action']) => {
    setConfirmTarget({ kind: 'action', action });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header
        className={cn(
          'flex flex-col gap-3 border-b border-border pb-5',
          fresh && 'fresh-ink',
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p data-slot="ledger-label">
              {item.kind === 'digital_license' ? 'Digital license' : 'Subscription'}
            </p>
            <h1 className="text-2xl font-semibold text-heading">{item.name}</h1>
            <p data-slot="amount" className="text-sm text-muted-foreground">
              {item.vendor || '未填厂商'} ·{' '}
              {formatMinorCurrency(item.amountMinor, item.currency)} / {item.billingCycle}
              {item.discountMinor !== '0' ? (
                <> · 优惠 {formatMinorCurrency(item.discountMinor, item.currency)}</>
              ) : null}
            </p>
          </div>
          <Badge variant={item.status === 'active' ? 'success' : 'outline'}>
            {item.status}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link
              to="/reminders/new"
              search={{
                subscriptionId,
                kind: item.kind === 'digital_license' ? 'general' : 'renewal',
                title:
                  item.kind === 'digital_license'
                    ? `${item.name}许可到期提醒`
                    : `${item.name}续期提醒`,
                date:
                  (item.kind === 'digital_license'
                    ? item.expiresOn
                    : item.nextBillingOn) ?? localToday(),
              }}
            >
              {item.kind === 'digital_license' ? '创建到期提醒' : '创建续期提醒'}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/subscriptions">返回列表</Link>
          </Button>
          {item.kind === 'subscription' && item.status === 'trial' ? (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => runAction('convert_trial')}
            >
              转为正式
            </Button>
          ) : null}
          {item.kind === 'subscription' &&
          (item.status === 'active' || item.status === 'trial') ? (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => runAction('pause')}
            >
              暂停
            </Button>
          ) : null}
          {item.kind === 'subscription' && item.status === 'paused' ? (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => runAction('resume')}
            >
              恢复
            </Button>
          ) : null}
          {item.status === 'active' ||
          item.status === 'trial' ||
          item.status === 'paused' ? (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => runAction('cancel')}
            >
              取消
            </Button>
          ) : null}
          {item.kind === 'subscription' &&
          (item.status === 'cancelled' || item.status === 'expired') ? (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => runAction('renew')}
            >
              续费恢复
            </Button>
          ) : null}
          {/* 破坏性操作单独用 destructive，不和普通操作混成一排灰按钮 */}
          <Button
            variant="destructive"
            size="sm"
            type="button"
            disabled={deleteMutation.isPending}
            onClick={() => {
              setConfirmTarget({ kind: 'delete' });
            }}
          >
            删除
          </Button>
        </div>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Reading
          label="预计月支出"
          value={formatMinorCurrency(item.metrics.projectedMonthlyMinor, item.currency)}
          emphasis
        />
        <Reading
          label="预计年支出"
          value={formatMinorCurrency(item.metrics.projectedYearlyMinor, item.currency)}
        />
        <Reading
          label="实际已支出"
          value={formatMinorCurrency(item.metrics.actualSpendMinor, item.currency)}
        />
        <Reading
          label="计划中扣款"
          value={formatMinorCurrency(item.metrics.plannedSpendMinor, item.currency)}
        />
        <Reading label="失败扣款" value={String(item.metrics.failedChargeCount)} />
      </dl>

      <Panel eyebrow="Facts" title="资料">
        <dl className="grid gap-x-6 sm:grid-cols-2">
          <FactRow label="下次扣款" value={item.nextBillingOn || '—'} />
          <FactRow label="试用结束" value={item.trialEndsOn || '—'} />
          <FactRow label="优惠结束" value={item.discountEndsOn || '—'} />
          <FactRow label="自动续费" value={item.autoRenew ? '已开启' : '已关闭'} />
          <FactRow label="到期" value={item.expiresOn || '—'} />
          <FactRow label="席位" value={item.seats ?? '—'} />
          <FactRow label="账号标识" value={item.accountHint || '—'} />
          <FactRow
            label="密码管理器"
            value={
              item.passwordManagerUrl ? (
                <a
                  className="text-link hover:underline"
                  href={item.passwordManagerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开引用
                </a>
              ) : (
                '—'
              )
            }
          />
        </dl>
        {item.notes ? (
          <p className="text-sm text-muted-foreground">{item.notes}</p>
        ) : null}
        {item.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <Badge variant="outline" key={tag.id}>
                #{tag.name}
              </Badge>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          本系统不保存账号密码或 License Key。
        </p>
      </Panel>

      <FormError>{error}</FormError>
      <SubscriptionEditForm
        key={item.updatedAt}
        item={item}
        pending={updateMutation.isPending}
        onSave={(input) => updateMutation.mutate(input)}
      />

      <Panel eyebrow="Documents" title="订阅资料">
        <label
          className={cn(
            buttonVariants({ variant: 'secondary', size: 'sm' }),
            'w-fit cursor-pointer [&>input]:sr-only',
          )}
        >
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
          <ul className="flex flex-col">
            {item.attachments.map((attachment) => (
              <li
                className="flex items-center gap-3 border-b border-dashed border-border py-2.5 last:border-0"
                key={attachment.id}
              >
                <div className="min-w-0 flex-1">
                  <a
                    className="block truncate text-sm text-link hover:underline"
                    href={attachment.contentUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {attachment.originalName}
                  </a>
                  <p data-slot="amount" className="text-xs text-muted-foreground">
                    {Math.ceil(attachment.sizeBytes / 1024)} KB
                  </p>
                </div>
                <button
                  className="flex size-7 shrink-0 items-center justify-center border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                  type="button"
                  aria-label="删除资料"
                  onClick={() => {
                    setConfirmTarget({
                      kind: 'attachment',
                      id: attachment.id,
                      name: attachment.originalName,
                    });
                  }}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">还没有上传资料。</p>
        )}
      </Panel>

      <Panel eyebrow="Price history" title="价格与优惠">
        <form
          className="flex flex-col gap-3"
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
          <FormGrid className="lg:grid-cols-3">
            <FormField label="变更类型">
              <SelectInput name="priceKind" defaultValue="price_change">
                <option value="price_change">价格变更</option>
                <option value="discount">优惠期</option>
              </SelectInput>
            </FormField>
            <FormField label={`标价（${item.currency}）`}>
              <TextInput
                name="priceAmount"
                required
                inputMode="decimal"
                defaultValue={minorToMajor(item.amountMinor, item.currency)}
              />
            </FormField>
            <FormField label="优惠金额">
              <TextInput
                name="priceDiscount"
                inputMode="decimal"
                defaultValue={minorToMajor(item.discountMinor, item.currency)}
              />
            </FormField>
            <FormField label="优惠结束">
              <TextInput
                name="priceDiscountEnds"
                type="date"
                defaultValue={item.discountEndsOn ?? ''}
              />
            </FormField>
            <FormField label="生效日">
              <TextInput
                name="priceEffectiveOn"
                type="date"
                required
                defaultValue={localToday()}
              />
            </FormField>
            <FormField label="备注">
              <TextInput
                name="priceNote"
                maxLength={500}
                placeholder="例如续费涨价或首年优惠"
              />
            </FormField>
          </FormGrid>
          <Button className="w-fit" type="submit" disabled={priceMutation.isPending}>
            {priceMutation.isPending ? '保存中…' : '保存价格变更'}
          </Button>
        </form>

        {item.priceChanges.length > 0 ? (
          <ul className="flex flex-col">
            {item.priceChanges.map((change) => (
              <li
                className="border-b border-dashed border-border py-2.5 last:border-0"
                key={change.id}
              >
                <strong data-slot="amount" className="text-sm font-medium text-heading">
                  {change.effectiveOn} · {change.kind} ·{' '}
                  {formatMinorCurrency(change.amountMinor, item.currency)}
                </strong>
                {change.discountMinor !== '0' ? (
                  <p data-slot="amount" className="text-xs text-muted-foreground">
                    优惠 {formatMinorCurrency(change.discountMinor, item.currency)}
                  </p>
                ) : null}
                {change.note ? (
                  <p className="text-xs text-muted-foreground">{change.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel eyebrow="New charge" title="登记扣款">
        <form
          className="flex flex-col gap-3"
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
          <FormGrid className="lg:grid-cols-3">
            <FormField label="类型">
              <SelectInput name="kind" defaultValue="actual">
                <option value="actual">实际扣款</option>
                <option value="planned">计划扣款</option>
              </SelectInput>
            </FormField>
            <FormField label="实际结果">
              <SelectInput name="status" defaultValue="succeeded">
                <option value="succeeded">成功</option>
                <option value="failed">失败</option>
                <option value="refunded">退款</option>
                <option value="waived">豁免</option>
              </SelectInput>
            </FormField>
            <FormField label={`金额（${item.currency}）`}>
              <TextInput
                name="amount"
                required
                inputMode="decimal"
                defaultValue={minorToMajor(item.amountMinor, item.currency)}
              />
            </FormField>
            <FormField label="日期">
              <TextInput
                name="occurredOn"
                type="date"
                required
                defaultValue={localToday()}
              />
            </FormField>
            <FormField label="备注">
              <TextInput name="note" maxLength={500} />
            </FormField>
          </FormGrid>
          <Button className="w-fit" type="submit" disabled={chargeMutation.isPending}>
            {chargeMutation.isPending ? '保存中…' : '添加扣款记录'}
          </Button>
        </form>
        <FormError>{error}</FormError>
      </Panel>

      <Panel eyebrow="Ledger" title="扣款历史">
        {item.charges.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有扣款记录。</p>
        ) : (
          <ul className="flex flex-col">
            {item.charges.map((charge) => (
              <li
                className="border-b border-dashed border-border py-2.5 last:border-0"
                key={charge.id}
              >
                <strong data-slot="amount" className="text-sm font-medium text-heading">
                  {charge.occurredOn} · {charge.kind}/{charge.status} ·{' '}
                  {formatMinorCurrency(charge.amountMinor, charge.currency)}
                </strong>
                {charge.note ? (
                  <p className="text-xs text-muted-foreground">{charge.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={confirmTarget !== null}
        title={
          confirmTarget?.kind === 'action'
            ? `确认${actionLabel(confirmTarget.action)}？`
            : confirmTarget?.kind === 'delete'
              ? '归档删除该订阅？'
              : confirmTarget?.kind === 'attachment'
                ? `删除“${confirmTarget.name}”？`
                : ''
        }
        description={
          confirmTarget?.kind === 'action'
            ? `将在今天执行“${confirmTarget ? actionLabel(confirmTarget.action) : ''}”，状态与续费设置会同步更新。`
            : confirmTarget?.kind === 'delete'
              ? '订阅将移出账本，历史计费保留为记录。'
              : '此操作会删除该资料，附件不再可恢复。'
        }
        confirmLabel={confirmTarget?.kind === 'action' ? '执行' : '删除'}
        pendingLabel={confirmTarget?.kind === 'action' ? '正在执行…' : '正在删除…'}
        pending={
          confirmTarget?.kind === 'action'
            ? actionMutation.isPending
            : confirmTarget?.kind === 'attachment'
              ? deleteAttachmentMutation.isPending
              : deleteMutation.isPending
        }
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (!confirmTarget) return;
          if (confirmTarget.kind === 'action') {
            actionMutation.mutate(
              {
                action: confirmTarget.action,
                effectiveOn: localToday(),
                ...(confirmTarget.action === 'renew'
                  ? { nextBillingOn: item.nextBillingOn ?? undefined }
                  : {}),
              },
              { onSuccess: () => setConfirmTarget(null) },
            );
          } else if (confirmTarget.kind === 'delete') {
            deleteMutation.mutate(undefined, {
              onSettled: () => setConfirmTarget(null),
            });
          } else {
            deleteAttachmentMutation.mutate(confirmTarget.id, {
              onSuccess: () => setConfirmTarget(null),
            });
          }
        }}
      />
    </div>
  );
}

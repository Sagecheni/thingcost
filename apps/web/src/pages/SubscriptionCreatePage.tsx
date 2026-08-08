import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import type {
  CreateSubscriptionInput,
  SubscriptionBillingCycle,
  SubscriptionKind,
  SubscriptionStatus,
} from '@thingcost/contracts';

import { TagPicker } from '../components/TagPicker.js';
import { api } from '../lib/api.js';
import { majorToMinor } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

function formString(form: FormData, key: string, fallback = ''): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : fallback;
}

export function SubscriptionCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<SubscriptionKind>('subscription');
  const [billingCycle, setBillingCycle] = useState<SubscriptionBillingCycle>('monthly');
  const [error, setError] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: (input: CreateSubscriptionInput) => api.createSubscription(input),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions });
      await navigate({
        to: '/subscriptions/$subscriptionId',
        params: { subscriptionId: created.id },
      });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="page-stack narrow-form">
      <header className="page-header">
        <div>
          <p className="eyebrow">New subscription</p>
          <h1>新建订阅 / 许可</h1>
        </div>
      </header>

      <form
        className="content-card form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const amountMajor = formString(form, 'amount', '0');
          const seatsRaw = formString(form, 'seats');
          const customDaysRaw = formString(form, 'customIntervalDays', '30');
          const input: CreateSubscriptionInput = {
            kind,
            name: formString(form, 'name').trim(),
            vendor: formString(form, 'vendor').trim() || undefined,
            categoryLabel: formString(form, 'categoryLabel').trim() || undefined,
            status: formString(form, 'status', 'active') as SubscriptionStatus,
            billingCycle: kind === 'digital_license' ? 'one_time' : billingCycle,
            customIntervalDays:
              billingCycle === 'custom' ? Number(customDaysRaw || 30) : undefined,
            currency: 'CNY',
            amountMinor: majorToMinor(amountMajor, 'CNY') ?? '0',
            discountMinor: majorToMinor(formString(form, 'discount', '0'), 'CNY') ?? '0',
            discountEndsOn: formString(form, 'discountEndsOn') || undefined,
            autoRenew: form.get('autoRenew') !== null,
            seats: seatsRaw ? Number(seatsRaw) : undefined,
            startedOn: formString(form, 'startedOn') || undefined,
            trialEndsOn: formString(form, 'trialEndsOn') || undefined,
            nextBillingOn: formString(form, 'nextBillingOn') || undefined,
            expiresOn: formString(form, 'expiresOn') || undefined,
            accountHint: formString(form, 'accountHint').trim() || undefined,
            passwordManagerUrl:
              formString(form, 'passwordManagerUrl').trim() || undefined,
            notes: formString(form, 'notes').trim() || undefined,
            tagIds,
          };
          setError(null);
          createMutation.mutate(input);
        }}
      >
        <label>
          类型
          <select
            value={kind}
            onChange={(event) => {
              const next = event.target.value as SubscriptionKind;
              setKind(next);
              if (next === 'digital_license') setBillingCycle('one_time');
              else if (billingCycle === 'one_time') setBillingCycle('monthly');
            }}
          >
            <option value="subscription">周期订阅</option>
            <option value="digital_license">数字许可 / 买断</option>
          </select>
        </label>
        <label>
          名称
          <input
            name="name"
            required
            maxLength={160}
            placeholder="例如 iCloud+ 或 Final Cut"
          />
        </label>
        <label>
          厂商
          <input name="vendor" maxLength={120} />
        </label>
        <label>
          分类标签
          <input name="categoryLabel" maxLength={80} placeholder="云服务 / 域名 / 软件" />
        </label>
        <label>
          状态
          <select name="status" defaultValue="active">
            <option value="trial">试用中</option>
            <option value="active">进行中</option>
            <option value="paused">已暂停</option>
            <option value="cancelled">已取消</option>
            <option value="expired">已到期</option>
          </select>
        </label>
        {kind === 'subscription' && (
          <label>
            计费周期
            <select
              value={billingCycle}
              onChange={(event) =>
                setBillingCycle(event.target.value as SubscriptionBillingCycle)
              }
            >
              <option value="monthly">每月</option>
              <option value="yearly">每年</option>
              <option value="custom">自定义天数</option>
            </select>
          </label>
        )}
        {billingCycle === 'custom' && kind === 'subscription' && (
          <label>
            间隔天数
            <input
              name="customIntervalDays"
              type="number"
              min={1}
              max={3660}
              defaultValue={30}
            />
          </label>
        )}
        <label>
          金额（元）
          <input name="amount" required inputMode="decimal" defaultValue="0" />
        </label>
        <label>
          优惠金额（元）
          <input name="discount" inputMode="decimal" defaultValue="0" />
        </label>
        <label>
          优惠结束
          <input name="discountEndsOn" type="date" />
        </label>
        <label className="checkbox-label">
          <input name="autoRenew" type="checkbox" defaultChecked />
          自动续费
        </label>
        <label>
          席位 / 授权数
          <input name="seats" type="number" min={1} />
        </label>
        <label>
          开始日
          <input name="startedOn" type="date" />
        </label>
        <label>
          试用结束
          <input name="trialEndsOn" type="date" />
        </label>
        <label>
          下次扣款
          <input name="nextBillingOn" type="date" />
        </label>
        <label>
          到期日
          <input name="expiresOn" type="date" />
        </label>
        <label>
          账号标识（非密码）
          <input
            name="accountHint"
            maxLength={160}
            placeholder="例如 email@example.com"
          />
        </label>
        <label>
          密码管理器链接
          <input name="passwordManagerUrl" type="url" placeholder="https://…" />
        </label>
        <label>
          备注
          <textarea name="notes" rows={3} maxLength={4000} />
        </label>
        <div>
          <p className="field-label">标签</p>
          <TagPicker selected={tagIds} onChange={setTagIds} />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button
          className="primary-action"
          type="submit"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? '创建中…' : '创建'}
        </button>
      </form>
    </div>
  );
}

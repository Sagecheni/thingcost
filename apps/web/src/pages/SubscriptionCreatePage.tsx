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
import { useBaseCurrency } from '../lib/application-settings.js';
import { majorToMinor } from '../lib/format.js';
import { markFresh } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from '../components/ui/button.js';
import {
  CheckboxField,
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
import { PageHeader } from '../components/ui/page-header.js';

function formString(form: FormData, key: string, fallback = ''): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : fallback;
}

export function SubscriptionCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const baseCurrency = useBaseCurrency();
  const [kind, setKind] = useState<SubscriptionKind>('subscription');
  const [billingCycle, setBillingCycle] = useState<SubscriptionBillingCycle>('monthly');
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [error, setError] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: (input: CreateSubscriptionInput) => api.createSubscription(input),
    onSuccess: async (created) => {
      markFresh(created.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions });
      await navigate({
        to: '/subscriptions/$subscriptionId',
        params: { subscriptionId: created.id },
      });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader eyebrow="New subscription" title="新建订阅 / 许可" />

      <form
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
            status,
            billingCycle: kind === 'digital_license' ? 'one_time' : billingCycle,
            customIntervalDays:
              billingCycle === 'custom' ? Number(customDaysRaw || 30) : undefined,
            currency: baseCurrency,
            amountMinor: majorToMinor(amountMajor, baseCurrency) ?? '0',
            discountMinor:
              majorToMinor(formString(form, 'discount', '0'), baseCurrency) ?? '0',
            discountEndsOn: formString(form, 'discountEndsOn') || undefined,
            autoRenew: kind === 'subscription' && form.get('autoRenew') !== null,
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
        <Panel eyebrow="Contract" title="订阅信息">
          <FormGrid>
            <FormField label="类型">
              <SelectInput
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as SubscriptionKind;
                  setKind(next);
                  if (next === 'digital_license') {
                    setBillingCycle('one_time');
                    if (status === 'trial' || status === 'paused') setStatus('active');
                  } else if (billingCycle === 'one_time') {
                    setBillingCycle('monthly');
                  }
                }}
              >
                <option value="subscription">周期订阅</option>
                <option value="digital_license">数字许可 / 买断</option>
              </SelectInput>
            </FormField>
            <FormField label="名称">
              <TextInput
                name="name"
                required
                maxLength={160}
                placeholder="例如 iCloud+ 或 Final Cut"
              />
            </FormField>
            <FormField label="厂商">
              <TextInput name="vendor" maxLength={120} />
            </FormField>
            <FormField label="分类标签">
              <TextInput
                name="categoryLabel"
                maxLength={80}
                placeholder="云服务 / 域名 / 软件"
              />
            </FormField>
            <FormField label="状态">
              <SelectInput
                value={status}
                onChange={(event) => setStatus(event.target.value as SubscriptionStatus)}
              >
                {kind === 'subscription' ? <option value="trial">试用中</option> : null}
                <option value="active">进行中</option>
                {kind === 'subscription' ? <option value="paused">已暂停</option> : null}
                <option value="cancelled">已取消</option>
                <option value="expired">已到期</option>
              </SelectInput>
            </FormField>
            {kind === 'subscription' ? (
              <FormField label="计费周期">
                <SelectInput
                  value={billingCycle}
                  onChange={(event) =>
                    setBillingCycle(event.target.value as SubscriptionBillingCycle)
                  }
                >
                  <option value="monthly">每月</option>
                  <option value="yearly">每年</option>
                  <option value="custom">自定义天数</option>
                </SelectInput>
              </FormField>
            ) : null}
            {billingCycle === 'custom' && kind === 'subscription' ? (
              <FormField label="间隔天数">
                <TextInput
                  name="customIntervalDays"
                  type="number"
                  min={1}
                  max={3660}
                  defaultValue={30}
                />
              </FormField>
            ) : null}
          </FormGrid>
        </Panel>

        <Panel eyebrow="Money" title="金额与周期" className="mt-4">
          <FormGrid>
            <FormField label={`金额（${baseCurrency}）`}>
              <TextInput name="amount" required inputMode="decimal" defaultValue="0" />
            </FormField>
            <FormField label={`优惠金额（${baseCurrency}）`}>
              <TextInput name="discount" inputMode="decimal" defaultValue="0" />
            </FormField>
            <FormField label="优惠结束">
              <TextInput name="discountEndsOn" type="date" />
            </FormField>
            <FormField label="席位 / 授权数">
              <TextInput name="seats" type="number" min={1} />
            </FormField>
            <FormField label="开始日">
              <TextInput name="startedOn" type="date" />
            </FormField>
            {kind === 'subscription' ? (
              <>
                <FormField label="试用结束">
                  <TextInput name="trialEndsOn" type="date" />
                </FormField>
                <FormField label="下次扣款">
                  <TextInput name="nextBillingOn" type="date" />
                </FormField>
              </>
            ) : null}
            <FormField label="到期日">
              <TextInput name="expiresOn" type="date" />
            </FormField>
          </FormGrid>
          {kind === 'subscription' ? (
            <CheckboxField name="autoRenew" defaultChecked label="自动续费" />
          ) : null}
        </Panel>

        <Panel eyebrow="Access" title="账号与备注" className="mt-4">
          <FormGrid>
            {/* 只存标识和跳转链接；密码与 License Key 一律不进本系统 */}
            <FormField label="账号标识（非密码）">
              <TextInput
                name="accountHint"
                maxLength={160}
                placeholder="例如 email@example.com"
              />
            </FormField>
            <FormField label="密码管理器链接">
              <TextInput name="passwordManagerUrl" type="url" placeholder="https://…" />
            </FormField>
            <FormField label="备注" className="sm:col-span-2">
              <TextArea name="notes" rows={3} maxLength={4000} />
            </FormField>
            <FormBlock label="标签" className="sm:col-span-2">
              <TagPicker selected={tagIds} onChange={setTagIds} />
            </FormBlock>
          </FormGrid>
        </Panel>

        <div className="mt-4 flex flex-col gap-3">
          <FormError>{error}</FormError>
          <FormActions>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? '创建中…' : '创建'}
            </Button>
          </FormActions>
        </div>
      </form>
    </div>
  );
}

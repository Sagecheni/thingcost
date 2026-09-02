import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { CreateReminderInput } from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { ApiClientError, api } from '../lib/api.js';
import { localToday } from '../lib/format.js';
import { markFresh } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from '../components/ui/button.js';
import {
  CheckboxField,
  FormError,
  FormField,
  FormGrid,
  Panel,
  SelectInput,
  TextArea,
  TextInput,
} from '../components/ui/form.js';

const leadOptions = [
  { minutes: 0, label: '到期时' },
  { minutes: 1_440, label: '提前 1 天' },
  { minutes: 10_080, label: '提前 7 天' },
  { minutes: 43_200, label: '提前 30 天' },
];

/* 可多选的提前量签条 */
const leadChip = cn(
  'inline-flex cursor-pointer items-center gap-1 border border-border',
  'px-2.5 py-1.5 text-xs text-muted-foreground transition duration-150',
  'hover:border-border-strong hover:text-foreground',
  'has-[:checked]:border-primary has-[:checked]:bg-primary',
  'has-[:checked]:text-primary-foreground',
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
  'has-[:focus-visible]:outline-offset-2',
);

/* 单选的模式卡：两行文案，比一排 radio 更能说清区别 */
const modeChoice = cn(
  'flex flex-1 cursor-pointer flex-col gap-0.5 border border-border p-3',
  'text-left transition duration-150',
  'hover:border-border-strong',
  'has-[:checked]:border-primary has-[:checked]:bg-accent',
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
  'has-[:focus-visible]:outline-offset-2',
);

export function ReminderCreatePage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/reminders/new' });
  const queryClient = useQueryClient();
  const assetsQuery = useQuery({
    queryKey: queryKeys.assetLists,
    queryFn: () => api.assets(),
  });
  const subscriptionsQuery = useQuery({
    queryKey: queryKeys.subscriptions,
    queryFn: api.subscriptions,
  });
  const channelsQuery = useQuery({
    queryKey: queryKeys.notificationChannels,
    queryFn: api.notificationChannels,
  });
  const [assetId, setAssetId] = useState(search.assetId ?? '');
  const [subscriptionId, setSubscriptionId] = useState(search.subscriptionId ?? '');
  const [kind, setKind] = useState<CreateReminderInput['kind']>(search.kind ?? 'general');
  const [title, setTitle] = useState(search.title ?? '');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(search.date ?? localToday());
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [interval, setInterval] = useState('1');
  const [endsOn, setEndsOn] = useState('');
  const [leadMinutes, setLeadMinutes] = useState<number[]>([0]);
  const [taskMode, setTaskMode] = useState<'notification' | 'actionable'>('notification');
  const [repeatIntervalMinutes, setRepeatIntervalMinutes] = useState('1440');
  const [maxRepeats, setMaxRepeats] = useState('0');
  const [channelMode, setChannelMode] = useState<'default' | 'override' | 'none'>(
    'default',
  );
  const [channelKeys, setChannelKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createReminder = useMutation({
    mutationFn: api.createReminder,
    onSuccess: async (created) => {
      markFresh(created.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.reminders }),
        queryClient.invalidateQueries({ queryKey: queryKeys.upcomingReminders }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      await navigate({
        to: '/reminders/$reminderId',
        params: { reminderId: created.id },
      });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiClientError
          ? mutationError.message
          : '提醒保存失败，请重试。',
      );
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (recurring && !endsOn) {
      setError('周期提醒需要设置结束日期。');
      return;
    }
    if (channelMode === 'override' && channelKeys.length === 0) {
      setError('请选择至少一个通知渠道。');
      return;
    }
    const input: CreateReminderInput = {
      ...(assetId ? { assetId } : {}),
      ...(subscriptionId ? { subscriptionId } : {}),
      kind,
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      trigger: { mode: 'date', dueDate, timeOfDay },
      recurrence: recurring
        ? {
            kind: 'recurring',
            frequency,
            interval: Number(interval),
            endsOn,
          }
        : { kind: 'once' },
      leadMinutes: [...leadMinutes].sort((a, b) => b - a),
      taskMode,
      repeatIntervalMinutes: Number(repeatIntervalMinutes),
      maxRepeats: taskMode === 'actionable' ? Number(maxRepeats) : 0,
      channelMode,
      channelKeys: channelMode === 'override' ? channelKeys : [],
    };
    createReminder.mutate(input);
  }

  function toggleLead(minutes: number) {
    setLeadMinutes((current) =>
      current.includes(minutes)
        ? current.filter((value) => value !== minutes)
        : [...current, minutes],
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header className="flex flex-col gap-2 border-b border-border pb-5">
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          to="/reminders"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 返回提醒中心
        </Link>
        <p data-slot="ledger-label">New signal</p>
        <h1 className="text-2xl font-semibold text-heading">新建提醒</h1>
        <p className="text-sm text-muted-foreground">
          先记下要发生的事，再决定要不要让它主动找到你。
        </p>
      </header>

      <form className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]" onSubmit={submit}>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel eyebrow="What" title="提醒内容">
            <FormGrid>
              <FormField label="标题 *">
                <TextInput
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例如：检查相机保修"
                />
              </FormField>
              <FormField label="类型">
                <SelectInput
                  value={kind}
                  onChange={(event) =>
                    setKind(event.target.value as CreateReminderInput['kind'])
                  }
                >
                  <option value="general">通用提醒</option>
                  <option value="warranty_expiry">保修到期</option>
                  <option value="maintenance">维护保养</option>
                  <option value="loan_return">借出归还</option>
                  <option value="renewal">续期提醒</option>
                </SelectInput>
              </FormField>
              {/* 物品和订阅互斥：选了一个就清掉另一个 */}
              <FormField label="关联物品（可选）">
                <SelectInput
                  value={assetId}
                  onChange={(event) => {
                    setAssetId(event.target.value);
                    if (event.target.value) setSubscriptionId('');
                  }}
                >
                  <option value="">全局提醒</option>
                  {(assetsQuery.data?.items ?? []).map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="关联订阅 / 许可（可选）">
                <SelectInput
                  value={subscriptionId}
                  onChange={(event) => {
                    setSubscriptionId(event.target.value);
                    if (event.target.value) setAssetId('');
                  }}
                >
                  <option value="">不关联订阅</option>
                  {(subscriptionsQuery.data?.items ?? []).map((subscription) => (
                    <option key={subscription.id} value={subscription.id}>
                      {subscription.name}
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
                placeholder="记录背景、处理方式或需要带上的信息"
              />
            </FormField>
          </Panel>

          <Panel eyebrow="When" title="时间规则">
            <FormGrid>
              <FormField label="日期 *">
                <TextInput
                  type="date"
                  required
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </FormField>
              <FormField label="提醒时间">
                <TextInput
                  type="time"
                  required
                  value={timeOfDay}
                  onChange={(event) => setTimeOfDay(event.target.value)}
                />
              </FormField>
            </FormGrid>

            <CheckboxField
              checked={recurring}
              onChange={(event) => setRecurring(event.target.checked)}
              label="按周期重复"
            />

            {recurring ? (
              <FormGrid className="lg:grid-cols-3">
                <FormField label="每">
                  <SelectInput
                    value={frequency}
                    onChange={(event) =>
                      setFrequency(event.target.value as typeof frequency)
                    }
                  >
                    <option value="day">天</option>
                    <option value="week">周</option>
                    <option value="month">月</option>
                    <option value="year">年</option>
                  </SelectInput>
                </FormField>
                <FormField label="间隔">
                  <TextInput
                    type="number"
                    min="1"
                    max="365"
                    value={interval}
                    onChange={(event) => setInterval(event.target.value)}
                  />
                </FormField>
                <FormField label="结束日期">
                  <TextInput
                    type="date"
                    required
                    value={endsOn}
                    onChange={(event) => setEndsOn(event.target.value)}
                  />
                </FormField>
              </FormGrid>
            ) : null}

            <fieldset className="space-y-2 border-0 p-0">
              <legend data-slot="ledger-label">提前提醒</legend>
              <div className="flex flex-wrap gap-2">
                {leadOptions.map((option) => (
                  <label className={leadChip} key={option.minutes}>
                    <input
                      className="sr-only"
                      type="checkbox"
                      checked={leadMinutes.includes(option.minutes)}
                      onChange={() => toggleLead(option.minutes)}
                    />
                    {leadMinutes.includes(option.minutes) ? (
                      <Check aria-hidden="true" className="size-3" />
                    ) : null}
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </Panel>

          <Panel eyebrow="How" title="提醒方式">
            <fieldset className="flex flex-wrap gap-2 border-0 p-0">
              <legend className="sr-only">提醒模式</legend>
              <label className={modeChoice}>
                <input
                  className="sr-only"
                  type="radio"
                  name="taskMode"
                  checked={taskMode === 'notification'}
                  onChange={() => {
                    setTaskMode('notification');
                    setMaxRepeats('0');
                  }}
                />
                <strong className="text-sm font-medium text-heading">普通通知</strong>
                <small className="text-xs text-muted-foreground">发送后自动结束</small>
              </label>
              <label className={modeChoice}>
                <input
                  className="sr-only"
                  type="radio"
                  name="taskMode"
                  checked={taskMode === 'actionable'}
                  onChange={() => setTaskMode('actionable')}
                />
                <strong className="text-sm font-medium text-heading">待确认任务</strong>
                <small className="text-xs text-muted-foreground">
                  可确认、忽略或稍后提醒
                </small>
              </label>
            </fieldset>

            {taskMode === 'actionable' ? (
              <FormGrid>
                <FormField label="未处理时重发间隔（分钟）">
                  <TextInput
                    type="number"
                    min="10"
                    value={repeatIntervalMinutes}
                    onChange={(event) => setRepeatIntervalMinutes(event.target.value)}
                  />
                </FormField>
                <FormField label="最多重发次数">
                  <TextInput
                    type="number"
                    min="0"
                    max="20"
                    value={maxRepeats}
                    onChange={(event) => setMaxRepeats(event.target.value)}
                  />
                </FormField>
              </FormGrid>
            ) : null}

            <fieldset className="space-y-2 border-0 p-0">
              <legend data-slot="ledger-label">发送渠道</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['default', '全局默认'],
                    ['none', '仅站内'],
                    ['override', '指定渠道'],
                  ] as const
                ).map(([value, label]) => (
                  <label className={leadChip} key={value}>
                    <input
                      className="sr-only"
                      type="radio"
                      name="channelMode"
                      checked={channelMode === value}
                      onChange={() => {
                        setChannelMode(value);
                        if (value === 'none') setChannelKeys([]);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {channelMode === 'override' ? (
                <div className="flex flex-col gap-1.5 pt-1">
                  {(channelsQuery.data ?? []).map((channel) => (
                    <CheckboxField
                      key={channel.key}
                      checked={channelKeys.includes(channel.key)}
                      onChange={() =>
                        setChannelKeys((current) =>
                          current.includes(channel.key)
                            ? current.filter((key) => key !== channel.key)
                            : [...current, channel.key],
                        )
                      }
                      label={channel.name}
                    />
                  ))}
                  {(channelsQuery.data ?? []).length === 0 ? (
                    <small className="text-xs text-muted-foreground">
                      还没有可用渠道，请先在提醒中心添加。
                    </small>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
          <Panel eyebrow="Reminder rule" title={title || '未命名提醒'}>
            <p data-slot="amount" className="text-sm text-muted-foreground">
              {dueDate} {timeOfDay} ·{' '}
              {recurring
                ? `每${interval}${frequency === 'month' ? '个月' : frequency === 'week' ? '周' : frequency === 'year' ? '年' : '天'}`
                : '一次性'}
            </p>
          </Panel>
          <FormError>{error}</FormError>
          <Button
            type="submit"
            disabled={createReminder.isPending || leadMinutes.length === 0}
          >
            {createReminder.isPending ? '保存中…' : '保存提醒'}
          </Button>
          <small className="text-xs text-muted-foreground">
            提醒时间按应用时区调度：{Intl.DateTimeFormat().resolvedOptions().timeZone}
          </small>
        </aside>
      </form>
    </div>
  );
}

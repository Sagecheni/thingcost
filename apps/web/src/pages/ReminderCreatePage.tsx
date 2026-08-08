import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, BellRing, CalendarClock, Check } from 'lucide-react';
import { useState } from 'react';

import type { CreateReminderInput } from '@thingcost/contracts';

import { ApiClientError, api } from '../lib/api.js';
import { localToday } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

const leadOptions = [
  { minutes: 0, label: '到期时' },
  { minutes: 1_440, label: '提前 1 天' },
  { minutes: 10_080, label: '提前 7 天' },
  { minutes: 43_200, label: '提前 30 天' },
];

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

  function submit(event: React.FormEvent<HTMLFormElement>) {
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
    <>
      <Link className="back-link" to="/reminders">
        <ArrowLeft size={16} /> 返回提醒中心
      </Link>
      <header className="topbar page-topbar reminder-create-heading">
        <div>
          <p className="eyebrow">New signal</p>
          <h1>新建提醒</h1>
          <p className="muted-copy">先记下要发生的事，再决定要不要让它主动找到你。</p>
        </div>
      </header>

      <form className="reminder-create-layout" onSubmit={submit}>
        <div className="reminder-form-main">
          <section className="form-card reminder-form-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">What</p>
                <h2>提醒内容</h2>
              </div>
              <BellRing size={20} />
            </div>
            <div className="form-grid">
              <label>
                标题 *
                <input
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例如：检查相机保修"
                />
              </label>
              <label>
                类型
                <select
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
                </select>
              </label>
              <label>
                关联物品（可选）
                <select
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
                </select>
              </label>
              <label>
                关联订阅 / 许可（可选）
                <select
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
                </select>
              </label>
            </div>
            <label>
              备注
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="记录背景、处理方式或需要带上的信息"
              />
            </label>
          </section>

          <section className="form-card reminder-form-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">When</p>
                <h2>时间规则</h2>
              </div>
              <CalendarClock size={20} />
            </div>
            <div className="form-grid">
              <label>
                日期 *
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>
              <label>
                提醒时间
                <input
                  type="time"
                  required
                  value={timeOfDay}
                  onChange={(event) => setTimeOfDay(event.target.value)}
                />
              </label>
            </div>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(event) => setRecurring(event.target.checked)}
              />
              <span>按周期重复</span>
            </label>
            {recurring && (
              <div className="form-grid recurring-fields">
                <label>
                  每
                  <select
                    value={frequency}
                    onChange={(event) =>
                      setFrequency(event.target.value as typeof frequency)
                    }
                  >
                    <option value="day">天</option>
                    <option value="week">周</option>
                    <option value="month">月</option>
                    <option value="year">年</option>
                  </select>
                </label>
                <label>
                  间隔
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={interval}
                    onChange={(event) => setInterval(event.target.value)}
                  />
                </label>
                <label>
                  结束日期
                  <input
                    type="date"
                    required
                    value={endsOn}
                    onChange={(event) => setEndsOn(event.target.value)}
                  />
                </label>
              </div>
            )}
            <fieldset className="lead-picker">
              <legend>提前提醒</legend>
              <div>
                {leadOptions.map((option) => (
                  <label
                    className={
                      leadMinutes.includes(option.minutes)
                        ? 'lead-option selected'
                        : 'lead-option'
                    }
                    key={option.minutes}
                  >
                    <input
                      type="checkbox"
                      checked={leadMinutes.includes(option.minutes)}
                      onChange={() => toggleLead(option.minutes)}
                    />
                    <span>
                      {leadMinutes.includes(option.minutes) && <Check size={13} />}
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="form-card reminder-form-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">How</p>
                <h2>提醒方式</h2>
              </div>
            </div>
            <div className="mode-choice-grid">
              <label
                className={
                  taskMode === 'notification' ? 'mode-choice selected' : 'mode-choice'
                }
              >
                <input
                  type="radio"
                  checked={taskMode === 'notification'}
                  onChange={() => {
                    setTaskMode('notification');
                    setMaxRepeats('0');
                  }}
                />
                <strong>普通通知</strong>
                <small>发送后自动结束</small>
              </label>
              <label
                className={
                  taskMode === 'actionable' ? 'mode-choice selected' : 'mode-choice'
                }
              >
                <input
                  type="radio"
                  checked={taskMode === 'actionable'}
                  onChange={() => setTaskMode('actionable')}
                />
                <strong>待确认任务</strong>
                <small>可确认、忽略或稍后提醒</small>
              </label>
            </div>
            {taskMode === 'actionable' && (
              <div className="form-grid repeat-fields">
                <label>
                  未处理时每
                  <input
                    type="number"
                    min="10"
                    value={repeatIntervalMinutes}
                    onChange={(event) => setRepeatIntervalMinutes(event.target.value)}
                  />
                  分钟重发
                </label>
                <label>
                  最多重发
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={maxRepeats}
                    onChange={(event) => setMaxRepeats(event.target.value)}
                  />
                  次
                </label>
              </div>
            )}
            <fieldset className="channel-picker">
              <legend>发送渠道</legend>
              <div className="channel-mode-buttons">
                <label className={channelMode === 'default' ? 'selected' : ''}>
                  <input
                    type="radio"
                    checked={channelMode === 'default'}
                    onChange={() => setChannelMode('default')}
                  />
                  全局默认
                </label>
                <label className={channelMode === 'none' ? 'selected' : ''}>
                  <input
                    type="radio"
                    checked={channelMode === 'none'}
                    onChange={() => {
                      setChannelMode('none');
                      setChannelKeys([]);
                    }}
                  />
                  仅站内
                </label>
                <label className={channelMode === 'override' ? 'selected' : ''}>
                  <input
                    type="radio"
                    checked={channelMode === 'override'}
                    onChange={() => setChannelMode('override')}
                  />
                  指定渠道
                </label>
              </div>
              {channelMode === 'override' && (
                <div className="channel-checkbox-list">
                  {(channelsQuery.data ?? []).map((channel) => (
                    <label key={channel.key}>
                      <input
                        type="checkbox"
                        checked={channelKeys.includes(channel.key)}
                        onChange={() =>
                          setChannelKeys((current) =>
                            current.includes(channel.key)
                              ? current.filter((key) => key !== channel.key)
                              : [...current, channel.key],
                          )
                        }
                      />
                      {channel.name}
                    </label>
                  ))}
                  {(channelsQuery.data ?? []).length === 0 && (
                    <small>还没有可用渠道，请先在提醒中心添加。</small>
                  )}
                </div>
              )}
            </fieldset>
          </section>
        </div>

        <aside className="reminder-submit-panel">
          <span className="reminder-panel-mark">
            <BellRing size={22} />
          </span>
          <p className="eyebrow">Reminder rule</p>
          <h2>{title || '未命名提醒'}</h2>
          <p>
            {dueDate} {timeOfDay} ·{' '}
            {recurring
              ? `每${interval}${frequency === 'month' ? '个月' : frequency === 'week' ? '周' : frequency === 'year' ? '年' : '天'}`
              : '一次性'}
          </p>
          {error && <div className="form-error">{error}</div>}
          <button
            className="primary-action"
            type="submit"
            disabled={createReminder.isPending || leadMinutes.length === 0}
          >
            {createReminder.isPending ? '保存中…' : '保存提醒'}
          </button>
          <small>
            提醒时间按应用时区调度：{Intl.DateTimeFormat().resolvedOptions().timeZone}
          </small>
        </aside>
      </form>
    </>
  );
}

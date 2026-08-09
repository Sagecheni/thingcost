import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BellRing, Check, Clock3, Plus, Send, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';

import type { CreateNotificationChannelInput } from '@thingcost/contracts';

import { ApiClientError, api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';

function formatDue(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function reminderKindLabel(kind: string): string {
  return (
    {
      general: '通用提醒',
      warranty_expiry: '保修到期',
      maintenance: '维护保养',
      loan_return: '借出归还',
      renewal: '续期提醒',
    }[kind] ?? kind
  );
}

export function ReminderListPage() {
  const queryClient = useQueryClient();
  const remindersQuery = useQuery({
    queryKey: queryKeys.reminders,
    queryFn: api.reminders,
  });
  const upcomingQuery = useQuery({
    queryKey: queryKeys.upcomingReminders,
    queryFn: api.upcomingReminders,
  });
  const channelsQuery = useQuery({
    queryKey: queryKeys.notificationChannels,
    queryFn: api.notificationChannels,
  });
  const [channelFormOpen, setChannelFormOpen] = useState(false);
  const [channelProvider, setChannelProvider] = useState<
    'telegram' | 'webhook' | 'wecom' | 'serverchan' | 'pushplus'
  >('webhook');
  const [channelName, setChannelName] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [channelSecret, setChannelSecret] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [wecomWebhookUrl, setWecomWebhookUrl] = useState('');
  const [serverchanSendKey, setServerchanSendKey] = useState('');
  const [pushplusToken, setPushplusToken] = useState('');
  const [pushplusTopic, setPushplusTopic] = useState('');
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelNotice, setChannelNotice] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders }),
      queryClient.invalidateQueries({ queryKey: queryKeys.upcomingReminders }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationChannels }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);

  const occurrenceAction = useMutation({
    mutationFn: (input: { occurrenceId: string; action: 'acknowledge' | 'dismiss' }) =>
      input.action === 'acknowledge'
        ? api.acknowledgeReminder(input.occurrenceId)
        : api.dismissReminder(input.occurrenceId),
    onSuccess: refresh,
  });
  const snoozeAction = useMutation({
    mutationFn: (input: { occurrenceId: string; durationMinutes: number }) =>
      api.snoozeReminder(input.occurrenceId, input.durationMinutes),
    onSuccess: refresh,
  });
  const testChannel = useMutation({
    mutationFn: (key: string) => api.testNotificationChannel(key),
    onSuccess: (result) => {
      setChannelError(null);
      setChannelNotice(result.message);
    },
    onError: (error) => {
      setChannelNotice(null);
      setChannelError(
        error instanceof ApiClientError ? error.message : '测试消息发送失败',
      );
    },
  });
  const createChannel = useMutation({
    mutationFn: (input: CreateNotificationChannelInput) =>
      api.createNotificationChannel(input),
    onSuccess: async () => {
      setChannelFormOpen(false);
      setChannelName('');
      setChannelUrl('');
      setChannelSecret('');
      setTelegramBotToken('');
      setTelegramChatId('');
      setWecomWebhookUrl('');
      setServerchanSendKey('');
      setPushplusToken('');
      setPushplusTopic('');
      setChannelError(null);
      setChannelNotice(null);
      await refresh();
    },
    onError: (error) => {
      setChannelError(error instanceof ApiClientError ? error.message : '渠道保存失败');
    },
  });

  const reminders = remindersQuery.data ?? [];
  const upcoming = upcomingQuery.data ?? [];

  return (
    <>
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">Time signals</p>
          <h1>提醒中心</h1>
          <p className="muted-copy">
            保修、维护、归还和任意一件值得记住的事，都在这里留下下一步。
          </p>
        </div>
        <Link className="primary-action" to="/reminders/new">
          <Plus size={18} /> 新建提醒
        </Link>
      </header>

      <section className="reminder-overview-grid">
        <article>
          <span className="reminder-overview-icon">
            <BellRing size={19} />
          </span>
          <div>
            <small>当前提醒</small>
            <strong>{reminders.filter((item) => item.status === 'active').length}</strong>
          </div>
        </article>
        <article>
          <span className="reminder-overview-icon warning">
            <Clock3 size={19} />
          </span>
          <div>
            <small>未来 90 天实例</small>
            <strong>{upcoming.length}</strong>
          </div>
        </article>
        <article>
          <span className="reminder-overview-icon safe">
            <ShieldCheck size={19} />
          </span>
          <div>
            <small>已配置渠道</small>
            <strong>{channelsQuery.data?.length ?? 0}</strong>
          </div>
        </article>
      </section>

      <div className="reminder-workspace">
        <section className="content-card upcoming-reminders-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Upcoming</p>
              <h2>即将到期</h2>
            </div>
            <span className="status-badge">Worker 同步</span>
          </div>
          {upcoming.length === 0 ? (
            <div className="reminder-empty-state">
              <Clock3 size={22} aria-hidden="true" />
              <div>
                <strong>还没有排到期的提醒</strong>
                <p>Worker 会持续把周期规则展开到未来 400 天。</p>
              </div>
            </div>
          ) : (
            <div className="upcoming-reminder-list">
              {upcoming.map((item) => (
                <article key={item.id}>
                  <div className="upcoming-reminder-date">
                    <strong>{new Date(item.dueAt).getDate()}</strong>
                    <small>
                      {new Date(item.dueAt).toLocaleDateString('zh-CN', {
                        month: 'short',
                      })}
                    </small>
                  </div>
                  <div className="upcoming-reminder-main">
                    <Link
                      to="/reminders/$reminderId"
                      params={{ reminderId: item.reminderId }}
                    >
                      {item.reminder.title}
                    </Link>
                    <p>
                      {item.reminder.asset?.name ?? '全局提醒'} ·{' '}
                      {formatDue(item.dueAt, item.reminder.timeZone)}
                    </p>
                  </div>
                  {item.reminder.taskMode === 'actionable' && (
                    <div className="reminder-inline-actions">
                      <button
                        type="button"
                        title="确认完成"
                        aria-label="确认完成"
                        onClick={() =>
                          occurrenceAction.mutate({
                            occurrenceId: item.id,
                            action: 'acknowledge',
                          })
                        }
                      >
                        <Check size={15} />
                      </button>
                      <button
                        type="button"
                        title="稍后提醒一小时"
                        aria-label="稍后提醒一小时"
                        onClick={() =>
                          snoozeAction.mutate({
                            occurrenceId: item.id,
                            durationMinutes: 60,
                          })
                        }
                      >
                        <Clock3 size={15} />
                      </button>
                      <button
                        type="button"
                        title="忽略"
                        aria-label="忽略"
                        onClick={() =>
                          occurrenceAction.mutate({
                            occurrenceId: item.id,
                            action: 'dismiss',
                          })
                        }
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="content-card reminder-list-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Reminder rules</p>
              <h2>全部提醒</h2>
            </div>
            <span className="micro-copy">
              普通通知发送后自动结束；待确认任务保留处理状态。
            </span>
          </div>
          {remindersQuery.isPending && <p className="page-loading">正在读取提醒…</p>}
          {remindersQuery.isError && (
            <div className="form-error">{remindersQuery.error.message}</div>
          )}
          {!remindersQuery.isPending && reminders.length === 0 && (
            <div className="reminder-empty-state compact">
              <BellRing size={20} aria-hidden="true" />
              <div>
                <strong>还没有提醒规则</strong>
                <p>把保修、维护或归还日期交给提醒中心。</p>
              </div>
            </div>
          )}
          <div className="reminder-rule-list">
            {reminders.map((reminder) => (
              <Link
                className="reminder-rule-row"
                key={reminder.id}
                to="/reminders/$reminderId"
                params={{ reminderId: reminder.id }}
              >
                <span className={`reminder-rule-dot ${reminder.status}`}>
                  <BellRing size={15} />
                </span>
                <span className="reminder-rule-main">
                  <strong>{reminder.title}</strong>
                  <small>
                    {reminderKindLabel(reminder.kind)} · {reminder.asset?.name ?? '全局'}{' '}
                    ·{' '}
                    {reminder.recurrenceKind === 'recurring'
                      ? `每${reminder.recurrenceInterval}${reminder.frequency === 'month' ? '个月' : reminder.frequency === 'week' ? '周' : reminder.frequency === 'year' ? '年' : '天'}`
                      : '一次性'}
                  </small>
                </span>
                <span className="reminder-rule-next">
                  {reminder.nextOccurrenceAt
                    ? formatDue(reminder.nextOccurrenceAt, reminder.timeZone)
                    : '已展开'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="content-card channel-settings-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Delivery channels</p>
            <h2>通知渠道</h2>
          </div>
          <button
            className="secondary-action"
            type="button"
            onClick={() => setChannelFormOpen((open) => !open)}
          >
            <Send size={15} /> 添加渠道
          </button>
        </div>
        <p className="muted-copy">
          环境变量渠道不会把密钥写入数据库；数据库渠道需要 APP_MASTER_KEY 加密保存。
        </p>
        {channelNotice && <div className="form-success">{channelNotice}</div>}
        {channelError && <div className="form-error">{channelError}</div>}
        <div className="channel-list">
          {(channelsQuery.data ?? []).map((channel) => (
            <div className="channel-row" key={channel.key}>
              <span className={`channel-provider ${channel.provider}`}>
                {channel.provider === 'webhook'
                  ? '↗'
                  : channel.provider === 'wecom'
                    ? '企'
                    : channel.provider === 'serverchan'
                      ? '微'
                      : channel.provider === 'pushplus'
                        ? '推'
                        : '✈'}
              </span>
              <span>
                <strong>{channel.name}</strong>
                <small>{channel.configurationSummary}</small>
              </span>
              <span className="channel-source">
                {channel.source === 'environment' ? '环境变量' : '数据库'}
                {channel.isDefault ? ' · 默认' : ''}
              </span>
              <button
                className="channel-test-action"
                type="button"
                disabled={testChannel.isPending || !channel.enabled}
                onClick={() => {
                  setChannelError(null);
                  setChannelNotice(null);
                  testChannel.mutate(channel.key);
                }}
              >
                {testChannel.isPending ? '发送中…' : '测试发送'}
              </button>
            </div>
          ))}
          {(channelsQuery.data ?? []).length === 0 && (
            <div className="channel-empty-state">
              <Send size={20} aria-hidden="true" />
              <div>
                <strong>还没有通知渠道</strong>
                <p>添加一个渠道后，可先发送测试消息确认配置。</p>
              </div>
            </div>
          )}
        </div>
        {channelFormOpen && (
          <form
            className="channel-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!channelName.trim()) return;
              if (channelProvider === 'webhook') {
                if (!channelUrl.trim()) return;
                createChannel.mutate({
                  provider: 'webhook',
                  name: channelName.trim(),
                  url: channelUrl.trim(),
                  ...(channelSecret ? { secret: channelSecret } : {}),
                  enabled: true,
                  isDefault: true,
                });
              } else if (channelProvider === 'wecom') {
                if (!wecomWebhookUrl.trim()) return;
                createChannel.mutate({
                  provider: 'wecom',
                  name: channelName.trim(),
                  webhookUrl: wecomWebhookUrl.trim(),
                  enabled: true,
                  isDefault: true,
                });
              } else if (channelProvider === 'serverchan') {
                if (!serverchanSendKey.trim()) return;
                createChannel.mutate({
                  provider: 'serverchan',
                  name: channelName.trim(),
                  sendKey: serverchanSendKey.trim(),
                  enabled: true,
                  isDefault: true,
                });
              } else if (channelProvider === 'pushplus') {
                if (!pushplusToken.trim()) return;
                createChannel.mutate({
                  provider: 'pushplus',
                  name: channelName.trim(),
                  token: pushplusToken.trim(),
                  ...(pushplusTopic.trim() ? { topic: pushplusTopic.trim() } : {}),
                  enabled: true,
                  isDefault: true,
                });
              } else {
                if (!telegramBotToken.trim() || !telegramChatId.trim()) return;
                createChannel.mutate({
                  provider: 'telegram',
                  name: channelName.trim(),
                  botToken: telegramBotToken.trim(),
                  chatId: telegramChatId.trim(),
                  enabled: true,
                  isDefault: true,
                });
              }
            }}
          >
            <label>
              类型
              <select
                value={channelProvider}
                onChange={(event) =>
                  setChannelProvider(
                    event.target.value as
                      'telegram' | 'webhook' | 'wecom' | 'serverchan' | 'pushplus',
                  )
                }
              >
                <option value="webhook">Webhook</option>
                <option value="telegram">Telegram</option>
                <option value="wecom">企业微信群机器人</option>
                <option value="serverchan">Server酱（微信推送）</option>
                <option value="pushplus">PushPlus（微信推送）</option>
              </select>
            </label>
            <label>
              名称
              <input
                required
                value={channelName}
                onChange={(event) => setChannelName(event.target.value)}
                placeholder={
                  channelProvider === 'webhook' ? '家庭自动化' : '个人 Telegram'
                }
              />
            </label>
            {channelProvider === 'webhook' ? (
              <>
                <label>
                  URL
                  <input
                    required
                    type="url"
                    value={channelUrl}
                    onChange={(event) => setChannelUrl(event.target.value)}
                    placeholder="https://…"
                  />
                </label>
                <label>
                  签名密钥（可选）
                  <input
                    type="password"
                    value={channelSecret}
                    onChange={(event) => setChannelSecret(event.target.value)}
                  />
                </label>
              </>
            ) : channelProvider === 'wecom' ? (
              <label>
                群机器人 Webhook
                <input
                  required
                  type="url"
                  value={wecomWebhookUrl}
                  onChange={(event) => setWecomWebhookUrl(event.target.value)}
                  placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…"
                />
              </label>
            ) : channelProvider === 'serverchan' ? (
              <label>
                SendKey
                <input
                  required
                  type="password"
                  value={serverchanSendKey}
                  onChange={(event) => setServerchanSendKey(event.target.value)}
                  placeholder="SCT…"
                />
              </label>
            ) : channelProvider === 'pushplus' ? (
              <>
                <label>
                  Token
                  <input
                    required
                    type="password"
                    value={pushplusToken}
                    onChange={(event) => setPushplusToken(event.target.value)}
                  />
                </label>
                <label>
                  Topic（可选）
                  <input
                    value={pushplusTopic}
                    onChange={(event) => setPushplusTopic(event.target.value)}
                    placeholder="留空则发送给 Token 所属账号"
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Bot Token
                  <input
                    required
                    type="password"
                    value={telegramBotToken}
                    onChange={(event) => setTelegramBotToken(event.target.value)}
                  />
                </label>
                <label>
                  Chat ID
                  <input
                    required
                    value={telegramChatId}
                    onChange={(event) => setTelegramChatId(event.target.value)}
                  />
                </label>
              </>
            )}
            <button
              className="primary-action"
              type="submit"
              disabled={createChannel.isPending}
            >
              {createChannel.isPending ? '保存中…' : '保存渠道'}
            </button>
            {channelError && <div className="form-error">{channelError}</div>}
          </form>
        )}
      </section>
    </>
  );
}

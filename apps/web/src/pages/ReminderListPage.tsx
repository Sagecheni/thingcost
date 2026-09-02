import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BellRing, Check, Clock3, Plus, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import type {
  CreateNotificationChannelInput,
  ReminderSummary,
  UpdateNotificationChannelInput,
} from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { ApiClientError, api } from '../lib/api.js';
import { useFreshMark } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { ConfirmDialog } from '../components/ui/confirm-dialog.js';
import { EmptyState } from '../components/ui/empty-state.js';
import {
  FormError,
  FormField,
  FormGrid,
  Panel,
  SelectInput,
  TextInput,
} from '../components/ui/form.js';
import { RuledLines } from '../components/ui/ledger-skeleton.js';
import { PageHeader } from '../components/ui/page-header.js';

type ChannelProvider =
  'telegram' | 'webhook' | 'wecom' | 'serverchan' | 'pushplus' | 'bark';

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

const inlineAction = cn(
  'flex size-7 items-center justify-center border border-border',
  'text-muted-foreground transition duration-150',
  'hover:border-border-strong hover:text-foreground',
);

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div data-slot="card" className="space-y-1 p-4">
      <dt data-slot="ledger-label">{label}</dt>
      <dd data-slot="amount" className="text-xl leading-none font-medium text-heading">
        {value}
      </dd>
    </div>
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
  const [channelProvider, setChannelProvider] = useState<ChannelProvider>('webhook');
  const [channelName, setChannelName] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [channelSecret, setChannelSecret] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [wecomWebhookUrl, setWecomWebhookUrl] = useState('');
  const [serverchanSendKey, setServerchanSendKey] = useState('');
  const [pushplusToken, setPushplusToken] = useState('');
  const [pushplusTopic, setPushplusTopic] = useState('');
  const [barkServerUrl, setBarkServerUrl] = useState('https://api.day.app');
  const [barkDeviceKey, setBarkDeviceKey] = useState('');
  const [barkGroup, setBarkGroup] = useState('');
  const [barkSound, setBarkSound] = useState('');
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelNotice, setChannelNotice] = useState<string | null>(null);
  const [deleteChannel, setDeleteChannel] = useState<{
    id: string;
    name: string;
  } | null>(null);

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
  const updateChannel = useMutation({
    mutationFn: (input: { id: string; values: UpdateNotificationChannelInput }) =>
      api.updateNotificationChannel(input.id, input.values),
    onSuccess: async () => {
      setChannelFormOpen(false);
      setChannelError(null);
      await refresh();
    },
    onError: (error) => {
      setChannelError(error instanceof ApiClientError ? error.message : '渠道更新失败');
    },
  });
  const deleteChannelMutation = useMutation({
    mutationFn: (id: string) => api.deleteNotificationChannel(id),
    onSuccess: async () => {
      setDeleteChannel(null);
      setChannelError(null);
      setChannelNotice('通知渠道已删除');
      await refresh();
    },
    onError: (error) => {
      setChannelError(error instanceof ApiClientError ? error.message : '渠道删除失败');
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
      setBarkServerUrl('https://api.day.app');
      setBarkDeviceKey('');
      setBarkGroup('');
      setBarkSound('');
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
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader
        eyebrow="Time signals"
        title="提醒中心"
        description="保修、维护、归还和任意一件值得记住的事，都在这里留下下一步。"
        actions={
          <Button asChild>
            <Link to="/reminders/new">
              <Plus aria-hidden="true" /> 新建提醒
            </Link>
          </Button>
        }
      />

      <dl className="grid gap-4 sm:grid-cols-3">
        <Reading
          label="当前提醒"
          value={String(reminders.filter((item) => item.status === 'active').length)}
        />
        <Reading label="未来 90 天实例" value={String(upcoming.length)} />
        <Reading label="已配置渠道" value={String(channelsQuery.data?.length ?? 0)} />
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          eyebrow="Upcoming"
          title="即将到期"
          action={<Badge variant="outline">Worker 同步</Badge>}
        >
          {upcoming.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="还没有排到期的提醒"
              description="Worker 会持续把周期规则展开到未来 400 天。"
            />
          ) : (
            <ol className="flex flex-col">
              {upcoming.map((item) => (
                <li
                  className="flex items-center gap-3 border-b border-dashed border-border py-2.5 last:border-0"
                  key={item.id}
                >
                  {/* 日期块：数字大、月份小，扫的时候先看到"几号" */}
                  <span className="flex w-10 shrink-0 flex-col items-center border border-border py-1">
                    <strong
                      data-slot="amount"
                      className="text-base leading-none font-medium text-heading"
                    >
                      {new Date(item.dueAt).getDate()}
                    </strong>
                    <small className="text-[10px] text-muted-foreground">
                      {new Date(item.dueAt).toLocaleDateString('zh-CN', {
                        month: 'short',
                      })}
                    </small>
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      className="block truncate text-sm font-medium text-link hover:underline"
                      to="/reminders/$reminderId"
                      params={{ reminderId: item.reminderId }}
                    >
                      {item.reminder.title}
                    </Link>
                    <p
                      data-slot="amount"
                      className="truncate text-xs text-muted-foreground"
                    >
                      {item.reminder.asset?.name ??
                        item.reminder.subscription?.name ??
                        '全局提醒'}{' '}
                      · {formatDue(item.dueAt, item.reminder.timeZone)}
                    </p>
                  </div>
                  {item.reminder.taskMode === 'actionable' ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        className={inlineAction}
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
                        <Check aria-hidden="true" className="size-3.5" />
                      </button>
                      <button
                        className={inlineAction}
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
                        <Clock3 aria-hidden="true" className="size-3.5" />
                      </button>
                      <button
                        className={inlineAction}
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
                        <X aria-hidden="true" className="size-3.5" />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel
          eyebrow="Reminder rules"
          title="全部提醒"
          description="普通通知发送后自动结束；待确认任务保留处理状态。"
        >
          {remindersQuery.isPending ? <RuledLines count={4} /> : null}
          <FormError>{remindersQuery.error?.message}</FormError>
          {!remindersQuery.isPending && reminders.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title="还没有提醒规则"
              description="把保修、维护或归还日期交给提醒中心。"
            />
          ) : null}
          <ul className="flex flex-col">
            {reminders.map((reminder) => (
              <ReminderRow key={reminder.id} reminder={reminder} />
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        eyebrow="Delivery channels"
        title="通知渠道"
        description="环境变量渠道不会把密钥写入数据库；数据库渠道需要 APP_MASTER_KEY 加密保存。"
        action={
          <Button
            variant="secondary"
            size="sm"
            type="button"
            aria-expanded={channelFormOpen}
            onClick={() => setChannelFormOpen((open) => !open)}
          >
            <Send aria-hidden="true" /> 添加渠道
          </Button>
        }
      >
        {channelNotice ? (
          <p className="border border-success/30 bg-success-subtle px-4 py-3 text-sm text-success">
            {channelNotice}
          </p>
        ) : null}
        <FormError>{channelError}</FormError>

        {(channelsQuery.data ?? []).length === 0 ? (
          <EmptyState
            icon={Send}
            title="还没有通知渠道"
            description="添加一个渠道后，可先发送测试消息确认配置。"
          />
        ) : (
          <ul className="flex flex-col">
            {(channelsQuery.data ?? []).map((channel) => (
              <li
                className="flex flex-wrap items-center gap-3 border-b border-dashed border-border py-2.5 last:border-0"
                key={channel.key}
              >
                <span className="flex size-8 shrink-0 items-center justify-center border border-border text-sm">
                  {channel.provider === 'webhook'
                    ? '↗'
                    : channel.provider === 'wecom'
                      ? '企'
                      : channel.provider === 'serverchan'
                        ? '微'
                        : channel.provider === 'pushplus'
                          ? '推'
                          : channel.provider === 'bark'
                            ? 'B'
                            : '✈'}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-medium text-heading">
                    {channel.name}
                  </strong>
                  <small className="block truncate text-xs text-muted-foreground">
                    {channel.configurationSummary}
                  </small>
                </span>
                <Badge variant="outline">
                  {channel.source === 'environment' ? '环境变量' : '数据库'}
                  {channel.isDefault ? ' · 默认' : ''}
                </Badge>
                {channel.editable && channel.id ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    disabled={updateChannel.isPending}
                    onClick={() => {
                      const name = window.prompt('修改渠道名称', channel.name);
                      if (!name?.trim()) return;
                      if (channel.provider === 'bark') {
                        const deviceKey = window.prompt(
                          '修改 Bark Device Key（留空则保持不变）',
                        );
                        updateChannel.mutate({
                          id: channel.id!,
                          values: {
                            name: name.trim(),
                            enabled: channel.enabled,
                            ...(deviceKey?.trim() ? { deviceKey: deviceKey.trim() } : {}),
                          },
                        });
                      } else if (name.trim() !== channel.name) {
                        updateChannel.mutate({
                          id: channel.id!,
                          values: { name: name.trim(), enabled: channel.enabled },
                        });
                      }
                    }}
                  >
                    编辑
                  </Button>
                ) : null}
                {channel.editable && channel.id ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    aria-label={`删除通知渠道 ${channel.name}`}
                    disabled={deleteChannelMutation.isPending}
                    onClick={() =>
                      setDeleteChannel({ id: channel.id!, name: channel.name })
                    }
                  >
                    <Trash2 aria-hidden="true" className="size-4" /> 删除
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  disabled={testChannel.isPending || !channel.enabled}
                  onClick={() => {
                    setChannelError(null);
                    setChannelNotice(null);
                    testChannel.mutate(channel.key);
                  }}
                >
                  {testChannel.isPending ? '发送中…' : '测试发送'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {channelFormOpen ? (
          <form
            className="flex flex-col gap-3 border-t border-border pt-4"
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
              } else if (channelProvider === 'bark') {
                if (!barkServerUrl.trim() || !barkDeviceKey.trim()) return;
                createChannel.mutate({
                  provider: 'bark',
                  name: channelName.trim(),
                  serverUrl: barkServerUrl.trim(),
                  deviceKey: barkDeviceKey.trim(),
                  ...(barkGroup.trim() ? { group: barkGroup.trim() } : {}),
                  ...(barkSound.trim() ? { sound: barkSound.trim() } : {}),
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
            <FormGrid>
              <FormField label="类型">
                <SelectInput
                  value={channelProvider}
                  onChange={(event) =>
                    setChannelProvider(event.target.value as ChannelProvider)
                  }
                >
                  <option value="webhook">Webhook</option>
                  <option value="telegram">Telegram</option>
                  <option value="wecom">企业微信群机器人</option>
                  <option value="serverchan">Server酱（微信推送）</option>
                  <option value="pushplus">PushPlus（微信推送）</option>
                  <option value="bark">Bark（iOS）</option>
                </SelectInput>
              </FormField>
              <FormField label="名称">
                <TextInput
                  required
                  value={channelName}
                  onChange={(event) => setChannelName(event.target.value)}
                  placeholder={
                    channelProvider === 'webhook' ? '家庭自动化' : '个人 Telegram'
                  }
                />
              </FormField>

              {channelProvider === 'webhook' ? (
                <>
                  <FormField label="URL">
                    <TextInput
                      required
                      type="url"
                      value={channelUrl}
                      onChange={(event) => setChannelUrl(event.target.value)}
                      placeholder="https://…"
                    />
                  </FormField>
                  <FormField label="签名密钥（可选）">
                    <TextInput
                      type="password"
                      value={channelSecret}
                      onChange={(event) => setChannelSecret(event.target.value)}
                    />
                  </FormField>
                </>
              ) : channelProvider === 'wecom' ? (
                <FormField label="群机器人 Webhook" className="sm:col-span-2">
                  <TextInput
                    required
                    type="url"
                    value={wecomWebhookUrl}
                    onChange={(event) => setWecomWebhookUrl(event.target.value)}
                    placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…"
                  />
                </FormField>
              ) : channelProvider === 'serverchan' ? (
                <FormField label="SendKey">
                  <TextInput
                    required
                    type="password"
                    value={serverchanSendKey}
                    onChange={(event) => setServerchanSendKey(event.target.value)}
                    placeholder="SCT…"
                  />
                </FormField>
              ) : channelProvider === 'pushplus' ? (
                <>
                  <FormField label="Token">
                    <TextInput
                      required
                      type="password"
                      value={pushplusToken}
                      onChange={(event) => setPushplusToken(event.target.value)}
                    />
                  </FormField>
                  <FormField label="Topic（可选）">
                    <TextInput
                      value={pushplusTopic}
                      onChange={(event) => setPushplusTopic(event.target.value)}
                      placeholder="留空则发送给 Token 所属账号"
                    />
                  </FormField>
                </>
              ) : channelProvider === 'bark' ? (
                <>
                  <FormField label="Bark 服务地址">
                    <TextInput
                      required
                      type="url"
                      value={barkServerUrl}
                      onChange={(event) => setBarkServerUrl(event.target.value)}
                      placeholder="https://api.day.app"
                    />
                  </FormField>
                  <FormField label="Device Key">
                    <TextInput
                      required
                      type="password"
                      value={barkDeviceKey}
                      onChange={(event) => setBarkDeviceKey(event.target.value)}
                      placeholder="在 Bark App 中复制"
                    />
                  </FormField>
                  <FormField label="分组（可选）">
                    <TextInput
                      value={barkGroup}
                      onChange={(event) => setBarkGroup(event.target.value)}
                      placeholder="例如：物纪"
                    />
                  </FormField>
                  <FormField label="声音（可选）">
                    <TextInput
                      value={barkSound}
                      onChange={(event) => setBarkSound(event.target.value)}
                      placeholder="例如：minuet"
                    />
                  </FormField>
                </>
              ) : (
                <>
                  <FormField label="Bot Token">
                    <TextInput
                      required
                      type="password"
                      value={telegramBotToken}
                      onChange={(event) => setTelegramBotToken(event.target.value)}
                    />
                  </FormField>
                  <FormField label="Chat ID">
                    <TextInput
                      required
                      value={telegramChatId}
                      onChange={(event) => setTelegramChatId(event.target.value)}
                    />
                  </FormField>
                </>
              )}
            </FormGrid>

            <Button className="w-fit" type="submit" disabled={createChannel.isPending}>
              {createChannel.isPending ? '保存中…' : '保存渠道'}
            </Button>
            <FormError>{channelError}</FormError>
          </form>
        ) : null}
      </Panel>

      <ConfirmDialog
        open={deleteChannel !== null}
        title={`删除通知渠道“${deleteChannel?.name ?? ''}”？`}
        description="删除后，使用该渠道的提醒将无法继续通过它发送；历史发送记录会保留。"
        confirmLabel="删除"
        pendingLabel="正在删除…"
        pending={deleteChannelMutation.isPending}
        onCancel={() => setDeleteChannel(null)}
        onConfirm={() => {
          if (deleteChannel) deleteChannelMutation.mutate(deleteChannel.id);
        }}
      />
    </div>
  );
}

/* 新写下的提醒：短暂墨迹未干。 */
function ReminderRow({ reminder }: { reminder: ReminderSummary }) {
  const fresh = useFreshMark(reminder.id);
  return (
    <li>
      <Link
        className={cn(
          'flex items-center gap-3 border-b border-dashed border-border py-2.5 last:border-0 hover:bg-accent',
          fresh && 'fresh-ink',
        )}
        to="/reminders/$reminderId"
        params={{ reminderId: reminder.id }}
      >
        <span
          aria-hidden="true"
          className={cn(
            'w-1 shrink-0 self-stretch',
            reminder.status === 'active' ? 'bg-success' : 'bg-border',
          )}
        />
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-sm font-medium text-heading">
            {reminder.title}
          </strong>
          <small className="block truncate text-xs text-muted-foreground">
            {reminderKindLabel(reminder.kind)} ·{' '}
            {reminder.asset?.name ?? reminder.subscription?.name ?? '全局'} ·{' '}
            {reminder.recurrenceKind === 'recurring'
              ? `每${reminder.recurrenceInterval}${reminder.frequency === 'month' ? '个月' : reminder.frequency === 'week' ? '周' : reminder.frequency === 'year' ? '年' : '天'}`
              : '一次性'}
          </small>
        </span>
        <span data-slot="amount" className="shrink-0 text-xs text-muted-foreground">
          {reminder.nextOccurrenceAt
            ? formatDue(reminder.nextOccurrenceAt, reminder.timeZone)
            : '已展开'}
        </span>
      </Link>
    </li>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Check, Clock3, X } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@thingcost/ui';

import { ApiClientError, api } from '../lib/api.js';
import { markFresh, useFreshMark } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { FormError, Panel } from '../components/ui/form.js';
import { PanelGhost } from '../components/ui/ledger-skeleton.js';

function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function statusLabel(status: string): string {
  return (
    {
      pending: '待处理',
      acknowledged: '已确认',
      dismissed: '已忽略',
      completed: '已完成',
    }[status] ?? status
  );
}

const occurrenceAction = cn(
  'flex size-7 items-center justify-center border border-border',
  'text-muted-foreground transition duration-150',
  'hover:border-border-strong hover:text-foreground',
);

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div data-slot="card" className="space-y-1 p-4">
      <dt data-slot="ledger-label">{label}</dt>
      <dd data-slot="amount" className="text-sm font-medium text-heading">
        {value}
      </dd>
    </div>
  );
}

export function ReminderDetailPage() {
  const { reminderId } = useParams({ from: '/reminders/$reminderId' });
  const queryClient = useQueryClient();
  const reminderQuery = useQuery({
    queryKey: queryKeys.reminder(reminderId),
    queryFn: () => api.reminder(reminderId),
  });
  const [error, setError] = useState<string | null>(null);
  const fresh = useFreshMark(reminderId);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.reminder(reminderId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders }),
      queryClient.invalidateQueries({ queryKey: queryKeys.upcomingReminders }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  const punch = async () => {
    markFresh(reminderId);
    await refresh();
  };
  const action = useMutation({
    mutationFn: (input: {
      occurrenceId: string;
      action: 'acknowledge' | 'dismiss' | 'snooze';
    }) => {
      if (input.action === 'acknowledge')
        return api.acknowledgeReminder(input.occurrenceId);
      if (input.action === 'dismiss') return api.dismissReminder(input.occurrenceId);
      return api.snoozeReminder(input.occurrenceId, 60);
    },
    onSuccess: punch,
    onError: (mutationError) =>
      setError(
        mutationError instanceof ApiClientError
          ? mutationError.message
          : '操作失败，请重试。',
      ),
  });
  const pause = useMutation({
    mutationFn: (status: 'active' | 'paused' | 'archived') =>
      api.updateReminder(reminderId, { status }),
    onSuccess: punch,
    onError: (mutationError) =>
      setError(
        mutationError instanceof ApiClientError
          ? mutationError.message
          : '规则更新失败。',
      ),
  });

  if (reminderQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <PanelGhost lines={5} />
      </div>
    );
  }
  if (reminderQuery.isError) {
    return <FormError>{reminderQuery.error.message}</FormError>;
  }
  const reminder = reminderQuery.data;
  const actionableOccurrences = reminder.occurrences.filter(
    (occurrence) => occurrence.status === 'pending',
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header
        className={cn(
          'flex flex-col gap-3 border-b border-border pb-5',
          fresh && 'fresh-ink',
        )}
      >
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          to="/reminders"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 返回提醒中心
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p data-slot="ledger-label">Reminder rule</p>
            <h1 className="text-2xl font-semibold text-heading">{reminder.title}</h1>
            <p className="text-sm text-muted-foreground">
              {reminder.asset
                ? `关联物品：${reminder.asset.name}`
                : reminder.subscription
                  ? `关联订阅：${reminder.subscription.name}`
                  : '全局提醒'}{' '}
              · {reminder.kind}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={reminder.status === 'active' ? 'success' : 'outline'}>
              {reminder.status === 'active'
                ? '运行中'
                : reminder.status === 'paused'
                  ? '已暂停'
                  : '已归档'}
            </Badge>
            {reminder.status === 'active' ? (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => pause.mutate('paused')}
              >
                暂停规则
              </Button>
            ) : reminder.status === 'paused' ? (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => pause.mutate('active')}
              >
                恢复规则
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <FormError>{error}</FormError>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Reading
          label="下一次"
          value={
            reminder.nextOccurrenceAt
              ? formatDate(reminder.nextOccurrenceAt, reminder.timeZone)
              : '等待 Worker 展开'
          }
        />
        <Reading
          label="提前量"
          value={reminder.leadMinutes
            .map((minutes) =>
              minutes === 0
                ? '到期'
                : `${minutes >= 1_440 ? `${Math.round(minutes / 1_440)} 天` : `${minutes} 分钟`}前`,
            )
            .join('、')}
        />
        <Reading
          label="发送方式"
          value={
            reminder.channelMode === 'none'
              ? '仅站内'
              : reminder.channelMode === 'default'
                ? '全局默认渠道'
                : '指定渠道'
          }
        />
      </dl>

      {reminder.description ? (
        <Panel eyebrow="Context">
          <p className="text-sm text-foreground">{reminder.description}</p>
        </Panel>
      ) : null}

      <Panel
        eyebrow="Occurrence history"
        title="提醒实例"
        action={
          <span data-slot="ledger-label">
            {reminder.taskMode === 'actionable' ? '待确认任务' : '普通通知'}
          </span>
        }
      >
        {reminder.occurrences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Worker 尚未展开实例；规则保存后会在后台生成未来计划。
          </p>
        ) : (
          <ol className="flex flex-col">
            {reminder.occurrences.map((occurrence) => (
              <li
                key={occurrence.id}
                className="flex gap-3 border-b border-dashed border-border py-3 last:border-0"
              >
                {/* 未处理的实例用主色竖条标出来，处理过的退成细线 */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'w-1 shrink-0 self-stretch',
                    occurrence.status === 'pending' ? 'bg-warning' : 'bg-border',
                  )}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <strong
                    data-slot="amount"
                    className="block text-sm font-medium text-heading"
                  >
                    {formatDate(occurrence.dueAt, reminder.timeZone)}
                  </strong>
                  <small className="block text-xs text-muted-foreground">
                    第 {occurrence.sequence + 1} 次 · {statusLabel(occurrence.status)}
                    {occurrence.snoozedUntil
                      ? ` · 稍后至 ${formatDate(occurrence.snoozedUntil, reminder.timeZone)}`
                      : ''}
                  </small>
                  {(occurrence.deliveries ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {(occurrence.deliveries ?? []).map((delivery) => (
                        <span
                          data-slot="amount"
                          className="text-xs text-muted-foreground"
                          key={delivery.id}
                        >
                          {delivery.provider} · {delivery.kind} · {delivery.status}
                          {delivery.attemptCount > 0
                            ? ` · ${delivery.attemptCount}次尝试`
                            : ''}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {reminder.taskMode === 'actionable' && occurrence.status === 'pending' ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      className={occurrenceAction}
                      type="button"
                      title="确认完成"
                      aria-label="确认完成"
                      onClick={() =>
                        action.mutate({
                          occurrenceId: occurrence.id,
                          action: 'acknowledge',
                        })
                      }
                    >
                      <Check aria-hidden="true" className="size-3.5" />
                    </button>
                    <button
                      className={occurrenceAction}
                      type="button"
                      title="稍后提醒一小时"
                      aria-label="稍后提醒一小时"
                      onClick={() =>
                        action.mutate({ occurrenceId: occurrence.id, action: 'snooze' })
                      }
                    >
                      <Clock3 aria-hidden="true" className="size-3.5" />
                    </button>
                    <button
                      className={occurrenceAction}
                      type="button"
                      title="忽略"
                      aria-label="忽略"
                      onClick={() =>
                        action.mutate({
                          occurrenceId: occurrence.id,
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

      {actionableOccurrences.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          处理状态会保留在时间线上；忽略不会删除这条提醒规则。
        </p>
      ) : null}
    </div>
  );
}

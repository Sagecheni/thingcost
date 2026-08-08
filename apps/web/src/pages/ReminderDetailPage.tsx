import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, BellRing, Check, Clock3, Send, X } from 'lucide-react';
import { useState } from 'react';

import { ApiClientError, api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';

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

export function ReminderDetailPage() {
  const { reminderId } = useParams({ from: '/reminders/$reminderId' });
  const queryClient = useQueryClient();
  const reminderQuery = useQuery({
    queryKey: queryKeys.reminder(reminderId),
    queryFn: () => api.reminder(reminderId),
  });
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.reminder(reminderId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders }),
      queryClient.invalidateQueries({ queryKey: queryKeys.upcomingReminders }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
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
    onSuccess: refresh,
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
    onSuccess: refresh,
    onError: (mutationError) =>
      setError(
        mutationError instanceof ApiClientError
          ? mutationError.message
          : '规则更新失败。',
      ),
  });

  if (reminderQuery.isPending) return <div className="page-loading">正在读取提醒…</div>;
  if (reminderQuery.isError)
    return <div className="form-error">{reminderQuery.error.message}</div>;
  const reminder = reminderQuery.data;
  const actionableOccurrences = reminder.occurrences.filter(
    (occurrence) => occurrence.status === 'pending',
  );

  return (
    <>
      <Link className="back-link" to="/reminders">
        <ArrowLeft size={16} /> 返回提醒中心
      </Link>
      <header className="topbar detail-topbar reminder-detail-topbar">
        <div>
          <p className="eyebrow">Reminder rule</p>
          <h1>{reminder.title}</h1>
          <p className="muted-copy">
            {reminder.asset ? `关联物品：${reminder.asset.name}` : '全局提醒'} ·{' '}
            {reminder.kind}
          </p>
        </div>
        <div className="reminder-detail-actions">
          <span className={`status-badge reminder-status-${reminder.status}`}>
            {reminder.status === 'active'
              ? '运行中'
              : reminder.status === 'paused'
                ? '已暂停'
                : '已归档'}
          </span>
          {reminder.status === 'active' ? (
            <button
              className="secondary-action"
              type="button"
              onClick={() => pause.mutate('paused')}
            >
              暂停规则
            </button>
          ) : reminder.status === 'paused' ? (
            <button
              className="secondary-action"
              type="button"
              onClick={() => pause.mutate('active')}
            >
              恢复规则
            </button>
          ) : null}
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}
      <section className="reminder-detail-summary">
        <article>
          <BellRing size={18} />
          <span>下一次</span>
          <strong>
            {reminder.nextOccurrenceAt
              ? formatDate(reminder.nextOccurrenceAt, reminder.timeZone)
              : '等待 Worker 展开'}
          </strong>
        </article>
        <article>
          <Clock3 size={18} />
          <span>提前量</span>
          <strong>
            {reminder.leadMinutes
              .map((minutes) =>
                minutes === 0
                  ? '到期'
                  : `${minutes >= 1_440 ? `${Math.round(minutes / 1_440)} 天` : `${minutes} 分钟`}前`,
              )
              .join('、')}
          </strong>
        </article>
        <article>
          <Send size={18} />
          <span>发送方式</span>
          <strong>
            {reminder.channelMode === 'none'
              ? '仅站内'
              : reminder.channelMode === 'default'
                ? '全局默认渠道'
                : '指定渠道'}
          </strong>
        </article>
      </section>

      {reminder.description && (
        <section className="content-card reminder-description-card">
          <p className="eyebrow">Context</p>
          <p>{reminder.description}</p>
        </section>
      )}

      <section className="content-card occurrence-history-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Occurrence history</p>
            <h2>提醒实例</h2>
          </div>
          <span className="micro-copy">
            {reminder.taskMode === 'actionable' ? '待确认任务' : '普通通知'}
          </span>
        </div>
        {reminder.occurrences.length === 0 ? (
          <p className="muted-copy">
            Worker 尚未展开实例；规则保存后会在后台生成未来计划。
          </p>
        ) : (
          <div className="occurrence-history-list">
            {reminder.occurrences.map((occurrence) => (
              <article
                key={occurrence.id}
                className={`occurrence-row ${occurrence.status}`}
              >
                <div className="occurrence-marker">
                  <span />
                </div>
                <div className="occurrence-main">
                  <strong>{formatDate(occurrence.dueAt, reminder.timeZone)}</strong>
                  <small>
                    第 {occurrence.sequence + 1} 次 · {statusLabel(occurrence.status)}
                    {occurrence.snoozedUntil
                      ? ` · 稍后至 ${formatDate(occurrence.snoozedUntil, reminder.timeZone)}`
                      : ''}
                  </small>
                  <div className="delivery-log">
                    {(occurrence.deliveries ?? []).map((delivery) => (
                      <span key={delivery.id}>
                        {delivery.provider} · {delivery.kind} · {delivery.status}
                        {delivery.attemptCount > 0
                          ? ` · ${delivery.attemptCount}次尝试`
                          : ''}
                      </span>
                    ))}
                  </div>
                </div>
                {reminder.taskMode === 'actionable' &&
                  occurrence.status === 'pending' && (
                    <div className="occurrence-actions">
                      <button
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
                        <Check size={15} />
                      </button>
                      <button
                        type="button"
                        title="稍后提醒一小时"
                        aria-label="稍后提醒一小时"
                        onClick={() =>
                          action.mutate({ occurrenceId: occurrence.id, action: 'snooze' })
                        }
                      >
                        <Clock3 size={15} />
                      </button>
                      <button
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
                        <X size={15} />
                      </button>
                    </div>
                  )}
              </article>
            ))}
          </div>
        )}
      </section>
      {actionableOccurrences.length > 0 && (
        <p className="micro-copy reminder-detail-footnote">
          处理状态会保留在时间线上；忽略不会删除这条提醒规则。
        </p>
      )}
    </>
  );
}

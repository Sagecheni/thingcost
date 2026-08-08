import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpenText, LockKeyhole, Server } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';

export function SetupPage() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('chronicle');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [timeZone, setTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const initialize = useMutation({
    mutationFn: api.initialize,
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.setup, { initialized: true });
      queryClient.setQueryData(queryKeys.session, {
        authenticated: true,
        admin: result.admin,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (password !== confirmation) {
      setLocalError('两次输入的密码不一致');
      return;
    }

    if (password.length < 12) {
      setLocalError('密码至少需要 12 个字符');
      return;
    }

    initialize.mutate({
      username,
      password,
      timeZone,
      baseCurrency: 'CNY',
    });
  };

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand-mark brand-mark-large" aria-hidden="true">
          物
        </div>
        <p className="eyebrow">物纪 · Chronicle</p>
        <h1>建立你的个人器物档案。</h1>
        <p>购入、使用、闲置、维修与告别——从今天起，每件拥有都有一条可以解释的时间线。</p>
        <div className="auth-principles">
          <span>
            <Server size={17} /> 数据留在自己的服务器
          </span>
          <span>
            <LockKeyhole size={17} /> 单管理员登录保护
          </span>
          <span>
            <BookOpenText size={17} /> 关键成本和状态可追溯
          </span>
        </div>
      </section>

      <section className="auth-panel">
        <p className="eyebrow">首次初始化</p>
        <h2>创建管理员</h2>
        <p className="muted-copy">完成后，初始化入口将永久关闭。</p>

        <form className="form-stack" onSubmit={submit}>
          <label>
            管理员名称
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={64}
              required
            />
          </label>
          <label>
            管理员密码
            <input
              autoComplete="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={12}
              required
            />
            <small>至少 12 个字符；物纪不提供邮件找回。</small>
          </label>
          <label>
            再次输入密码
            <input
              autoComplete="new-password"
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={12}
              required
            />
          </label>
          <label>
            应用时区
            <input
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              required
            />
          </label>

          {(localError || initialize.error) && (
            <p className="form-error" role="alert">
              {localError ?? initialize.error?.message}
            </p>
          )}

          <button
            className="primary-action primary-action-wide"
            disabled={initialize.isPending}
          >
            {initialize.isPending ? '正在建立物纪…' : '完成初始化'}
          </button>
        </form>
      </section>
    </main>
  );
}

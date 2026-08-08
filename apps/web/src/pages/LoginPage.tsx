import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';

import { api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';

export function LoginPage() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('chronicle');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: api.login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ username, password });
  };

  return (
    <main className="auth-layout auth-layout-compact">
      <section className="auth-story">
        <div className="brand-mark brand-mark-large" aria-hidden="true">
          物
        </div>
        <p className="eyebrow">物纪 · Chronicle</p>
        <h1>欢迎回来。</h1>
        <p>时间仍在继续，回来看看每件拥有的成本与故事。</p>
      </section>

      <section className="auth-panel">
        <p className="eyebrow">管理员登录</p>
        <h2>打开物纪</h2>
        <form className="form-stack" onSubmit={submit}>
          <label>
            管理员名称
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {login.error && (
            <p className="form-error" role="alert">
              {login.error.message}
            </p>
          )}

          <button
            className="primary-action primary-action-wide"
            disabled={login.isPending}
          >
            {login.isPending ? '正在验证…' : '登录'}
          </button>
        </form>
        <p className="auth-footnote">忘记密码时，请通过容器内 CLI 执行安全重置。</p>
      </section>
    </main>
  );
}

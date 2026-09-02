import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';

import { brand } from '@thingcost/domain';

import { BrandMark } from '../components/BrandMark.js';
import { SealMark } from '../components/SealMark.js';
import { api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from '../components/ui/button.js';
import { FormError, FormField, TextInput } from '../components/ui/form.js';

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-5 py-12">
      <div className="space-y-2">
        <BrandMark className="size-11" />
        <p data-slot="ledger-label">
          {brand.chineseName} · {brand.englishName}
        </p>
        <h1 className="text-2xl font-semibold text-heading">欢迎回来。</h1>
        <p className="text-sm text-muted-foreground">
          时间仍在继续，回来看看每件拥有的成本与故事。
        </p>
      </div>

      <section data-slot="card" className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p data-slot="ledger-label">管理员登录</p>
            <h2 className="text-base font-semibold text-heading">打开物纪</h2>
          </div>
          {/* 门面凭印：登录是当票生效的那一刻 */}
          <SealMark className="mt-0.5" />
        </div>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <FormField label="管理员名称">
            <TextInput
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoFocus
            />
          </FormField>
          <FormField label="密码">
            <TextInput
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </FormField>

          <FormError>{login.error?.message}</FormError>

          <Button className="w-full" disabled={login.isPending}>
            {login.isPending ? '正在验证…' : '登录'}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          忘记密码时，请通过容器内 CLI 执行安全重置。
        </p>
      </section>
    </main>
  );
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpenText, LockKeyhole, Server } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

import { brand } from '@thingcost/domain';

import { BrandMark } from '../components/BrandMark.js';
import { SealMark } from '../components/SealMark.js';
import { api } from '../lib/api.js';
import { currencyLabel, supportedCurrencies } from '../lib/application-settings.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from '../components/ui/button.js';
import { FormError, FormField, SelectInput, TextInput } from '../components/ui/form.js';

function Principle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="shrink-0 text-foreground">{icon}</span>
      {children}
    </li>
  );
}

export function SetupPage() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('chronicle');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [timeZone, setTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
  );
  const [baseCurrency, setBaseCurrency] = useState('CNY');
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
      baseCurrency,
    });
  };

  return (
    <main className="mx-auto grid min-h-screen max-w-4xl items-center gap-8 px-5 py-12 lg:grid-cols-2">
      <section className="space-y-3">
        <BrandMark className="size-11" />
        <p data-slot="ledger-label">
          {brand.chineseName} · {brand.englishName}
        </p>
        <h1 className="text-2xl font-semibold text-heading">建立你的个人器物档案。</h1>
        <p className="text-sm text-muted-foreground">
          购入、使用、闲置、维修与告别——从今天起，每件拥有都有一条可以解释的时间线。
        </p>
        <ul className="flex flex-col gap-2 pt-2">
          <Principle icon={<Server aria-hidden="true" className="size-[17px]" />}>
            数据留在自己的服务器
          </Principle>
          <Principle icon={<LockKeyhole aria-hidden="true" className="size-[17px]" />}>
            单管理员登录保护
          </Principle>
          <Principle icon={<BookOpenText aria-hidden="true" className="size-[17px]" />}>
            关键成本和状态可追溯
          </Principle>
        </ul>
      </section>

      <section data-slot="card" className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p data-slot="ledger-label">首次初始化</p>
            <h2 className="text-base font-semibold text-heading">创建管理员</h2>
            <p className="text-sm text-muted-foreground">
              完成后，初始化入口将永久关闭。
            </p>
          </div>
          {/* 开户立凭：第一张当票从这里盖出去 */}
          <SealMark className="mt-0.5" />
        </div>

        <form className="flex flex-col gap-3" onSubmit={submit}>
          <FormField label="管理员名称">
            <TextInput
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={64}
              required
            />
          </FormField>
          <FormField label="管理员密码" hint="至少 12 个字符；物纪不提供邮件找回。">
            <TextInput
              autoComplete="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={12}
              required
            />
          </FormField>
          <FormField label="再次输入密码">
            <TextInput
              autoComplete="new-password"
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={12}
              required
            />
          </FormField>
          <FormField label="应用时区">
            <TextInput
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              required
            />
          </FormField>
          <FormField
            label="基础币种"
            hint="首笔财务记录产生后将锁定，所有成本会折算到该币种。"
          >
            <SelectInput
              value={baseCurrency}
              onChange={(event) => setBaseCurrency(event.target.value)}
              required
            >
              {supportedCurrencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currencyLabel(currency)}
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormError>{localError ?? initialize.error?.message}</FormError>

          <Button className="w-full" disabled={initialize.isPending}>
            {initialize.isPending ? '正在建立物纪…' : '完成初始化'}
          </Button>
        </form>
      </section>
    </main>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';

import { AppShell } from '../components/AppShell.js';
import { BrandMark } from '../components/BrandMark.js';
import { Button } from '../components/ui/button.js';
import { api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';
import { LoginPage } from './LoginPage.js';
import { SetupPage } from './SetupPage.js';

const centeredScreen =
  'flex min-h-screen flex-col items-center justify-center gap-3 px-5 text-center';

export function RootScreen() {
  const setupQuery = useQuery({
    queryKey: queryKeys.setup,
    queryFn: api.setupStatus,
  });
  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: api.session,
    enabled: setupQuery.data?.initialized === true,
  });
  const settingsQuery = useQuery({
    queryKey: queryKeys.applicationSettings,
    queryFn: api.applicationSettings,
    enabled: sessionQuery.data?.authenticated === true,
  });

  if (
    setupQuery.isPending ||
    (setupQuery.data?.initialized && sessionQuery.isPending) ||
    (sessionQuery.data?.authenticated && settingsQuery.isPending)
  ) {
    return (
      <main className={centeredScreen}>
        <BrandMark className="size-11" />
        <p className="text-sm text-muted-foreground">{'正在打开物纪…'}</p>
      </main>
    );
  }

  if (setupQuery.isError || sessionQuery.isError || settingsQuery.isError) {
    return (
      <main className={centeredScreen}>
        <p data-slot="ledger-label">{'连接失败'}</p>
        <h1 className="text-xl font-semibold text-heading">{'暂时无法连接物纪服务'}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          {'请确认 API 与 PostgreSQL 已启动，然后重试。'}
        </p>
        <Button
          type="button"
          onClick={() => {
            void setupQuery.refetch();
            void sessionQuery.refetch();
            void settingsQuery.refetch();
          }}
        >
          {'重新连接'}
        </Button>
      </main>
    );
  }

  if (!setupQuery.data.initialized) {
    return <SetupPage />;
  }

  if (!sessionQuery.data?.authenticated) {
    return <LoginPage />;
  }

  return (
    <AppShell username={sessionQuery.data.admin?.username ?? '管理员'}>
      <Outlet />
    </AppShell>
  );
}

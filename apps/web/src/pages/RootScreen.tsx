import { useQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';

import { AppShell } from '../components/AppShell.js';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { queryKeys } from '../lib/query-keys.js';
import { LoginPage } from './LoginPage.js';
import { SetupPage } from './SetupPage.js';

export function RootScreen() {
  const { t } = useI18n();
  const setupQuery = useQuery({
    queryKey: queryKeys.setup,
    queryFn: api.setupStatus,
  });
  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: api.session,
    enabled: setupQuery.data?.initialized === true,
  });

  if (setupQuery.isPending || (setupQuery.data?.initialized && sessionQuery.isPending)) {
    return (
      <main className="centered-screen">
        <div className="brand-mark brand-mark-large" aria-hidden="true">
          物
        </div>
        <p>{t('root.loading')}</p>
      </main>
    );
  }

  if (setupQuery.isError || sessionQuery.isError) {
    return (
      <main className="centered-screen">
        <p className="eyebrow">{t('root.connectionFailed')}</p>
        <h1>{t('root.serviceUnavailable')}</h1>
        <p className="muted-copy">{t('root.connectionHelp')}</p>
        <button
          className="primary-action"
          type="button"
          onClick={() => {
            void setupQuery.refetch();
            void sessionQuery.refetch();
          }}
        >
          {t('root.retry')}
        </button>
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

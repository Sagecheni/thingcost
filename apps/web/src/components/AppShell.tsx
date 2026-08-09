import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  Bell,
  CreditCard,
  Database,
  Gauge,
  Heart,
  LogOut,
  Package,
  ScrollText,
  Settings,
  Trash2,
} from 'lucide-react';
import type { PropsWithChildren } from 'react';

import { brand } from '@thingcost/domain';

import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { PixelIcon } from './PixelIcon.js';
import { ThemeToggle } from './ThemeToggle.js';
import { queryKeys } from '../lib/query-keys.js';

interface AppShellProps extends PropsWithChildren {
  username: string;
}

export function AppShell({ children, username }: AppShellProps) {
  const queryClient = useQueryClient();
  const { locale, setLocale, t } = useI18n();
  const currentPathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isRecycleBinRoute = currentPathname.startsWith('/assets/recycle-bin');
  const isDashboardReport = currentPathname === '/';
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });

  return (
    <div className={`app-frame${isDashboardReport ? ' app-frame-dashboard-report' : ''}`}>
      <a className="skip-link" href="#chronicle-main">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <Link className="brand-lockup" to="/" aria-label={t('shell.brandAria')}>
          <span className="brand-mark" aria-hidden="true">
            物
          </span>
          <span>
            <span className="brand-name">{brand.chineseName}</span>
            <span className="brand-english">{brand.englishName}</span>
          </span>
        </Link>

        <nav className="primary-nav" aria-label={t('shell.mainNav')}>
          <Link
            className="nav-item"
            activeProps={{ className: 'nav-item nav-item-active' }}
            activeOptions={{ exact: true }}
            to="/"
          >
            {isDashboardReport ? (
              <Gauge aria-hidden="true" size={19} strokeWidth={1.8} />
            ) : (
              <PixelIcon name="home" size={20} />
            )}
            <span>{t('nav.overview')}</span>
          </Link>
          <Link
            className="nav-item"
            activeProps={{ className: 'nav-item nav-item-active' }}
            activeOptions={{ exact: isRecycleBinRoute }}
            to="/assets"
          >
            {isDashboardReport ? (
              <Package aria-hidden="true" size={19} strokeWidth={1.8} />
            ) : (
              <PixelIcon name="chest" size={20} />
            )}
            <span>{t('nav.assets')}</span>
          </Link>
          <Link
            className="nav-item"
            activeProps={{ className: 'nav-item nav-item-active' }}
            to="/assets/recycle-bin"
          >
            {isDashboardReport ? (
              <Trash2 aria-hidden="true" size={19} strokeWidth={1.8} />
            ) : (
              <PixelIcon name="trash" size={20} />
            )}
            <span>{t('nav.recycleBin')}</span>
          </Link>
          <Link
            className="nav-item"
            activeProps={{ className: 'nav-item nav-item-active' }}
            to="/orders"
          >
            {isDashboardReport ? (
              <ScrollText aria-hidden="true" size={19} strokeWidth={1.8} />
            ) : (
              <PixelIcon name="receipt" size={20} />
            )}
            <span>{t('nav.orders')}</span>
          </Link>
          <Link
            className="nav-item"
            activeProps={{ className: 'nav-item nav-item-active' }}
            to="/wishlist"
          >
            {isDashboardReport ? (
              <Heart aria-hidden="true" size={19} strokeWidth={1.8} />
            ) : (
              <PixelIcon name="leaf" size={20} />
            )}
            <span>{t('nav.wishlist')}</span>
          </Link>
          <Link
            className="nav-item"
            activeProps={{ className: 'nav-item nav-item-active' }}
            to="/subscriptions"
          >
            {isDashboardReport ? (
              <CreditCard aria-hidden="true" size={19} strokeWidth={1.8} />
            ) : (
              <PixelIcon name="coin" size={20} />
            )}
            <span>{t('nav.subscriptions')}</span>
          </Link>
          <Link
            className="nav-item"
            activeProps={{ className: 'nav-item nav-item-active' }}
            to="/reminders"
          >
            {isDashboardReport ? (
              <Bell aria-hidden="true" size={19} strokeWidth={1.8} />
            ) : (
              <PixelIcon name="bell" size={20} />
            )}
            <span>{t('nav.reminders')}</span>
          </Link>
          <Link
            className="nav-item"
            activeProps={{ className: 'nav-item nav-item-active' }}
            to="/data"
          >
            {isDashboardReport ? (
              <Database aria-hidden="true" size={19} strokeWidth={1.8} />
            ) : (
              <PixelIcon name="disk" size={20} />
            )}
            <span>{t('nav.data')}</span>
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-theme-row">
            <span>{t('theme.label')}</span>
            <ThemeToggle report={isDashboardReport} />
          </div>
          <div className="sidebar-locale-row">
            <span>{t('locale.label')}</span>
            <button
              type="button"
              onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
            >
              {locale === 'zh-CN' ? t('locale.en') : t('locale.zh')}
            </button>
          </div>
          <Link
            className="nav-item"
            activeProps={{ className: 'nav-item nav-item-active' }}
            to="/settings"
          >
            {isDashboardReport ? (
              <Settings aria-hidden="true" size={19} strokeWidth={1.8} />
            ) : (
              <PixelIcon name="gear" size={20} />
            )}
            <span>{t('nav.settings')}</span>
          </Link>
          <button
            className="nav-item"
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            {isDashboardReport ? (
              <LogOut aria-hidden="true" size={19} strokeWidth={1.8} />
            ) : (
              <PixelIcon name="door" size={20} />
            )}
            <span>
              {logout.isPending ? t('auth.loggingOut') : t('auth.logout', { username })}
            </span>
          </button>
          <p>{t('shell.milestone')}</p>
        </div>
      </aside>

      <div className="mobile-header">
        <Link className="brand-lockup" to="/">
          <span className="brand-mark" aria-hidden="true">
            物
          </span>
          <span className="brand-name">物纪</span>
        </Link>
        <div className="mobile-actions">
          <nav aria-label={t('shell.mobileNav')}>
            <Link to="/" activeOptions={{ exact: true }}>
              {t('nav.overview')}
            </Link>
            <Link to="/assets">{t('nav.mobileAssets')}</Link>
            <Link to="/orders">{t('nav.mobileOrders')}</Link>
            <Link to="/wishlist">{t('nav.mobileWishlist')}</Link>
            <Link to="/reminders">{t('nav.reminders')}</Link>
            <Link to="/data">{t('nav.mobileData')}</Link>
          </nav>
          <button
            className="locale-toggle"
            type="button"
            onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
            aria-label={t('locale.label')}
          >
            {locale === 'zh-CN' ? 'EN' : '中'}
          </button>
          <ThemeToggle report={isDashboardReport} />
        </div>
      </div>

      <main className="main-content" id="chronicle-main">
        {children}
      </main>
    </div>
  );
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
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
import { cn } from '@thingcost/ui';

import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { queryKeys } from '../lib/query-keys.js';
import { ThemeToggle } from './ThemeToggle.js';
import { Button } from './ui/button.js';

interface AppShellProps extends PropsWithChildren {
  username: string;
}

/* 侧栏条目：选中态是一枚蓝色淡底胶囊，不再用档案页签那条竖线。
 * 基础态带透明边框，这样选中时加边框不会让条目变宽。 */
const navItem = cn(
  'flex h-10 items-center gap-3 rounded-sm border border-transparent px-3',
  'text-sm text-muted-foreground transition duration-200',
  'hover:bg-accent hover:text-foreground',
  '[&_svg]:size-[18px] [&_svg]:shrink-0',
);
const navItemActive = cn(
  navItem,
  'border border-link/20 bg-link/10 font-medium text-link hover:bg-link/15 hover:text-link',
);

const primaryNav = [
  { icon: Gauge, key: 'nav.overview', to: '/' },
  { icon: Package, key: 'nav.assets', to: '/assets' },
  { icon: Trash2, key: 'nav.recycleBin', to: '/assets/recycle-bin' },
  { icon: ScrollText, key: 'nav.orders', to: '/orders' },
  { icon: Heart, key: 'nav.wishlist', to: '/wishlist' },
  { icon: CreditCard, key: 'nav.subscriptions', to: '/subscriptions' },
  { icon: Bell, key: 'nav.reminders', to: '/reminders' },
  { icon: Database, key: 'nav.data', to: '/data' },
] as const;

const mobileNav = [
  { key: 'nav.overview', to: '/' },
  { key: 'nav.mobileAssets', to: '/assets' },
  { key: 'nav.mobileOrders', to: '/orders' },
  { key: 'nav.mobileWishlist', to: '/wishlist' },
  { key: 'nav.reminders', to: '/reminders' },
  { key: 'nav.mobileData', to: '/data' },
] as const;

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-sm',
        'bg-primary text-sm font-medium text-primary-foreground',
      )}
    >
      物
    </span>
  );
}

export function AppShell({ children, username }: AppShellProps) {
  const queryClient = useQueryClient();
  const { locale, setLocale, t } = useI18n();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
  const toggleLocale = () => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN');

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[240px_1fr]">
      <a
        className={cn(
          'sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50',
          'focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm',
          'focus:ring-2 focus:ring-ring',
        )}
        href="#chronicle-main"
      >
        跳到主要内容
      </a>

      {/* 桌面侧栏 */}
      <aside
        className={cn(
          'hidden border-r border-border bg-background-soft/70 backdrop-blur-md lg:flex',
          'lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:gap-6 lg:px-3 lg:py-5',
        )}
      >
        <Link className="flex items-center gap-2.5 px-0.5" to="/" aria-label={t('shell.brandAria')}>
          <BrandMark />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {brand.chineseName}
            </span>
            <span className="block truncate text-xs tracking-[0.08em] text-muted-foreground">
              {brand.englishName}
            </span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5" aria-label={t('shell.mainNav')}>
          {primaryNav.map(({ icon: Icon, key, to }) => (
            <Link
              key={to}
              className={navItem}
              activeProps={{ className: navItemActive }}
              /* 总览只在精确匹配时高亮；物品列表不能被回收站子路由点亮。
               * exactOptionalPropertyTypes 下不能显式传 undefined，只能整个属性省掉。 */
              {...(to === '/' || to === '/assets'
                ? { activeOptions: { exact: true } }
                : {})}
              to={to}
            >
              <Icon aria-hidden="true" strokeWidth={1.8} />
              <span className="truncate">{t(key)}</span>
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-0.5 border-t border-border pt-4">
          <div className="flex h-9 items-center justify-between pr-1 pl-3">
            <span className="text-xs text-muted-foreground">{t('theme.label')}</span>
            <ThemeToggle />
          </div>
          <div className="flex h-9 items-center justify-between pr-1 pl-3">
            <span className="text-xs text-muted-foreground">{t('locale.label')}</span>
            <Button variant="ghost" size="sm" type="button" onClick={toggleLocale}>
              {locale === 'zh-CN' ? t('locale.en') : t('locale.zh')}
            </Button>
          </div>

          <Link className={navItem} activeProps={{ className: navItemActive }} to="/settings">
            <Settings aria-hidden="true" strokeWidth={1.8} />
            <span className="truncate">{t('nav.settings')}</span>
          </Link>
          <button
            className={cn(navItem, 'disabled:opacity-45')}
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut aria-hidden="true" strokeWidth={1.8} />
            <span className="truncate">
              {logout.isPending ? t('auth.loggingOut') : t('auth.logout', { username })}
            </span>
          </button>
          <p className="px-3 pt-2 text-xs text-muted-foreground">{t('shell.milestone')}</p>
        </div>
      </aside>

      {/* 移动端顶栏：同一套导航压成可横向滚动的一行 */}
      <header
        className={cn(
          'sticky top-0 z-30 flex flex-col gap-2 border-b border-border',
          'bg-background/95 px-4 py-3 backdrop-blur lg:hidden',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <Link className="flex items-center gap-2" to="/">
            <BrandMark />
            <span className="text-sm font-semibold text-foreground">
              {brand.chineseName}
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={toggleLocale}
              aria-label={t('locale.label')}
            >
              {locale === 'zh-CN' ? 'EN' : '中'}
            </Button>
            <ThemeToggle />
          </div>
        </div>
        <nav
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5"
          aria-label={t('shell.mobileNav')}
        >
          {mobileNav.map(({ key, to }) => (
            <Link
              key={to}
              className={cn(
                'shrink-0 rounded-full border border-transparent px-3 py-1.5 text-sm whitespace-nowrap',
                'text-muted-foreground transition duration-200 hover:bg-accent',
              )}
              activeProps={{
                className: 'border-link/20 bg-link/10 font-medium text-link',
              }}
              {...(to === '/' || to === '/assets'
                ? { activeOptions: { exact: true } }
                : {})}
              to={to}
            >
              {t(key)}
            </Link>
          ))}
        </nav>
      </header>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8" id="chronicle-main">
        {children}
      </main>
    </div>
  );
}

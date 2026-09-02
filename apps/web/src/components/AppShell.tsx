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
import { ganZhiYear } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';
import { BrandMark } from './BrandMark.js';
import { StyleToggle } from './StyleToggle.js';
import { ThemeToggle } from './ThemeToggle.js';

interface AppShellProps extends PropsWithChildren {
  username: string;
}

/* 侧栏条目：选中态是一块盖在纸上的墨，不是胶囊。
 * 基础态带透明边框，这样选中时加边框不会让条目变宽。 */
const navItem = cn(
  'flex h-10 items-center gap-3 border border-transparent px-3',
  'text-sm text-muted-foreground transition duration-150',
  'hover:bg-accent hover:text-foreground',
  '[&_svg]:size-[18px] [&_svg]:shrink-0',
);
const navItemActive = cn(
  navItem,
  'border-border-strong bg-secondary font-medium text-heading',
  'hover:bg-secondary hover:text-heading',
);

const primaryNav = [
  { icon: Gauge, label: '总览', to: '/' },
  { icon: Package, label: '全部物品', to: '/assets' },
  { icon: Trash2, label: '回收站', to: '/assets/recycle-bin' },
  { icon: ScrollText, label: '购买订单', to: '/orders' },
  { icon: Heart, label: '种草清单', to: '/wishlist' },
  { icon: CreditCard, label: '订阅许可', to: '/subscriptions' },
  { icon: Bell, label: '提醒', to: '/reminders' },
  { icon: Database, label: '数据与备份', to: '/data' },
] as const;

/* 移动端导航覆盖与桌面侧栏同一套入口：哪个都不能在手机上缺席。 */
const mobileNav = [
  { label: '总览', to: '/' },
  { label: '物品', to: '/assets' },
  { label: '回收站', to: '/assets/recycle-bin' },
  { label: '订单', to: '/orders' },
  { label: '种草', to: '/wishlist' },
  { label: '订阅', to: '/subscriptions' },
  { label: '提醒', to: '/reminders' },
  { label: '数据', to: '/data' },
  { label: '设置', to: '/settings' },
] as const;

export function AppShell({ children, username }: AppShellProps) {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[240px_1fr]">
      <a
        className={cn(
          'sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50',
          'focus:bg-card focus:px-3 focus:py-2 focus:text-sm',
          'focus:ring-2 focus:ring-ring',
        )}
        href="#chronicle-main"
      >
        跳到主要内容
      </a>

      {/* 桌面侧栏 */}
      <aside
        className={cn(
          'hidden border-r border-border bg-background-soft lg:flex',
          'lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:gap-6 lg:px-3 lg:py-5',
        )}
      >
        <Link className="flex items-center gap-2.5 px-0.5" to="/" aria-label="物纪总览">
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

        <nav className="flex flex-1 flex-col gap-0.5" aria-label="主导航">
          {primaryNav.map(({ icon: Icon, label, to }) => (
            <Link
              key={to}
              className={navItem}
              activeProps={{ className: navItemActive }}
              /* 总览与物品列表只在精确匹配时高亮，子路由不点亮。 */
              {...(to === '/' || to === '/assets'
                ? { activeOptions: { exact: true } }
                : {})}
              to={to}
            >
              <Icon aria-hidden="true" strokeWidth={1.8} />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-0.5 border-t border-border pt-4">
          <div className="flex h-9 items-center justify-between pr-1 pl-3">
            <span className="text-xs text-muted-foreground">界面主题</span>
            <ThemeToggle />
          </div>
          <div className="flex h-9 items-center justify-between pr-1 pl-3">
            <span className="text-xs text-muted-foreground">档案载体</span>
            <StyleToggle />
          </div>

          <Link
            className={navItem}
            activeProps={{ className: navItemActive }}
            to="/settings"
          >
            <Settings aria-hidden="true" strokeWidth={1.8} />
            <span className="truncate">设置</span>
          </Link>
          <button
            className={cn(navItem, 'disabled:opacity-45')}
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut aria-hidden="true" strokeWidth={1.8} />
            <span className="truncate">
              {logout.isPending ? '正在退出…' : `退出 ${username}`}
            </span>
          </button>

          {/* 票角落款：干支纪年（以公历年计，不做立春换年） */}
          <p className="px-3 pt-3 font-serif text-[11px] tracking-[0.2em] text-muted-foreground">
            {'岁在'}
            {ganZhiYear(new Date().getFullYear())}
          </p>
        </div>
      </aside>

      {/* 移动端顶栏：同一套导航压成可横向滚动的一行 */}
      <header
        className={cn(
          'sticky top-0 z-30 flex flex-col gap-2 border-b border-border',
          'bg-background px-4 py-3 lg:hidden',
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
            {/* 触控目标按自己的无障碍承诺给到 44px */}
            <StyleToggle className="size-11" />
            <ThemeToggle className="size-11" />
          </div>
        </div>
        <nav
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5"
          aria-label="手机主导航"
        >
          {mobileNav.map(({ label, to }) => (
            <Link
              key={to}
              className={cn(
                'shrink-0 border border-transparent px-3 py-1.5 text-sm whitespace-nowrap',
                'text-muted-foreground transition duration-150 hover:bg-accent',
              )}
              activeProps={{
                className: 'border-border-strong bg-secondary font-medium text-heading',
              }}
              {...(to === '/' || to === '/assets'
                ? { activeOptions: { exact: true } }
                : {})}
              to={to}
            >
              {label}
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

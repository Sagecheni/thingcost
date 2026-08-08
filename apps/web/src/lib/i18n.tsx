import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

export const supportedLocales = ['zh-CN', 'en-US'] as const;
export type Locale = (typeof supportedLocales)[number];

const localeStorageKey = 'chronicle-locale';

const messages = {
  'zh-CN': {
    'nav.overview': '总览',
    'nav.assets': '全部物品',
    'nav.recycleBin': '回收站',
    'nav.orders': '购买订单',
    'nav.wishlist': '种草清单',
    'nav.subscriptions': '订阅许可',
    'nav.reminders': '提醒',
    'nav.data': '数据与备份',
    'nav.settings': '设置',
    'nav.mobileAssets': '物品',
    'nav.mobileOrders': '订单',
    'nav.mobileWishlist': '种草',
    'nav.mobileData': '数据',
    'theme.label': '界面主题',
    'theme.system': '跟随系统',
    'theme.light': '浅色主题',
    'theme.dark': '深色主题',
    'theme.switch': '点击切换主题',
    'locale.label': '语言',
    'locale.zh': '中文',
    'locale.en': 'English',
    'auth.loggingOut': '正在退出…',
    'auth.logout': '退出 {username}',
    'shell.milestone': 'Milestone 4 · 心愿与决策',
    'shell.brandAria': '物纪总览',
    'shell.mainNav': '主导航',
    'shell.mobileNav': '手机主导航',
    'root.loading': '正在打开物纪…',
    'root.connectionFailed': '连接失败',
    'root.serviceUnavailable': '暂时无法连接物纪服务',
    'root.connectionHelp': '请确认 API 与 PostgreSQL 已启动，然后重试。',
    'root.retry': '重新连接',
  },
  'en-US': {
    'nav.overview': 'Overview',
    'nav.assets': 'All items',
    'nav.recycleBin': 'Recycle bin',
    'nav.orders': 'Purchase orders',
    'nav.wishlist': 'Wishlist',
    'nav.subscriptions': 'Subscriptions',
    'nav.reminders': 'Reminders',
    'nav.data': 'Data & backup',
    'nav.settings': 'Settings',
    'nav.mobileAssets': 'Items',
    'nav.mobileOrders': 'Orders',
    'nav.mobileWishlist': 'Wishlist',
    'nav.mobileData': 'Data',
    'theme.label': 'Theme',
    'theme.system': 'System',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.switch': 'Switch theme',
    'locale.label': 'Language',
    'locale.zh': '中文',
    'locale.en': 'English',
    'auth.loggingOut': 'Signing out…',
    'auth.logout': 'Sign out {username}',
    'shell.milestone': 'Milestone 4 · Decisions & ownership',
    'shell.brandAria': 'Chronicle overview',
    'shell.mainNav': 'Main navigation',
    'shell.mobileNav': 'Mobile navigation',
    'root.loading': 'Opening Chronicle…',
    'root.connectionFailed': 'Connection failed',
    'root.serviceUnavailable': 'Chronicle is temporarily unavailable',
    'root.connectionHelp':
      'Make sure the API and PostgreSQL are running, then try again.',
    'root.retry': 'Retry connection',
  },
} as const;

export type MessageKey = keyof (typeof messages)['zh-CN'];

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Record<string, string>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN';
  const stored = window.localStorage.getItem(localeStorageKey);
  if (supportedLocales.includes(stored as Locale)) return stored as Locale;
  return 'zh-CN';
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(getStoredLocale);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(localeStorageKey, next);
    document.documentElement.lang = next;
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => {
        let message: string = messages[locale][key] ?? messages['zh-CN'][key] ?? key;
        for (const [name, replacement] of Object.entries(values ?? {})) {
          message = message.replace(`{${name}}`, replacement);
        }
        return message;
      },
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider.');
  return context;
}

export function localeForIntl(): Locale {
  return getStoredLocale();
}

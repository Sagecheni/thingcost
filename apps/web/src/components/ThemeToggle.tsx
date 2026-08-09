import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { PixelIcon, type PixelIconName } from './PixelIcon.js';

import { useI18n } from '../lib/i18n.js';

const themes = ['system', 'light', 'dark'] as const;
type Theme = (typeof themes)[number];

const themeMetadata = {
  system: { icon: 'screen', key: 'theme.system' },
  light: { icon: 'sun', key: 'theme.light' },
  dark: { icon: 'moon', key: 'theme.dark' },
} as const satisfies Record<Theme, { icon: PixelIconName; key: string }>;

function storedTheme(): Theme {
  const value = window.localStorage.getItem('chronicle-theme');
  return themes.includes(value as Theme) ? (value as Theme) : 'system';
}

export function ThemeToggle({ report = false }: { report?: boolean }) {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const { t } = useI18n();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('chronicle-theme', theme);
  }, [theme]);

  const metadata = themeMetadata[theme];
  const label = t(metadata.key);
  const ReportIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <button
      className="theme-toggle"
      type="button"
      title={label}
      aria-label={`${label}，${t('theme.switch')}`}
      onClick={() => {
        const index = themes.indexOf(theme);
        setTheme(themes[(index + 1) % themes.length] ?? 'system');
      }}
    >
      {report ? (
        <ReportIcon aria-hidden="true" size={17} strokeWidth={1.8} />
      ) : (
        <PixelIcon name={metadata.icon} size={18} />
      )}
    </button>
  );
}

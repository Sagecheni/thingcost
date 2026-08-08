import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useI18n } from '../lib/i18n.js';

const themes = ['system', 'light', 'dark'] as const;
type Theme = (typeof themes)[number];

const themeMetadata = {
  system: { icon: Monitor, key: 'theme.system' },
  light: { icon: Sun, key: 'theme.light' },
  dark: { icon: Moon, key: 'theme.dark' },
} as const;

function storedTheme(): Theme {
  const value = window.localStorage.getItem('chronicle-theme');
  return themes.includes(value as Theme) ? (value as Theme) : 'system';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const { t } = useI18n();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('chronicle-theme', theme);
  }, [theme]);

  const metadata = themeMetadata[theme];
  const Icon = metadata.icon;
  const label = t(metadata.key);

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
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}

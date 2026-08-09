import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useI18n } from '../lib/i18n.js';
import { Button } from './ui/button.js';

const themes = ['system', 'light', 'dark'] as const;
type Theme = (typeof themes)[number];

const themeMetadata = {
  system: { Icon: Monitor, key: 'theme.system' },
  light: { Icon: Sun, key: 'theme.light' },
  dark: { Icon: Moon, key: 'theme.dark' },
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

  const { Icon, key } = themeMetadata[theme];
  const label = t(key);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      type="button"
      title={label}
      aria-label={`${label}，${t('theme.switch')}`}
      onClick={() => {
        const index = themes.indexOf(theme);
        setTheme(themes[(index + 1) % themes.length] ?? 'system');
      }}
    >
      <Icon aria-hidden="true" strokeWidth={1.8} />
    </Button>
  );
}

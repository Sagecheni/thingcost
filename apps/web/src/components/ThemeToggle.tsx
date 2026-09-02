import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from './ui/button.js';

const themes = ['system', 'light', 'dark'] as const;
type Theme = (typeof themes)[number];

const themeMetadata = {
  system: { Icon: Monitor, label: '跟随系统' },
  light: { Icon: Sun, label: '浅色主题' },
  dark: { Icon: Moon, label: '深色主题' },
} as const;

function storedTheme(): Theme {
  const value = window.localStorage.getItem('chronicle-theme');
  return themes.includes(value as Theme) ? (value as Theme) : 'system';
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('chronicle-theme', theme);
  }, [theme]);

  const { Icon, label } = themeMetadata[theme];

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      type="button"
      className={className}
      title={label}
      aria-label={`${label}，点击切换主题`}
      onClick={() => {
        const index = themes.indexOf(theme);
        setTheme(themes[(index + 1) % themes.length] ?? 'system');
      }}
    >
      <Icon aria-hidden="true" strokeWidth={1.8} />
    </Button>
  );
}

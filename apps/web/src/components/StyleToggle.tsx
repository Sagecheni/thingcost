import { DraftingCompass, Receipt } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from './ui/button.js';

/* 档案载体，与明暗主题正交。
 *   ticket    当票 —— 正联（宣纸白）/ 碑拓（墨底拓白）
 *   indigo    蓝印底册 —— 正联（白底靛蓝线）/ 蓝靛（深靛蓝底白线）
 *
 * 每条谱系自带正负片，明暗由 ThemeToggle 单独控制，两者互不干扰。 */
const styles = ['ticket', 'indigo'] as const;
type ArchiveStyle = (typeof styles)[number];

const styleMetadata = {
  ticket: { Icon: Receipt, label: '当票' },
  indigo: { Icon: DraftingCompass, label: '蓝印底册' },
} as const;

export const styleStorageKey = 'chronicle-style';

function storedStyle(): ArchiveStyle {
  const value = window.localStorage.getItem(styleStorageKey);
  return styles.includes(value as ArchiveStyle) ? (value as ArchiveStyle) : 'ticket';
}

export function StyleToggle({ className }: { className?: string }) {
  const [style, setStyle] = useState<ArchiveStyle>(storedStyle);

  useEffect(() => {
    document.documentElement.dataset.style = style;
    window.localStorage.setItem(styleStorageKey, style);
  }, [style]);

  const { Icon, label } = styleMetadata[style];

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      type="button"
      className={className}
      title={label}
      aria-label={`${label}，点击切换档案载体`}
      onClick={() => {
        const index = styles.indexOf(style);
        setStyle(styles[(index + 1) % styles.length] ?? 'ticket');
      }}
    >
      <Icon aria-hidden="true" strokeWidth={1.8} />
    </Button>
  );
}

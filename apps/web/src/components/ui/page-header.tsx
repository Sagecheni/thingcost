import type { ReactNode } from 'react';

import { cn } from '@thingcost/ui';

/* 页头：眉标 + 标题 + 说明 + 右侧操作，底部一条暖线收口。
 * 替换遗留的 .topbar / .page-topbar / .eyebrow / .muted-copy 组合。 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        'flex flex-col gap-4 border-b border-border pb-5',
        'sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          /* 中文眉标用正字距（永远不用负值），小字号 + 弱色 */
          <p className="text-xs tracking-[0.08em] text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

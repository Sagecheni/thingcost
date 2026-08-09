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
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          /* 胶囊眉标：淡蓝底 + 亮蓝字。中文用正字距，永远不用负值 */
          <p
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-link/20',
              'bg-link/10 px-3 py-1 text-xs tracking-[0.08em] text-link',
            )}
          >
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold text-heading">{title}</h1>
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

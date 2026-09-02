import type { ReactNode } from 'react';

import { cn } from '@thingcost/ui';

/* 页头：眉批 + 标题 + 说明 + 右侧操作，底部一条规则线收口。
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
          /* 页眉眉批：小号等宽 + 字距，账本页眉的写法。
           * 中文用正字距，永远不用负值。 */
          <p data-slot="ledger-label">{eyebrow}</p>
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

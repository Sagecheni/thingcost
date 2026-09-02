import type { ComponentType, ReactNode } from 'react';

import { cn } from '@thingcost/ui';

import { SealMark } from '../SealMark.js';

/* 空状态：一格空的档案格。虚线边框表示"这里本该有东西"，
 * 而不是用插画或表情占位。
 * 图标下压一枚淡出的朱砂印——空柜格里还留着上一张票根的痕迹，
 * 等着被重新盖上。 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        'border border-dashed border-border bg-muted/35 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="relative flex items-center justify-center">
        <SealMark className="size-12 rotate-[7deg] opacity-[0.16]" />
        {Icon ? (
          <Icon className="absolute size-5 text-muted-foreground" aria-hidden />
        ) : null}
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

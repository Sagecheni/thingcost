import type { ComponentType, ReactNode } from 'react';

import { cn } from '@thingcost/ui';

/* 空状态：一格空的档案格。虚线边框表示"这里本该有东西"，
 * 而不是用插画或表情占位。 */
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
        'flex flex-col items-center justify-center gap-3 rounded-md',
        'border border-dashed border-border bg-muted/35 px-6 py-12 text-center',
        className,
      )}
    >
      {Icon ? <Icon className="size-6 text-muted-foreground" aria-hidden /> : null}
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

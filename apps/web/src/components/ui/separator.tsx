import type { ComponentProps } from 'react';

import { cn } from '@thingcost/ui';

/* 1px 暖线。档案界面的分层主要靠它和留白，而不是阴影。 */
export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: ComponentProps<'div'> & { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      data-slot="separator"
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

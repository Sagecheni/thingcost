import type { ComponentProps } from 'react';

import { cn } from '@thingcost/ui';

/* 玻璃卡片：半透明底 + 背景模糊，浮在页面的渐变晕染之上。
 *
 * interactive 只给可点击的卡片（整块是链接的那种）——
 * 静态面板不做 hover 上浮，否则会暗示它可以点。 */
export function Card({
  className,
  elevated = false,
  interactive = false,
  ...props
}: ComponentProps<'div'> & { elevated?: boolean; interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-md border border-border bg-card text-card-foreground backdrop-blur-md',
        elevated ? 'shadow-raised' : 'shadow-paper',
        interactive &&
          'transition duration-200 hover:-translate-y-0.5 hover:border-ring/55 hover:shadow-raised',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1 px-5 pt-5 pb-4', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return (
    <h3
      data-slot="card-title"
      className={cn('text-base leading-snug font-semibold', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/* 卡片头部右上角的操作区 */
export function CardAction({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('flex items-center gap-2', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('px-5 pb-5', className)} {...props} />
  );
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center gap-2 border-t border-border px-5 py-4',
        className,
      )}
      {...props}
    />
  );
}

import type { ComponentProps } from 'react';

import { cn } from '@thingcost/ui';

import { SealMark } from '../SealMark.js';

/* 纸面。材质（边框、顶边粗规则线、直角、hover 行为）全部由 theme.css 的
 * [data-slot='card'] 提供 —— 这里只管布局和文字色，换档案载体时组件不动。
 *
 * interactive 只给可点击的卡片（整块是链接的那种）：hover 压一道内描边。
 * 静态面板不做任何 hover 反馈，否则会暗示它可以点。 */
export function Card({
  className,
  interactive = false,
  ...props
}: ComponentProps<'div'> & { interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      {...(interactive ? { 'data-interactive': 'true' } : {})}
      className={cn('text-card-foreground', className)}
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

/* 骑缝线：存根与票根之间那道撕口。两端的半圆咬进页面底色，
 * 所以 theme.css 里它的填充用 --background 而不是 --card。
 * 只在整张卡就是一张存根时使用（物品卡），面板不用。
 * sealed 时跨缝压半枚朱砂印——另半枚留在撕走的票根上。 */
export function CardPerforation({
  className,
  sealed = false,
  ...props
}: ComponentProps<'div'> & { sealed?: boolean }) {
  return (
    <div data-slot="perforation" aria-hidden="true" className={className} {...props}>
      {sealed ? (
        <span
          className="absolute top-1/2 h-8 w-4 -translate-y-1/2 overflow-hidden"
          style={{ left: '62%' }}
        >
          <SealMark className="size-8" />
        </span>
      ) : null}
    </div>
  );
}

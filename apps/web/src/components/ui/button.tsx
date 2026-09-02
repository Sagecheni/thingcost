import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@thingcost/ui';

/* 按钮是盖在纸上的一块墨，不浮起。
 * 直角由 theme.css 的 [data-slot='button'] 提供；这里没有阴影、
 * 没有 hover 位移 —— 只有颜色变化。
 * 焦点环与填写栏同一语法：2px 直角外描边（theme.css 全局 :focus-visible），
 * 不用圆角时代留下的 offset 白圈。 */
const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-2',
    'font-medium whitespace-nowrap transition duration-150',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:pointer-events-none',
  ),
  {
    variants: {
      variant: {
        /* 主操作：实心墨块 */
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        /* 次操作：纸底 + 描边，hover 时边框转深 */
        secondary:
          'border border-border bg-card text-foreground hover:border-border-strong hover:bg-accent',
        /* 无边框，用于工具栏和图标 */
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        /* 破坏性操作永远显式，不用 ghost 藏起来 */
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-110',
        link: 'text-link underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-10 px-4 text-sm',
        /* 移动端主操作用 lg，保证 44px 触控目标 */
        lg: 'h-11 px-6 text-sm',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };

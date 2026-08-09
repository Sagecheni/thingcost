import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@thingcost/ui';

/* 档案风按钮：纸面上的一块墨，不浮起。
 * 没有阴影、没有 hover 位移 —— 只有颜色变化。 */
const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md',
    'font-medium whitespace-nowrap transition-colors duration-150',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:pointer-events-none',
  ),
  {
    variants: {
      variant: {
        /* 主操作：实心墨青 */
        default: 'bg-primary text-primary-foreground hover:bg-primary/88',
        /* 次操作：白纸 + 暖边框，档案里最常见的一种 */
        secondary:
          'border border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground',
        /* 无边框，用于工具栏和图标 */
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        /* 破坏性操作永远显式，不用 ghost 藏起来 */
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/88',
        link: 'text-primary underline-offset-4 hover:underline',
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

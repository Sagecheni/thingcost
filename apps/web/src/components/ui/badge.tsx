import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@thingcost/ui';

/* 胶囊徽章：淡底 + 同色文字 + 细边。
 * 语义永远由文字承担，颜色只是辅助 —— 产品要求状态不能只靠颜色表达。 */
const badgeVariants = cva(
  cn(
    'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border',
    'px-2.5 py-0.5 text-xs leading-tight font-medium whitespace-nowrap',
    '[&_svg]:size-3 [&_svg]:shrink-0 [&_svg]:pointer-events-none',
  ),
  {
    variants: {
      variant: {
        default: 'border-border-soft bg-secondary text-secondary-foreground',
        primary: 'border-link/25 bg-link/10 text-link',
        success: 'border-success/25 bg-success-subtle text-success',
        warning: 'border-warning/25 bg-warning-subtle text-warning',
        destructive: 'border-destructive/25 bg-destructive-subtle text-destructive',
        /* 纯描边，用于中性计数 */
        outline: 'border-border bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'span';
  return (
    <Component
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { badgeVariants };

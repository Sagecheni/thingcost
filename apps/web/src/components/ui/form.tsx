import type { ComponentProps, ReactNode } from 'react';

import { ChevronDown } from 'lucide-react';

import { cn } from '@thingcost/ui';

/* 填写栏基元。
 *
 * 材质（边框、直角、底色、焦点框）由 theme.css 的 [data-slot='field'] 提供，
 * 这里只补布局和尺寸。每个原生控件都要带 data-slot="field" —— 那个选择器
 * 同时还负责压掉 legacy 层裸元素选择器铺的像素时代凹槽。
 *
 * 账本里的填写栏是"划出来的一格"，不是浮起来的输入框：标签在框外，
 * 框本身没有圆角也没有阴影。 */

const controlBase = 'w-full text-sm text-foreground focus-visible:outline-none';
const controlHeight = 'h-9 px-2.5';

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="field"
      className={cn(controlBase, controlHeight, className)}
      {...props}
    />
  );
}

/* 下拉填写栏：系统自带的灰色箭头不是这本账的语法，
 * 换成一只墨色小三角，与填写栏一致。 */
export function SelectInput({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <span className="relative block">
      <select
        data-slot="field"
        className={cn(controlBase, controlHeight, 'appearance-none pr-8', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}

export function TextArea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="field"
      className={cn(controlBase, 'px-2.5 py-2', className)}
      {...props}
    />
  );
}

/* 带前缀的填写栏（币种符号、搜索图标）。
 * 外层承担边框和底色，里面的原生控件被 theme.css 抹成透明无边。 */
export function FieldGroup({ className, children, ...props }: ComponentProps<'label'>) {
  return (
    <label
      data-slot="field"
      className={cn('flex items-center gap-2', controlHeight, className)}
      {...props}
    >
      {children}
    </label>
  );
}

/* 标签在框外，控件嵌在 label 里靠隐式关联 —— 这一套控件都是单个原生元素。
 * hint 用于写口径说明：计算口径透明是产品原则，需要解释的字段就该带一句，
 * 而不是等用户猜。 */
export function FormField({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/* 同样的标签排版，但外层是 div —— 内容不是单个可关联控件时用它
 * （标签选择器、一组按钮、只读的展示块）。label 包住多个控件是无效标记。 */
export function FormBlock({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/* 复选框那一行：控件在前，说明在后，整行可点。 */
export function CheckboxField({
  label,
  className,
  ...props
}: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label className={cn('flex items-center gap-2 text-xs text-foreground', className)}>
      <input className="size-4 shrink-0" type="checkbox" {...props} />
      {label}
    </label>
  );
}

export function FormGrid({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid gap-3 sm:grid-cols-2', className)} {...props} />;
}

export function FormActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-2', className)}
      {...props}
    />
  );
}

/* 朱红勾注 —— 账本里用红笔在左侧划一道表示这条需要处理。
 * 错误、未知、待补录共用这一个形状。 */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      data-slot="annotation"
      className="border border-destructive/30 bg-destructive-subtle px-4 py-3 text-sm"
      role="alert"
    >
      {children}
    </p>
  );
}

/* 一张纸。材质来自 theme.css 的 [data-slot='card']，
 * 这里只提供内边距和标题排版。 */
export function Panel({
  title,
  eyebrow,
  description,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-slot="card" className={cn('flex flex-col gap-4 p-5', className)}>
      {title || eyebrow || action ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            {eyebrow ? <p data-slot="ledger-label">{eyebrow}</p> : null}
            {title ? (
              <h2 className="text-base leading-snug font-semibold text-heading">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* 键值行：左标签右值，虚线分隔，值走等宽。资料区通用。 */
export function FactRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-dashed border-border py-2 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd data-slot="amount" className="text-sm text-foreground">
        {value}
      </dd>
    </div>
  );
}

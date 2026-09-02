import { cn } from '@thingcost/ui';

/* 分段控件：一组互斥选项装在同一个框里。
 * 选中项用实心墨块，未选中只有文字色变化 —— 不用阴影不用位移。
 * 焦点环吃全局 :focus-visible 的直角描边，不另起 ring 配方。 */
export function SegmentedControl<Value extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-0.5 border border-border bg-card p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'px-3 py-1 text-xs whitespace-nowrap transition duration-150',
              active
                ? 'bg-primary font-medium text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

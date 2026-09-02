import { cn } from '@thingcost/ui';

/* 骑缝长戳：批注不是说明文字，是盖下去的一枚朱红长条小戳。
 * 与票面方印（SealMark）分职：方印凭信，长戳批注。
 * 更正、作废这类审计标记用它盖在时间线条目旁 ——
 * 方印随形就一枚，戳可以随处落。 */
export function AuditStamp({
  label,
  className,
}: {
  label: '更正' | '作废';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block rotate-[-2deg] border border-destructive/70 px-1 py-px',
        'font-serif text-[10px] leading-tight tracking-[0.18em] text-destructive',
        className,
      )}
    >
      {label}
    </span>
  );
}

import { cn } from '@thingcost/ui';

/* 铅字块：从分类名字盘里拣出的第一枚字钉。
 *
 * 和图标解决同一个扫读问题，但符号系统始终是"字"：
 * 不引图标库、不夹颜色、不用用户配置 —— 任何自定义分类名
 * 自动生成。纸面上一枚描边小方块装一个宋体首字，
 * 像从字盘里提出来的铅字钉。 */
export function TypeBlock({ name, className }: { name: string; className?: string }) {
  const raw = name.trim().charAt(0);
  const isLatin = /^[a-z]$/i.test(raw);
  /* 拉丁字母大写更像字钉；同字号下拉丁笔画比 CJK 瘦小，给大两号配平 */
  const letter = isLatin ? raw.toUpperCase() : raw || '·';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-[18px] shrink-0 items-center justify-center',
        'border font-serif leading-none text-heading select-none',
        isLatin ? 'text-[13px]' : 'text-[11px]',
        className,
      )}
      /* 碑拓底上全局 strong 边框对细丝方块偏闷（2.87:1），
       * 铅字块的钉子向墨色再借一点 */
      style={{
        borderColor: 'color-mix(in oklab, var(--border-strong) 72%, var(--heading))',
      }}
    >
      {letter}
    </span>
  );
}

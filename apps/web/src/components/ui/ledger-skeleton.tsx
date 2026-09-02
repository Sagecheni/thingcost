import { cn } from '@thingcost/ui';

/* 账页幽灵 —— 数据还没落地时，纸上只有行线。
 *
 * 骨架不发明新形状：幽灵存根 = 1px 边框 + 头联条 + 票面条 + 虚线骑缝 + 存根脚条，
 * 幽灵面板 = 纸面 + 眉批条 + 正文行线（或一整块账页行线的图表格）。
 * 只在 motion-safe 下轻微呼吸，其余时间安静 —— 纸不会自己动。
 */

function LedgerLine({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block bg-muted', className)} />;
}

/* 一整张新的物品存根正在被填写 */
export function StubGhost({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex flex-col gap-2.5 border border-border bg-card p-3.5',
        className,
      )}
    >
      {/* 头联：分类 | 状态 */}
      <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-border pb-2">
        <LedgerLine className="h-2.5 w-14" />
        <LedgerLine className="h-2.5 w-10" />
      </div>
      {/* 票面：名称 + 大号金额 */}
      <div className="space-y-1.5 pt-0.5">
        <LedgerLine className="h-3 w-24" />
        <LedgerLine className="h-7 w-32" />
      </div>
      {/* 骑缝 + 存根脚 */}
      <div className="mt-1 flex justify-between gap-3 border-t border-dashed border-border pt-2.5">
        <LedgerLine className="h-2.5 w-12" />
        <LedgerLine className="h-2.5 w-12" />
      </div>
    </div>
  );
}

/* 列表页整组幽灵存根。count 按最近常用的栏数给：3 列 × 2 行。 */
export function StubGhostGrid({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn('grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', className)}
    >
      <span className="sr-only">正在读取</span>
      {Array.from({ length: count }, (_, index) => (
        <div className="motion-safe:animate-pulse" key={index}>
          <StubGhost />
        </div>
      ))}
    </div>
  );
}

/* 图表格本体：只给账页行线，不带纸框 —— 放进已有 Card 里用，
 * 这时标题已经由外面真正的面板头承担了。 */
export function ChartBoard({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        'border border-dashed border-border',
        'bg-[repeating-linear-gradient(0deg,transparent_0_27px,var(--c-ledger)_27px_28px)]',
        'motion-safe:animate-pulse',
        className,
      )}
    >
      <span className="sr-only">正在绘制</span>
      <div className="h-56" />
    </div>
  );
}

/* 一张还在等内容的纸。chart 模式给一整块账页行线当图表格。
 * 放进已有 Card 里时传 border-0 bg-transparent p-0 去掉双框。 */
export function PanelGhost({
  lines = 4,
  chart = false,
  className,
}: {
  lines?: number;
  chart?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn('flex flex-col gap-3 border border-border bg-card p-5', className)}
    >
      <span className="sr-only">正在读取</span>
      {/* 眉批行 */}
      <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-border pb-2.5">
        <LedgerLine className="h-2.5 w-20" />
        <LedgerLine className="h-2.5 w-12" />
      </div>
      <LedgerLine className="h-4 w-28" />
      {chart ? (
        /* 图表格：账页行线自己就是网格线 */
        <div
          aria-hidden="true"
          className={cn(
            'mt-1 border border-dashed border-border',
            'bg-[repeating-linear-gradient(0deg,transparent_0_27px,var(--c-ledger)_27px_28px)]',
            'motion-safe:animate-pulse',
          )}
        >
          <div className="h-56" />
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-2.5 motion-safe:animate-pulse">
          {Array.from({ length: lines }, (_, index) => (
            <LedgerLine
              className={cn('h-3', index % 2 === 0 ? 'w-full' : 'w-3/4')}
              key={index}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* 账页视图的幽灵：行成列的框。骨架形状要跟落地后的形态一致 ——
 * 表格加载不能用卡片存根充数，换页时骨架会整个塌掉又竖起。 */
export function LedgerRowsGhost({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn('flex flex-col border border-border bg-card', className)}
    >
      <span className="sr-only">正在读取</span>
      {/* 表头一行 */}
      <div className="flex gap-4 border-b border-dashed border-border px-4 py-3">
        <LedgerLine className="h-2.5 w-16" />
        <LedgerLine className="h-2.5 w-20" />
        <LedgerLine className="ml-auto h-2.5 w-14" />
        <LedgerLine className="h-2.5 w-14" />
        <LedgerLine className="h-2.5 w-10" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          className="flex gap-4 border-b border-dashed border-border px-4 py-3 motion-safe:animate-pulse last:border-0"
          key={index}
        >
          <LedgerLine className="h-3 w-28" />
          <LedgerLine className="h-3 w-20" />
          <LedgerLine className="ml-auto h-3 w-14" />
          <LedgerLine className="h-3 w-16" />
          <LedgerLine className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

/* 已经在一张纸里的小加载（设置、分类这类嵌套区）：
 * 只给行线，不再套一层边框。 */
export function RuledLines({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn('flex flex-col gap-2.5 py-1 motion-safe:animate-pulse', className)}
    >
      <span className="sr-only">正在读取</span>
      {Array.from({ length: count }, (_, index) => (
        <LedgerLine
          className={cn('h-3', index % 2 === 0 ? 'w-full' : 'w-2/3')}
          key={index}
        />
      ))}
    </div>
  );
}

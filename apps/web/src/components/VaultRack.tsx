import { cn } from '@thingcost/ui';

import type { Dashboard } from '@thingcost/contracts';

import { rampStep, readableInk, useChartPalette } from '../lib/chart-palette.js';
import { formatMinorCurrency } from '../lib/format.js';
import { TypeBlock } from './TypeBlock.js';

/* 库房货架：资产版图的空间形态。
 *
 * 一格一类、宽随净投入；架号从《千字文》「天地玄黄宇宙洪荒」起 ——
 * 当铺货架的真实编号传统，不是装饰噱头。超出架位的分类并入「杂格」，
 * 完整读数交给下方排行（排行同时是这张图的无障碍表格视图，
 * 所以货架本体 aria-hidden）。
 *
 * 填色纪律：格子本体永远走茶褐 ramp。分类自定义色是任意十六进制，
 * 整格填色等于把调色板纪律交给手滑 —— 降级为架号行末尾的一颗色点。
 * 文字色按 ramp 底色亮度自动选侧，不需要管自定义色的对比度。
 *
 * 防溢出是硬约束：每格 overflow-hidden、每行一律截断，文字绝不出格；
 * 格子太多或太窄时货架横向滚动（与账页视图同一策略），不硬挤。 */

/* 架号顺序：《千字文》首句 */
const RACK_SLOTS = ['天', '地', '玄', '黄', '宇', '宙', '洪', '荒'] as const;
const RACK_MAX_CELLS = RACK_SLOTS.length;

interface RackEntry {
  key: string;
  slot: string;
  name: string;
  color: string | null;
  value: number;
  amountMinor: string;
  itemCount: number;
  misc: boolean;
}

export function VaultRack({
  categories,
  currency,
}: {
  categories: Dashboard['categories'];
  currency: string;
}) {
  const palette = useChartPalette();

  const positive = categories.filter((category) => BigInt(category.netCostMinor) > 0n);
  const useNetInvestment = positive.length > 0;
  const visible = useNetInvestment ? positive : categories;
  const valueOf = (category: Dashboard['categories'][number]) =>
    useNetInvestment ? Number(BigInt(category.netCostMinor)) : category.itemCount;

  /* 架满八格：多余的分类并入杂格，一格也是一类账 */
  const onRack =
    visible.length <= RACK_MAX_CELLS ? visible : visible.slice(0, RACK_MAX_CELLS - 1);
  const rest = visible.slice(onRack.length);

  const entries: RackEntry[] = onRack.map((category, index) => ({
    key: category.categoryId,
    slot: `${RACK_SLOTS[index]}字格`,
    name: category.name,
    color: category.color,
    value: valueOf(category),
    amountMinor: category.netCostMinor,
    itemCount: category.itemCount,
    misc: false,
  }));
  if (rest.length > 0) {
    entries.push({
      key: '__misc__',
      slot: `杂格 · ${rest.length} 类`,
      name: '杂格',
      color: null,
      value: rest.reduce((sum, category) => sum + valueOf(category), 0),
      amountMinor: rest
        .reduce((sum, category) => sum + BigInt(category.netCostMinor), 0n)
        .toString(),
      itemCount: rest.reduce((sum, category) => sum + category.itemCount, 0),
      misc: true,
    });
  }

  const maxValue = entries.reduce((largest, entry) => Math.max(largest, entry.value), 0);

  return (
    <div aria-hidden="true" className="flex overflow-x-auto border border-border">
      {entries.map((entry) => {
        const fill = rampStep(entry.value, maxValue, palette.ramp);
        return (
          <div
            key={entry.key}
            className={cn(
              'flex min-w-[80px] shrink flex-col overflow-hidden px-3 py-2.5',
              'border-r border-card last:border-r-0',
            )}
            style={{
              flexGrow: entry.value,
              flexBasis: 0,
              backgroundColor: fill,
              color: readableInk(fill),
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate font-serif text-[11px] tracking-[0.12em] opacity-80">
                {entry.slot}
              </span>
              {/* 自定义色：一颗色点就是全部份量 */}
              {entry.color ? (
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
              ) : null}
            </div>
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
              <TypeBlock name={entry.name} className="border-current text-inherit" />
              <span className="truncate text-sm font-medium">{entry.name}</span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[13px]">
              {formatMinorCurrency(entry.amountMinor, currency)}
            </div>
            <div className="truncate text-[11px] opacity-80">{entry.itemCount} 件</div>
          </div>
        );
      })}
    </div>
  );
}

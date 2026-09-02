import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';

import type { AssetSummary } from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { formatMinorCurrency } from '../lib/format.js';
import { useFreshMark } from '../lib/fresh-marks.js';
import { vintagePercent } from '../lib/vintage.js';
import { SealMark } from './SealMark.js';
import { TypeBlock } from './TypeBlock.js';
import { CardPerforation } from './ui/card.js';

/* 物品当票。
 *
 * 解剖结构照着典当行的当票走：
 *   头联    分类 · 当字第 N 号 | 状态   虚线下边框
 *   票面    名称 + 日均成本 + 朱砂方印  大号等宽 + 凭印为信
 *   骑缝    撕口 + 骑缝半印             CardPerforation sealed
 *   存根脚  净成本 | 服役天数           小号等宽
 *
 * 材质（边框、直角、顶边粗线、hover）全部来自 theme.css 的 [data-slot='card']，
 * 四种档案载体共用同一份结构。票面是计算口径的成本，不是当铺估价。 */

interface AssetCardProps {
  asset: AssetSummary;
  currency?: string;
}

/* 票面金额只出数字，单位"/ 天"单独排小一号 —— 直接用
 * formatDailyMinorCurrency 会把单位焊进字符串里，没法分开排版。 */
function dailyFaceValue(amountMinor: string, currency: string): string {
  return formatMinorCurrency(amountMinor, currency, 2);
}

/* 当票号：取资产 id 尾段四位，当票惯例「当字第 N 号」。
 * 票号只负辨识不重查对，压短了头联才容得下铅字块与老档。 */
function ticketNumber(assetId: string): string {
  return assetId.slice(-4).toUpperCase();
}

export function AssetCard({ asset, currency = 'CNY' }: AssetCardProps) {
  const { metrics } = asset;
  const fresh = useFreshMark(asset.id);
  const cover = asset.coverAttachment?.thumbnailUrl;
  const subtitle = [asset.brand, asset.model].filter(Boolean).join(' · ');
  const costUnknown = asset.costKnowledge === 'unknown';
  /* 净成本为负 = 卖出回款超过投入，这件物品最终是赚的 */
  const isGain = metrics.netCostMinor !== null && BigInt(metrics.netCostMinor) < 0n;
  /* 陈化分档：一年半起染、八年封顶的阶梯渐变（lib/vintage.ts）。
   * 深浅是氛围不是读数，具体年头去详情页看。 */
  const vintageMix = vintagePercent(metrics.holdingDays);

  return (
    <Link
      data-slot="card"
      data-interactive="true"
      {...(vintageMix > 0 ? { 'data-vintage': 'true' } : {})}
      className={cn('flex flex-col text-card-foreground', fresh && 'fresh-ink')}
      style={{ '--vintage-mix': `${vintageMix}%` } as CSSProperties}
      to="/assets/$assetId"
      params={{ assetId: asset.id }}
    >
      {/* 头联：分类 · 当票号 | 状态 */}
      <div
        className={cn(
          'flex items-baseline justify-between gap-2',
          'border-b border-dashed border-border px-3.5 py-2',
        )}
      >
        <span
          data-slot="ledger-label"
          className="flex min-w-0 items-center gap-1.5 truncate"
        >
          <TypeBlock name={asset.category.name} />
          <span className="truncate">
            {asset.category.name} · 当字第 {ticketNumber(asset.id)} 号
          </span>
        </span>
        <span data-slot="ledger-label" className="shrink-0">
          {asset.currentStatus.name}
        </span>
      </div>

      {/* 封面是真实照片，不做任何像素化或滤镜处理 */}
      {cover ? (
        <div className="border-b border-border">
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="block h-28 w-full object-cover"
          />
        </div>
      ) : null}

      {/* 票面 */}
      <div className="flex flex-1 flex-col gap-2 px-3.5 pt-3">
        <div className="space-y-0.5">
          <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold text-heading">
            {asset.name}
          </h3>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>

        {/* 票面：票面金额 + 朱砂方印。印在 fresh 时盖一次。 */}
        <div className="flex items-end justify-between gap-2">
          {costUnknown ? (
            /* 藤黄待办 —— 成本未记录是欠一步不是判错。
             * 未知成本从来不是零，也不进任何合计。 */
            <p data-slot="pending" className="text-[13px] font-semibold">
              成本未记录
            </p>
          ) : metrics.netDailyCostMinor === null ? (
            /* 成本已知但服役 0 天：分母为零，摊不出日均。
             * 这是合法状态不是缺数据，所以用灰而不是朱红。 */
            <p className="text-[13px] text-muted-foreground">尚未服役 · 无法摊薄</p>
          ) : (
            <p className="flex items-baseline gap-1">
              <span
                data-slot="amount"
                className={cn(
                  'text-[26px] leading-none font-medium',
                  isGain ? 'text-success' : 'text-heading',
                )}
              >
                {dailyFaceValue(metrics.netDailyCostMinor, currency)}
              </span>
              <span className="text-[11px] tracking-wide text-muted-foreground">
                {isGain ? '/ 天净收益' : '/ 天'}
              </span>
            </p>
          )}
          <SealMark stamped={fresh} className="mb-0.5" />
        </div>
      </div>

      <CardPerforation sealed className="mt-3" />

      {/* 当票脚。没有钱可报的时候就报时间 —— 空着一格比补个零诚实。 */}
      <dl className="flex justify-between gap-3 px-3.5 py-2.5 text-[11px] text-muted-foreground">
        {costUnknown ? (
          <div className="flex gap-1">
            <dt>持有</dt>
            <dd data-slot="amount" className="text-foreground">
              {metrics.holdingDays} 天
            </dd>
          </div>
        ) : (
          <div className="flex min-w-0 gap-1">
            <dt className="shrink-0">净成本</dt>
            <dd data-slot="amount" className="truncate text-foreground">
              {formatMinorCurrency(metrics.netCostMinor, currency)}
            </dd>
          </div>
        )}
        <div className="flex shrink-0 gap-1">
          <dt>服役</dt>
          <dd data-slot="amount" className="text-foreground">
            {metrics.serviceDays} 天
          </dd>
        </div>
      </dl>
    </Link>
  );
}

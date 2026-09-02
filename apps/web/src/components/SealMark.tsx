import { cn } from '@thingcost/ui';

/* 朱砂方印 —— 当票的凭证印记，白文（阴刻）。
 *
 * 印文为手绘篆意 SVG 笔画（"物纪"二字竖排），不引字体：
 *   物在上 —— 牛竖贯双角外展、两横微拱取篆书的曲势；勿作勹环抱含二撇。
 *   纪在下 —— 糸一缕垂丝上分两络下开两脚；己方折内旋如水入涡。
 *   等宽笔画、方折圆转，取篆书之气，不作真篆字帖。
 * 立体感按"斜光照进刻槽"读，不做仿古模糊纹理：
 *   印泥体：左上一块受光、右下一枚暗角，叠在深浅渐变上；
 *     内嵌浮雕左右开弓 —— 左上亮沿、右下深沿各其一。
 *   白文字腔：笔画的左上是压深槽底，右下是槽沿吃光（提亮朱砂）——
 *     上暗下亮是阴刻凹槽的阅读方向，反过来会被读成凸字。
 *   双层边框、微转 -3°。
 * 残印是脆的缺口不是纹理：四处纸色缺口咬在印缘——印泥没盖实的位置，
 * 带一圈极细的受力暗边，缺口不对称也不跨笔画。
 *
 * stamped 时播放一次"盖印"动效（theme.css 的 ledger-stamp），
 * prefers-reduced-motion 下自动关闭。
 */

const GLYPH_PATHS = [
  /* 物 · 牛：竖贯，双角外展，两横微拱 */
  'M17 9.7 V31.2',
  'M17 9.7 C13.8 7.7 11.2 7.7 9.8 9.1',
  'M17 9.7 C20.2 7.7 22.8 7.7 24.2 9.1',
  'M9.5 16.9 C13.5 15.6 20.5 15.6 24.5 16.9',
  'M9.5 24.1 C13.5 22.8 20.5 22.8 24.5 24.1',
  /* 物 · 勿：勹 环抱，内收二撇；略收窄，与牛的宽度配平 */
  'M34.6 10.4 C42 8.7 50.5 9.3 51.6 15.5 C52.6 21.5 47.9 28 40.8 26.7',
  'M36.6 14.2 C39.4 16.2 41.6 19.5 42.8 23.8',
  'M43.2 13.9 C45.7 15.8 47.7 18.8 48.8 22.4',
  /* 纪 · 糸：一缕垂丝，上分两络，下开两脚 */
  'M18 36.5 V51.5',
  'M18 37.5 C13.2 39 10.8 42.6 11.3 47',
  'M18 37.5 C22.8 39 25.2 42.6 24.7 47',
  'M18 51.5 C15.2 54 12.6 55 10.6 55.3',
  'M18 51.5 C20.8 54 23.4 55 25.4 55.3',
  /* 纪 · 己：方折内旋，旋足下探与糸脚同一基线 */
  'M32.5 37.8 H52',
  'M52 37.8 V45.5 C52 52 46.4 55.8 41.2 53.9 C37.8 52.6 37.9 48.3 40.9 46.9 C43.5 45.6 46.4 47 47.2 50',
];

/* 残印缺口：纸色（压印时印泥没吃到），咬进印缘不咬笔画。
 * 用 var(--card) 跟随档案载体换纸色。 */
const WEAR_CHIPS = [
  { x: 0, y: 27.5, width: 2.5, height: 2 },
  { x: 44.5, y: 0, width: 3.2, height: 1.8 },
  { x: 61.8, y: 49.5, width: 2.2, height: 2.8 },
  { x: 25.5, y: 62.2, width: 3, height: 1.8 },
];

function SealGlyphs() {
  return (
    <>
      {GLYPH_PATHS.map((d) => (
        <path d={d} key={d} />
      ))}
    </>
  );
}

export function SealMark({
  className,
  stamped = false,
}: {
  className?: string;
  stamped?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex size-8 shrink-0 rotate-[-3deg] items-center justify-center',
        stamped && 'ledger-stamp',
        className,
      )}
      style={{ borderRadius: '4px 3px 4px 3px' }}
    >
      {/* 印泥本体：左上受光 / 右下暗角叠在深浅渐变上，浮雕双边 + 沿边吃色 */}
      <span
        className="absolute inset-0"
        style={{
          borderRadius: 'inherit',
          background:
            'radial-gradient(circle at 30% 26%, rgba(255, 255, 255, 0.14), transparent 58%),' +
            'radial-gradient(circle at 82% 86%, rgba(0, 0, 0, 0.24), transparent 62%),' +
            'linear-gradient(135deg, var(--destructive) 0%, var(--seal-deep) 100%)',
          boxShadow:
            'inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.22),' +
            'inset -1px -2px 0 rgba(0, 0, 0, 0.34),' +
            'inset 0 0 0 1px rgba(0, 0, 0, 0.16),' +
            '0 0 0 1px var(--seal-rim)',
        }}
      />
      {/* 印文：篆意笔画（阴文留白）+ 硬压痕；inner 细框 = 印章双边；
       * 残印缺口最后落笔，纸色咬掉印缘。 */}
      <svg
        className="absolute inset-0 size-full"
        style={{ color: 'var(--destructive-foreground)' }}
        viewBox="0 0 64 64"
      >
        <rect
          x="4.5"
          y="4.5"
          width="55"
          height="55"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.55}
          strokeWidth={1.4}
        />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.6}>
          {/* 槽底：笔画左上压深 —— 光从右下来，深处先暗 */}
          <g transform="translate(-0.45, -0.6)" stroke="rgba(0, 0, 0, 0.38)">
            <SealGlyphs />
          </g>
          {/* 槽沿：笔画右下吃光 —— 提亮的朱砂，相当于印泥被刻刀挑起的亮沿 */}
          <g
            transform="translate(0.5, 0.7)"
            stroke="color-mix(in oklab, var(--destructive) 55%, white)"
          >
            <SealGlyphs />
          </g>
          {/* 字迹本体（阴文留白，即没被印泥盖住的纸） */}
          <g stroke="currentColor">
            <SealGlyphs />
          </g>
        </g>
        <g fill="var(--card)" stroke="rgba(0, 0, 0, 0.22)" strokeWidth={0.6}>
          {WEAR_CHIPS.map((chip) => (
            <rect
              key={`${chip.x}-${chip.y}`}
              x={chip.x}
              y={chip.y}
              width={chip.width}
              height={chip.height}
              rx={0.5}
            />
          ))}
        </g>
      </svg>
    </span>
  );
}

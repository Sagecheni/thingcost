/* 设计 token 校验：四个载体的对比度与色阶单调性。
 *
 * theme.css 注释里的对比度（"朱砂对 --c-sheet 5.0:1"）过去靠人工核算，
 * 改一个基色没有任何东西会拦。这个脚本把核算挂进 pnpm check：
 *   - 墨色 / 朱砂 / 指示色在纸面上的 WCAG 对比度
 *   - 链接 ≠ 主操作（同色会让文字链接和按钮读作同一种东西）
 *   - 图表色阶明暗单调：暗底上越大越亮，亮底上越大越深
 *
 * 只解析 `--c-*: #rrggbb` 声明；prefers-color-scheme 的 system 分支是
 * 原件的复写，跳过。 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VINTAGE_MAX_PERCENT } from '../apps/web/src/lib/vintage.js';

const themePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/web/src/theme.css',
);
const css = readFileSync(themePath, 'utf8');

type CarrierName = `${'indigo' | 'ticket'}-${'dark' | 'light'}`;

const expectedCarriers: CarrierName[] = [
  'ticket-dark',
  'ticket-light',
  'indigo-dark',
  'indigo-light',
];

function parseCarriers(source: string): Map<CarrierName, Map<string, string>> {
  const carriers = new Map<CarrierName, Map<string, string>>();

  for (const block of source.matchAll(/:root([^{}]*)\{([^{}]*)\}/g)) {
    const selector: string = block[1] ?? '';
    const body: string = block[2] ?? '';
    if (selector.includes('system')) continue;

    const style = selector.includes("data-style='indigo'") ? 'indigo' : 'ticket';
    const theme = selector.includes("data-theme='light'") ? 'light' : 'dark';
    const name: CarrierName = `${style}-${theme}`;
    if (carriers.has(name)) continue; // 语义段等后续 :root 块，以首个 token 块为准

    const tokens = new Map<string, string>();
    for (const decl of body.matchAll(/--c-([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) {
      const key: string = decl[1] ?? '';
      const value: string = decl[2] ?? '';
      tokens.set(key, value.toLowerCase());
    }
    if (tokens.size > 0) carriers.set(name, tokens);
  }

  return carriers;
}

/* WCAG 相对亮度，与 DashboardCharts 的 relativeLuminance() 同一算法 */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const srgb = ((value >> shift) & 0xff) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

function contrastRatio(foreground: string, background: string): number {
  const [high, low] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (high + 0.05) / (low + 0.05);
}

interface ContrastCase {
  foreground: string;
  background: string;
  minimum: number;
  label: string;
}

/* AA 正文 4.5；大量铺排的正文和标题要求 AAA 7，留出字体渲染的损耗 */
const contrastCases: ContrastCase[] = [
  { foreground: 'ink', background: 'bg', minimum: 7, label: '正文 / 底色' },
  { foreground: 'ink', background: 'sheet', minimum: 7, label: '正文 / 票面' },
  { foreground: 'ink-dim', background: 'bg', minimum: 4.5, label: '次级文字 / 底色' },
  { foreground: 'ink-dim', background: 'sheet', minimum: 4.5, label: '次级文字 / 票面' },
  { foreground: 'ink-strong', background: 'sheet', minimum: 7, label: '标题 / 票面' },
  { foreground: 'red', background: 'sheet', minimum: 4.5, label: '朱砂勾注 / 票面' },
  { foreground: 'green', background: 'sheet', minimum: 4.5, label: '增益绿 / 票面' },
  { foreground: 'amber', background: 'sheet', minimum: 4.5, label: '琥珀警注 / 票面' },
  { foreground: 'violet', background: 'sheet', minimum: 4.5, label: '紫批 / 票面' },
  {
    foreground: 'accent-on',
    background: 'accent',
    minimum: 4.5,
    label: '主操作字 / 主操作底',
  },
  { foreground: 'link', background: 'bg', minimum: 4.5, label: '链接 / 底色' },
  { foreground: 'link', background: 'sheet', minimum: 4.5, label: '链接 / 票面' },
];

/* 陈纸卡（data-vintage）是唯一的氛围例外：票面随年头向茶色渐变，
 * 深载体上"转暖即提亮"，次级文字会略低于 4.5。
 * 只允许 12px 的补充行级信息承担这个降档（门槛 4.0，票号/日期/存根脚），
 * 正文墨色不受影响的条件不变（≥7）。
 * 校验按 VINTAGE_MAX_PERCENT（lib/vintage.ts 的封顶档，最坏情况）算；
 * 茶色从 theme.css 的陈纸规则里解析 —— 封顶在代码里、颜料在样式里。 */
function parseVintagePigment(source: string): string | null {
  const block = /\[data-vintage='true'\][^{]*\{([^}]*)\}/u.exec(source);
  const pigmentMatch = /#[0-9a-fA-F]{6}/u.exec(block?.[1] ?? '');
  return pigmentMatch ? pigmentMatch[0].toLowerCase() : null;
}

/* 同色的 sRGB 通道加权混合（亮色相近时与 color-mix oklab 的偏差 <2，
 * 已用 qlmanage 实渲像素核对过） */
function mixHex(base: string, pigment: string, ratioOfBase: number): string {
  const channel = (hex: string, shift: number) =>
    (Number.parseInt(hex.slice(1), 16) >> shift) & 0xff;
  const mixed = [16, 8, 0].map((shift) =>
    Math.round(
      channel(base, shift) * ratioOfBase + channel(pigment, shift) * (1 - ratioOfBase),
    ),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

const vintageRulePresent = css.includes("[data-vintage='true']");
const vintage = parseVintagePigment(css);

const carriers = parseCarriers(css);
let failures = 0;

/* 陈纸规则在但解析不出来 = 检查在静默漏检，必须当场炸出来 */
if (vintageRulePresent && !vintage) {
  console.error('✗ theme.css 里存在陈纸规则，但 tokens:check 的解析失效了');
  failures += 1;
}

for (const name of expectedCarriers) {
  const tokens = carriers.get(name);
  if (!tokens) {
    console.error(`✗ ${name}: 未找到该载体的 --c-* token 块`);
    failures += 1;
    continue;
  }

  console.log(`\n${name}`);

  for (const testCase of contrastCases) {
    const foreground = tokens.get(testCase.foreground);
    const background = tokens.get(testCase.background);
    if (!foreground || !background) {
      console.error(
        `  ✗ ${testCase.label}: 缺少 --c-${testCase.foreground} 或 --c-${testCase.background}`,
      );
      failures += 1;
      continue;
    }
    const ratio = contrastRatio(foreground, background);
    const pass = ratio >= testCase.minimum;
    if (!pass) failures += 1;
    console.log(
      `  ${pass ? '✓' : '✗'} ${testCase.label}: ${ratio.toFixed(2)}:1 (≥ ${testCase.minimum})`,
    );
  }

  if (tokens.get('link') === tokens.get('accent')) {
    console.error('  ✗ 链接与主操作同色：文字链接会读作按钮');
    failures += 1;
  } else {
    console.log('  ✓ 链接与主操作区分');
  }

  if (vintage) {
    const sheet = tokens.get('sheet');
    const ink = tokens.get('ink');
    const inkDim = tokens.get('ink-dim');
    if (sheet && ink && inkDim) {
      const vintageSheet = mixHex(sheet, vintage, (100 - VINTAGE_MAX_PERCENT) / 100);
      const inkRatio = contrastRatio(ink, vintageSheet);
      const dimRatio = contrastRatio(inkDim, vintageSheet);
      if (inkRatio < 7) failures += 1;
      console.log(
        `  ${inkRatio >= 7 ? '✓' : '✗'} 正文 / 陈纸票面: ${inkRatio.toFixed(2)}:1 (≥ 7)`,
      );
      if (dimRatio < 4) failures += 1;
      console.log(
        `  ${dimRatio >= 4 ? '✓' : '✗'} 次级文字 / 陈纸票面: ${dimRatio.toFixed(2)}:1 (≥ 4 氛围放宽)`,
      );
    }
  }

  const rampKeys = ['ramp-1', 'ramp-2', 'ramp-3', 'ramp-4', 'ramp-5'];
  const ramp = rampKeys.map((key) => luminance(tokens.get(key) ?? '#000000'));
  const dark = name.endsWith('-dark');
  const monotone = ramp.every((value, index) =>
    index === 0
      ? true
      : dark
        ? value > (ramp[index - 1] ?? 0)
        : value < (ramp[index - 1] ?? 0),
  );
  if (!monotone) failures += 1;
  console.log(
    `  ${monotone ? '✓' : '✗'} 色阶${dark ? '递增（暗底越大越亮）' : '递减（亮底越大越深）'}`,
  );
}

if (failures > 0) {
  console.error(`\ntheme token 校验失败：${String(failures)} 项不达标`);
  process.exitCode = 1;
} else {
  console.log('\ntheme token 校验通过');
}

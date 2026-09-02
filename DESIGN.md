---
name: 物纪 · Chronicle Ledger
description: 把真实物品、时间和成本记进一本账。每件物品是一张存根，日均成本是票面金额，未知成本用朱红勾注——从不伪装成零。
lineages:
  stub:
    displayName: 存根
    positive: 正联 · 纸白蓝黑墨朱红勾注
    negative: 负片存底 · 缩微胶片
  blueprint:
    displayName: 图纸
    positive: 白图 whiteprint · 白底蓝线
    negative: 蓝晒 cyanotype · 深普鲁士蓝底白线
colors:
  stub-positive-ground: '#e8e4d8'
  stub-positive-sheet: '#faf8f1'
  stub-positive-ink: '#1b1a16'
  stub-negative-ground: '#101210'
  stub-negative-sheet: '#1a1c18'
  stub-negative-ink: '#e8e6dc'
  blueprint-positive-ground: '#eef2f5'
  blueprint-positive-ink: '#12324e'
  blueprint-negative-ground: '#0d1e30'
  blueprint-negative-sheet: '#14304c'
  vermilion-annotation: '#b1372c'
typography:
  body:
    fontFamily: 'PingFang SC, Hiragino Sans GB, Noto Sans SC, Microsoft YaHei, system-ui, sans-serif'
    fontSize: '15px'
    lineHeight: 1.7
  figures:
    fontFamily: 'ui-monospace, SF Mono, Menlo, Consolas, monospace'
    usage: '全部金额、日期、计数、天数和表头眉批'
spacing:
  rhythm: '4px'
  touchTarget: '44px minimum'
components:
  sheet:
    border: '1px, 顶边 4px 粗规则线'
    radius: '0'
    shadow: 'none'
  perforation:
    rule: '1px dashed, 两端 11px 半圆咬进页面底色'
---

# Design System: 物纪 · Chronicle

> **现行方向已更新（v2 · 当铺）**：本文件是 v1「账簿/存根」方向的完整记录。
> 当前实现沿用的方向与详细 token 见 `design-system/pawnshop.md`。

## Creative North Star

**这是一本账。** 每件耐用品是一张存根：头联写分类和状态，票面写日均成本，骑缝撕开，存根脚记净成本和服役天数。首页是总账页，物品详情是一份完整档案，时间线是流水账。

账本的语法不是装饰，是约束。账本里未知的格子留空或者用红笔勾注，从不填零——这恰好是产品原则第 4 条「计算口径透明，未知值不伪装成零」的视觉形状。金额天然成列，因为账本的数字一直是等宽的。折线不平滑，因为账目不该被插值美化。

界面仍然是操作台不是收藏品：金额精确，破坏性操作显式，中文阅读舒适度高于隐喻还原度。

## 两条谱系，各自带正负片

`data-style`（谱系）与 `data-theme`（明暗）**正交**，互不干扰。

|                      | 亮色（正）                    | 暗色（负）                  |
| -------------------- | ----------------------------- | --------------------------- |
| **存根** `stub`      | 正联 · 白纸、蓝黑墨、朱红勾注 | 负片存底 · 缩微胶片         |
| **图纸** `blueprint` | 白图 whiteprint · 白底蓝线    | 蓝晒 cyanotype · 深蓝底白线 |

四个组合都有历史依据。晒图工艺里 blueprint（蓝底白线）与 whiteprint / diazo（白底蓝线）本来就是一对；负片是同一张存根的存底，不是"另一个主题"。

**暗色不是"深色的纸"**——那是矛盾修辞。暗色是换了一种真实存在的深色档案载体。

默认载体是存根，它和产品名同源。

## 实现结构

**两级间接。** 载体只定义 `--c-*` 原始色值（约 20 个），语义 token 的映射（`--background` / `--foreground` / `--destructive` / `--chart-1..5` …）只写一遍。自定义属性惰性求值，重定义 `--c-bg` 会让引用它的 `--background` 跟着变。加第五种载体约 15 行。

**材质进 CSS，布局留 Tailwind。** 圆角、边框、投影、hover 行为全部挂在 `[data-slot='…']` 选择器上，按 `data-style` 分支。组件代码只写布局、间距、字号，换载体时一行不动。规则放在 `components` 层：压得过 legacy，又输给 utilities，页面上一个 Tailwind 类就能就地覆盖。

**图表零 JS 分支。** `readChartPalette()` 全部颜色从 CSS 变量读取；`MutationObserver` 同时监听 `data-theme` 和 `data-style`。换载体时图表自动跟着变，没有第二套调色板。

## 材质语法

### 纸面 sheet

- 1px 细边框
- 顶边 4px 粗规则线——撕下来的那一条，存根的识别特征
- 直角，零圆角
- 不发光：`--shadow-paper: none`。抬升靠边框和位置，不靠柔光
- 不用毛玻璃：纸是实心的，`--card` 与 `--card-solid` 同值

### 骑缝 perforation

存根与票根之间那道撕口：1px 虚线，两端 11px 半圆。半圆填充必须是 `--background` 而不是 `--card`——它咬的是页面底色，卡片之间露出来的那块。

### 账页横线

`body` 底纹是 27px 间距的横线。**不用 `background-attachment: fixed`**：纸要跟着内容滚，钉死会露馅成"玻璃后面的背景板"。

### 可点击的纸

hover 压一道内描边（`inset 0 0 0 1px`）加深顶边，不上浮不位移。纸不会飘起来，它只是被按住了。静态面板没有任何 hover 反馈，否则会暗示它可以点。

## 数字

**全部金额、日期、计数、天数走等宽**（`[data-slot='amount']`）。账本的数字天然成列，不需要额外对齐工作。

票面金额单位（`/ 天`）单独排小一号，不焊进格式化字符串里——否则没法分开排版。

缺值的写法分两种，含义不同：

- **朱红勾注**（`[data-slot='annotation']`，左侧 3px 竖线）：成本未记录、待补录、异常。红笔的意思是"这条需要处理"
- **灰色破折号 `—`**：口径不适用。比如成本已知但服役 0 天，分母为零摊不出日均——这是合法状态不是缺数据

`¥0` 只在真的是零时出现。

## 色彩语义

- **朱红**：警示、未知、破坏性操作。四个载体同属红橙族，只调对比度不动色相——同一语义换色相会让颜色不再表意
- **绿**：收入、健康、完成
- **主色**：存根族用蓝黑墨（旧账本记账用的就是它）；图纸族亮色用饱和蓝，暗色用纸白（蓝晒上最有力的标记就是留白）
- **图表色阶**：载体自身的墨，单色相，明度单调。亮色越大越深，暗色越大越亮

颜色永远和文字或形状配对出现。

## 图表

- **净投入用阶梯线**（`step: 'end'`）。净投入本来就是阶梯：平的时候什么也没买，跳一级就是入了一件。插值成斜线等于凭空画出不存在的中间状态
- **日均成本用普通折线**：分母天天涨，这是真的连续量
- 不平滑，方点标记，tooltip 直角无阴影
- 树图直角，间隙用 `--card-solid`

## 排版

### 正文

中文系统栈，15px / 1.7。**不引入外部 web font**——产品要求核心功能本地可用，挂 CDN 字体会让离线环境下排版塌掉。字距永远不用负值，中文负字距会糊成一团。

### 眉批 ledger-label

小号等宽 + 0.1em 字距，账本页眉的写法。**12px 是中文可读的下限**，不能照搬拉丁标签常用的 10px。`text-transform: uppercase` 对中文是空操作，只影响英文界面。

## 响应式

- 桌面：240px 侧栏 + 流体正文区
- 物品卡片：`sm` 两列、`lg` 三列、`xl` 四列
- 840px 以下：粘顶横向滚动导航
- 表格和图表只在自己的框里横向滚动，页面本身永不横向溢出

## 无障碍

- 正文对比度四种载体均 ≥ 4.5:1
- 焦点框 2px 实线 + 2px offset，四种载体都可见
- 状态永远由文字承担，颜色只是辅助
- 交互控件不低于 42–44px
- 动效遵守 `prefers-reduced-motion`
- 信息不依赖悬停

## 避免

- 圆角、毛玻璃、柔光投影、卡片上浮——上一版的玻璃语言已经整体移除
- 卡片旋转、按位置轮换的配色（颜色必须表意，位置不是语义）
- 纯拉丁展示字体做标题（中文会掉回退，中英两副长相）
- 把未知值渲染成 `¥0`
- 平滑插值的账目折线
- 像素游戏语法：方块材质、像素图标、物品槽、稀有度——这是归档的旧方向，不再适用

## 维护成本

两条谱系意味着每个新组件要在 **4 个组合**下检查对比度和可读性，不是 2 个。这是双谱系的固有成本。

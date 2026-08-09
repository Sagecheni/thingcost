---
name: 物纪 · Chronicle Sandbox Collection World
description: 把真实物品、时间和成本放进一个原创沙盒收藏世界；像打开背包一样管理拥有，但所有账务仍然真实可追溯。
colors:
  day-sky: '#8fcbea'
  day-grass: '#6e9f3f'
  oak: '#795333'
  oak-light: '#a87546'
  oak-dark: '#3d291d'
  daylight-stone: '#c4c0ad'
  cave: '#1e2638'
  cave-deep: '#101521'
  night-stone: '#41495a'
  gold: '#ffd45a'
  grass-green: '#8fbd45'
  water-cyan: '#68c8d3'
  danger-red: '#ef6a5b'
typography:
  pixel:
    fontFamily: 'Fusion Pixel Chronicle, PingFang SC, sans-serif'
    usage: '短标题、导航、按钮、标签、日期和数字读数'
  body:
    fontFamily: 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif'
    fontSize: '16px'
    lineHeight: 1.6
spacing:
  visualPixel: '4px'
  rhythm: '8px'
  touchTarget: '44px minimum'
components:
  inventory-slot:
    border: '3px dark edge'
    shadow: 'inset light/dark bevel'
    radius: '0'
  block-button:
    border: '3px'
    height: '46px'
    motion: 'two-step press, no smooth float'
---

# Design System: 物纪 · Chronicle

## Creative North Star

**Original sandbox collection world.** Chronicle should feel like opening the inventory of a persistent personal world. Each physical possession occupies a readable slot; lifecycle events form a journal; cash events form a coin ledger; reminders behave like a quest board; export and import behave like world-save management.

The world borrows only structural qualities from sandbox pixel games: block-built panels, limited palettes, beveled slots, crisp sprite-like icons, integer geometry, and short frame-stepped feedback. It does not copy Minecraft or Terraria textures, characters, icons, names, or interface assets.

This is still an operating interface, not a score screen. Amounts remain exact, unknown is never shown as zero, destructive actions stay explicit, and Chinese reading comfort outranks decorative fidelity.

## Scenes

### Daylight world

The user opens Chronicle in ordinary daylight. The page is a clear sky field (`#8fcbea`) over a restrained grass horizon (`#6e9f3f`). Navigation is oak, panels are light stone or parchment-stone, body text is dark brown-black, and gold identifies committed actions and important costs.

### Night cave

The dark scene is a calm cave inventory rather than a black control room. The canvas is blue-charcoal (`#1e2638`), panels are slate stone (`#41495a`), navigation is dark oak, labels are warm bone, gold remains the primary action/readout, water cyan supports charts, and grass green communicates selection or healthy state.

Light and dark themes share materials and semantics, not literal colors.

## Material grammar

### Oak navigation

The desktop rail is a vertical oak storage wall built from 32–35px plank courses. Every route is a physical inventory key with a dark 3px edge, light upper-left bevel, dark lower-right bevel, and a square authored pixel icon. The active route is grass green with a gold outer selection frame.

The mobile header uses the same oak and turns routes into horizontally scrollable hotbar keys. Selection never changes item width.

### Stone panels

Operational panels use stone rather than generic cards:

- 3px dark outer edge
- lighter upper-left inset edge
- darker lower-right inset edge
- 4–6px world shadow where elevation is necessary
- zero border radius

Panels may be grouped, but nested decorative panels are avoided. Inner records become recessed inventory slots.

### Inventory slots

Inputs, metric icon wells, status cells, event rows, and empty-state wells use a dark recessed slot. The slot has a dark upper-left inset and a lighter lower-right inset. Text is never placed directly on noisy texture.

### Chest readout

The Dashboard daily-cost surface is a large oak chest panel with two gold latches, a recessed coin slot, and one large gold readout. It does not include fake telemetry, progress bars, or decorative HUD geometry.

## Pixel system

- **Visual pixel:** 4px.
- **Spacing rhythm:** multiples of 8px for layout, with 4px reserved for edges and sprite movement.
- **Edges:** 2–4px, always integer aligned.
- **Corners:** square. No softened 2px pseudo-rounding.
- **Icons:** authored on a 16×16 grid using filled rectangles, rendered with `shape-rendering: crispEdges`.
- **Images:** actual attachment photos remain smooth and unmodified; only the frame is pixel-built.
- **Motion:** `steps(2, end)` for short equip/press feedback. No continuous bobbing, glowing, floating, or generic card lift.
- **Shadows:** hard offsets are allowed because block construction is the committed world, not a neobrutalist costume.

## Typography

### Fusion Pixel Chronicle

Self-hosted Fusion Pixel Font 10px proportional builds cover Simplified Chinese and Latin. The font is licensed under SIL OFL 1.1 and lives in `apps/web/public/fonts/`.

Use it for:

- route and section titles
- primary and secondary actions
- navigation labels
- dates and short status labels
- amounts, counts, and compact metadata

Do not use it for paragraphs, form explanations, audit notes, long timeline remarks, or error recovery text.

### System body

Chinese body copy uses PingFang SC, Hiragino Sans GB, Microsoft YaHei, or system-ui at a 16px baseline and roughly 1.6 line height. Pixel style must never make record reading tiring.

## Color semantics

- **Gold:** primary action, important cost readout, selected focus.
- **Grass green:** active route, held/healthy state, successful completion.
- **Water cyan:** charts, links, informational support.
- **Red clay:** destructive action, failed state, repair/risk.
- **Stone neutrals:** structure and ordinary data.
- **Oak:** navigation and world-save/chest metaphors.

Color is always paired with text or icon shape.

## Component rules

### Buttons

Buttons are block keys at least 46px high. A normal key has a 3px edge and inset bevel. Hover brightens or moves by one 4px pixel at most. Pressing shifts toward its shadow in two discrete frames. Disabled keys retain shape and readable labels.

### Forms

Labels remain outside fields. Fields are recessed dark slots in both themes because a consistent editing well is easier to identify than a light-theme inversion. Focus adds a visible gold frame. Errors include problem and recovery copy; color alone is insufficient.

### Asset cards

Asset cards are inventory records, not collectible-game rarity cards. They use a stone frame, optional real photo, category label, name, cost, and status. Hover equips the whole slot with a gold frame. Real photos are not pixelated.

### Timelines

Lifecycle and financial timelines are separate stone journal panels. Each record is a recessed slot connected by a 4px track. Current state uses green; cash flow uses gold or red with explicit direction labels. Audit correction controls remain visible.

### Charts

Chart lines are unsmoothed and use square symbols. Axes and tooltips use the same slot, edge, gold, water, and pixel-label system. Charts remain accessible data visualizations, not scenery.

## Responsive rules

- Desktop: 248px oak storage rail and a fluid world field.
- Under 1080px: narrower rail and two-column metric inventory.
- Under 840px: sticky oak hotbar header, stacked panels, full-width page actions.
- Under 560px: one-column metrics, 16px page gutters, readable 42–58px readout, no page-level horizontal overflow.
- Photos, tables, and chart canvases keep their intrinsic clarity and scroll only inside their own frame.

## Accessibility and interaction

- Keyboard users receive a skip link and visible gold focus frames.
- All interactive controls remain at least 42–46px high.
- Active navigation uses text, color, frame, and icon state together.
- Motion honors `prefers-reduced-motion`.
- Body contrast is at least 4.5:1 in both themes.
- No information depends only on hover.

## Avoid

- Industrial terminal/HUD styling
- black-and-neon cyberpunk palettes
- fake CRT scanlines or generic pixel grids
- smooth Lucide icons in core navigation and Dashboard
- copying copyrighted game sprites or textures
- blurred glass, soft pill cards, rounded SaaS controls
- pixel fonts for long Chinese prose
- gamified scores, rarity tiers, achievements, health bars, or fake quests

# Chronicle Sandbox Collection World

> Global source of truth for every Chronicle Web route. Product clarity and auditability remain mandatory; the sandbox-game material language carries the interface without turning records into scores.

## Direction

Chronicle is an **original sandbox collection inventory**. Minecraft-like block construction supplies the frame; Terraria-like 2D pixel detail supplies icons, slots, and compact state cues. No copyrighted game texture, sprite, character, or UI asset is copied.

## Tokens

### Geometry

- Visual pixel: `4px`
- Layout rhythm: `8px`
- Panel edge: `3px`
- Hero/chest edge: `4px`
- Radius: `0`
- Minimum touch target: `44px`; standard key height: `46px`

### Daylight

| Role          | Value     |
| ------------- | --------- |
| Sky canvas    | `#8fcbea` |
| Grass horizon | `#6e9f3f` |
| Oak rail      | `#795333` |
| Oak highlight | `#a87546` |
| Oak edge      | `#3d291d` |
| Stone panel   | `#c4c0ad` |
| Ink           | `#2b2119` |
| Muted ink     | `#51483c` |
| Cost          | `#8b4f0e` |
| Gain          | `#386c2a` |

### Night cave

| Role          | Value     |
| ------------- | --------- |
| Cave canvas   | `#1e2638` |
| Deep cave     | `#101521` |
| Dark oak rail | `#4a3025` |
| Stone panel   | `#41495a` |
| Recessed slot | `#202635` |
| Warm ink      | `#fff1c5` |
| Muted ink     | `#c0c2c5` |
| Gold          | `#ffd45a` |
| Grass         | `#8fbd45` |
| Water         | `#68c8d3` |
| Danger        | `#ef6a5b` |

## Typography

- `Fusion Pixel Chronicle`: short headings, navigation, actions, labels, dates, amounts, and counts.
- System Chinese sans: body copy, help, notes, errors, audit explanations, and long timeline text.
- Base body size: `16px`; line height: `1.6`.
- Pixel headings use normal font weight; do not synthesize heavy bitmap glyphs.

Font files and SIL OFL license are stored in `apps/web/public/fonts/`.

## Materials

### Oak

Oak owns desktop/mobile navigation and chest/save metaphors. Use horizontal plank courses, a dark edge, a light upper-left bevel, and a dark lower-right bevel. Oak is not used for ordinary data cards.

### Stone

Stone owns panels and page sections. Use a 3px edge with opposing inset highlights. A panel may also receive one 4–6px world shadow when it needs elevation.

### Slot

Slots own inputs, metric icon wells, timeline rows, table-like records, and empty-state wells. They are dark and recessed in both themes, with readable warm text.

## Icons

Core navigation and Dashboard icons use `PixelIcon.tsx`:

- 16×16 authored rectangle grid
- filled silhouette
- `shape-rendering: crispEdges`
- integer scaling only
- no emoji or arbitrary glyph replacement

Expand this set before adding new core Lucide icons. Real photos remain smooth; `image-rendering: pixelated` is not applied to attachments.

## Components

### Navigation

Desktop is an oak storage rail. Each route is a block key with an inset bevel and square icon slot. Active state is grass green plus a gold outer frame. Mobile is the same world expressed as a horizontally scrollable hotbar.

### Buttons

Gold commits, stone cancels or changes mode, red destroys. Hover is a one-pixel brighten/move; press shifts toward the hard shadow. Motion uses `steps(2, end)` and stops under reduced-motion.

### Dashboard

The daily-cost readout is an oak chest panel with two latches, a recessed coin slot, and one large gold value. The following metrics read as inventory slots. Charts are stone boards with unsmoothed lines and square symbols.

### Forms

Fields are recessed slots with external labels and visible gold focus. Errors state both problem and recovery. Disabled controls retain readable geometry.

### Asset records

Asset cards are inventory records, not rarity cards. Optional photos stay photographic. Gold framing communicates hover/focus; lifecycle state remains textual.

### Timelines

Lifecycle and money are separate stone journals. Rows are slots connected by a 4px track. Status, flow direction, correction, and void state remain explicit.

## Browser and responsive behavior

- Include a keyboard skip link before the oak rail.
- Keep page-level horizontal overflow at zero from 320px upward.
- Under 840px, replace the rail with a sticky oak hotbar.
- Under 560px, use one-column metrics and 16px gutters.
- Theme selection swaps daylight world and night cave without changing layout.
- Focus, caret, selection, scrollbar, tooltip, and chart colors belong to the palette.

## Bans

- No copied Minecraft/Terraria resources.
- No industrial control-panel or cyberpunk HUD leftovers.
- No fake scanlines, generic grid overlays, glow, glass, or smooth pill cards.
- No gamified score, rarity, achievement, health, or experience metaphors.
- No pixel font for paragraphs.
- No smoothing on pixel icons; no pixelation on real photos.

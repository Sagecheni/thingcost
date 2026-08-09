# Dashboard Override — Personal Asset Report

Status: active Dashboard prototype pending user review. This page intentionally overrides the pixel-oriented global master; other routes have not yet migrated.

## Direction

An original dark personal-asset report informed by publicly visible Guifou patterns, without copying its brand assets, exact layouts, promotional circuitry, copy, or icons.

- Near-black canvas and charcoal report surfaces
- Warm gold only for the primary held-net-investment value, selection, and primary actions
- Green for net gain, blue for informational series, orange/red for exceptions
- Chinese-friendly system sans, tabular numeric figures, no pixel font
- Subtle 9–18px radii, low-contrast borders, no glow, glass blur, material textures, or decorative gradients
- Quiet 140–180ms state feedback; no ornamental motion

## Information hierarchy

1. Held asset net investment — existing cash-ledger metric, never labeled market net worth
2. Holding daily cost — sum of each held asset's net cost divided by holding days
3. Service daily cost — sum of in-service assets' net cost divided by service days
4. Period net spending — outflows minus inflows for the selected period
5. Asset territory — category treemap by positive held net investment plus an exact ranked list
6. Switchable trend — net investment, holding daily cost, or service daily cost
7. Efficiency rankings — highest holding daily cost and longest held
8. Status and upcoming reminders — utility information, visually secondary

## Data rules

- No manual or AI valuation is introduced.
- Unknown-cost assets are excluded from monetary totals and only surfaced when any exist.
- Negative net cost remains valid and uses explicit net-gain language.
- The treemap uses positive net investment for area; the adjacent ranked list remains the exact, accessible source for all categories, including non-positive ones.
- Base currency comes from the Dashboard contract; no CNY hard-coding.

## Responsive behavior

- Desktop: overview split panel; treemap beside category ranking; paired efficiency and utility panels.
- Tablet: overview metrics and report panels progressively stack.
- Mobile: one-column report, three-column wrapped status summary, full-width controls, shorter charts, no document-level horizontal scrolling.

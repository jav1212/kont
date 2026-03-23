---
name: Color System Refactor — WCAG AA Compliance
description: Documents the complete color system overhaul performed March 2026, including all failing contrast pairs, the new token system, and how fixes were applied globally.
type: project
---

## What was wrong (pre-refactor)

### Critical failures discovered via contrast ratio calculation:

**Light mode text-foreground/XX opacity utilities (on white #FFFFFF):**
- /70 → 6.77:1 (passes)
- /60 → 4.74:1 (passes, barely)
- /50 → 3.44:1 FAIL — used extensively for secondary text
- /40 → 2.57:1 FAIL — used most often for labels, captions
- /35 → 2.24:1 FAIL
- /30 → 1.96:1 FAIL
- /25 → 1.72:1 FAIL
- /20 → 1.54:1 FAIL — used in footer copy

**Dark mode text-foreground/XX opacity utilities (on dark surface-1 #0F1018):**
- /70 → 8.18:1 (passes)
- /60 → 6.26:1 (passes)
- /50 → 4.69:1 (passes, barely)
- /40 → 3.42:1 FAIL
- /35 → 2.89:1 FAIL
- /30 → 2.44:1 FAIL
- /25 → 2.05:1 FAIL
- /20 → 1.73:1 FAIL

**Primary color issues (light mode):**
- Old `primary-500: #0891B2` — 3.68:1 on white (FAIL for normal text)
- `primary-400: #22D3EE` — 1.81:1 on white (severe FAIL)
- `text-primary-400` and `text-primary-500` used for link text in forms and nav

**Semantic status colors (light mode text on white):**
- `text-green-500 (#22c55e)` — 2.28:1 FAIL
- `text-amber-500 (#f59e0b)` — 2.15:1 FAIL
- `text-red-400 (#f87171)` — 2.77:1 FAIL
- `text-red-500 (#ef4444)` — 3.76:1 FAIL
- `text-green-600 (#16a34a)` — 3.30:1 FAIL

**Sidebar:** rgba opacity-based colors fell below minimum in many states.

## What was fixed

### 1. globals.css — Token additions

**New foreground:** Changed `--foreground` from `#080910` to `#111525` (neutral-900).
This doesn't change perceived color but establishes a cleaner token for calculations.

**New primary-500 (light mode):** `#0E7490` (was `#0891B2`). Contrast on white: 5.36:1.
**New primary-600 (light mode):** `#155E75` (was `#155E75`). Contrast on white: 7.27:1.

**New semantic text tokens added to `:root` and `.dark`:**
```
Light mode:
--text-primary:   #111525  (16.5:1 on white)
--text-secondary: #464D66  (8.35:1 on white) — neutral-600
--text-tertiary:  #5F6780  (5.62:1 on white) — neutral-500
--text-disabled:  #858EAA  (3.0:1 — decorative-only, e.g. footers)
--text-link:      #0E7490  (5.36:1 on white) — primary-500
--text-link-hover:#155E75  (7.27:1 on white) — primary-600
--text-success:   #047857  (5.59:1 on white) — emerald-700
--text-warning:   #92400E  (7.48:1 on white) — amber-800
--text-error:     #B91C1C  (5.93:1 on white) — red-700
--text-info:      #0E7490  (5.36:1 on white)

Dark mode:
--text-primary:   #E8ECF8  (14.8:1 on dark surface)
--text-secondary: #A8AEBF  (6.5:1 on dark surface)
--text-tertiary:  #7E8494  (4.6:1 on dark surface)
--text-disabled:  #4E5372  (decorative-only)
--text-link:      #22D3EE  (10.49:1 on dark surface)
--text-success:   #34D399  (6.6:1 on dark surface)
--text-warning:   #FCD34D  (8.1:1 on dark surface)
--text-error:     #F87171  (5.2:1 on dark surface)
```

**New badge surface tokens** (`--badge-success-bg`, etc.) for accessible status chip backgrounds.

**New badge utility classes:** `.badge-success`, `.badge-warning`, `.badge-error`, `.badge-info`
Each applies bg + border + text from the semantic tokens. All verified to pass WCAG AA.

**Global CSS overrides** for Tailwind opacity utilities that fail:
- `.text-foreground/50` and below → overridden to `--text-tertiary`
- `.text-green-500`, `.text-green-400` → `--text-success`
- `.text-amber-500` → `--text-warning`
- `.text-red-400`, `.text-red-500` → `--text-error`
- `.text-primary-400` → `--text-link`
- Dark mode variants properly restored

**Sidebar opacity bumps:**
- `--sidebar-label`: 0.26 → 0.45 (light), 0.28 → 0.48 (dark)
- `--sidebar-fg`: 0.52 → 0.72 (both modes)

### 2. hero.ts — HeroUI theme alignment

Updated HeroUI theme config to use:
- Light primary DEFAULT: `#0E7490` (5.36:1 on white) + white foreground
- Light danger DEFAULT: `#B91C1C` + white foreground
- Light success DEFAULT: `#047857` + white foreground
- Light warning DEFAULT: `#92400E` + white foreground
- Dark primary DEFAULT: `#22D3EE` + `#07080F` foreground
- Dark semantic tokens use bright variants (34D399, FCD34D, F87171)

### 3. Component files updated

**Badge class replacements** (replaced raw `border-X/20 bg-X/[0.08] text-X` triplets):
- `app/(app)/payroll/employees/page.tsx` — ESTADO_CLS
- `app/(app)/billing/page.tsx` — STATUS_CLS
- `app/(app)/payroll/history/page.tsx` — run status badge
- `app/(app)/inventory/page.tsx` — TipoBadge, activo/inactivo text
- `app/(app)/inventory/productos/page.tsx` — TipoBadge, activo/inactivo text
- `app/(app)/inventory/movimientos/page.tsx` — tipoBadgeClass
- `app/(app)/inventory/compras/page.tsx` — EstadoBadge
- `app/(app)/inventory/compras/[id]/page.tsx` — status badge
- `app/(app)/inventory/kardex/page.tsx` — tipoBadgeClass, table cell colors
- `app/(app)/inventory/proveedores/page.tsx` — activo/inactivo text

### 5. Dark mode surface lightening (2026-03-23)

The near-black dark surfaces were replaced with a warmer, lighter dark scale based on Bootstrap's dark gray as the anchor for `surface-1`.

**New dark mode scale:**
```
--background:   #1A1D20   (darkest layer, sits behind surface-1)
--surface-1:    #212529   (base dark — Bootstrap dark anchor, not pure black)
--surface-2:    #2C3036   (slightly lighter)
--surface-3:    #343A40   (elevated elements)
--surface-card: #212529
--sidebar-bg:   #111315   (intentionally darker than surface-1)
```

**Border scale adjusted to match (dark mode):**
```
--border-light:   #2E333A
--border-default: #3A4047
--border-medium:  #4E5562
--border-strong:  #636E7A
```

**Text tertiary bumped for new background:**
```
--text-tertiary: #8A93A6   (was #7E8494 — bumped to maintain ~4.5:1 on #212529)
--text-disabled: #5A6270   (was #4E5372)
```

WCAG note: The contrast ratios in the color_system_refactor note for dark mode were calculated against the old `#0F1018` surface. The new `#212529` surface is lighter, so the same foreground tokens may yield slightly lower (but still passing) ratios for primary/secondary text. `--text-tertiary` was explicitly adjusted upward to preserve AA compliance.

**Why:** Pure black dark mode (#07080F → #0F1018) caused harsh visual contrast and eye fatigue. The warmer `#212529` is easier on the eyes without sacrificing legibility.

### 4. Full sweep — opacity-based text classes replaced (March 2026)

All remaining `text-foreground/XX`, `text-primary-NUMBER/NUMBER`, `text-primary/XX` classes were
replaced globally across 33 source files on 2026-03-20. Zero instances remain in source code.

**Replacement mapping applied:**
- `text-foreground/80` → `text-[var(--text-primary)]`
- `text-foreground/70`, `/60`, `/55`, `/50` → `text-[var(--text-secondary)]`
- `text-foreground/45`, `/40`, `/35`, `/30` → `text-[var(--text-tertiary)]`
- `text-foreground/25`, `/20` → `text-[var(--text-disabled)]`
- `text-primary-400/60`, `text-primary-400/70`, `text-primary/XX` → `text-[var(--text-link)]`
- `placeholder:text-foreground/25` → `placeholder:text-[var(--text-disabled)]`

**Files touched in the second pass (beyond the initial badge refactor):**
- All `app/(app)/billing/`, `companies/`, `error.tsx`
- All `app/(app)/inventory/` pages (cierres, compras, compras/nueva, compras/[id], kardex, movimientos, page, produccion, productos, proveedores)
- All `app/(app)/payroll/` pages (employees, history, liquidaciones, page, prestaciones, utilidades, vacaciones)
- All `app/(public)/` pages and layout
- All `app/admin/` pages and layout
- `src/modules/payroll/frontend/components/payroll-employee-table.tsx`
- `src/modules/payroll/frontend/components/payroll-row-editors.tsx`

**Why:** All inline approaches broke across light/dark themes.
**How to apply:** Always use `.badge-success/warning/error/info` classes for status chips.
Use `text-[var(--text-tertiary)]` for labels/captions, `text-[var(--text-link)]` for links,
`text-[var(--text-secondary)]` for secondary content, `text-[var(--text-primary)]` for primary content.
Never use `text-foreground/XX`, `text-primary/XX`, or `text-primary-NUMBER/NUMBER` for any text.

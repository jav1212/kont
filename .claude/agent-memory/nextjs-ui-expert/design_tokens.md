---
name: Design tokens and UI conventions
description: KONT's design system tokens, component wrappers, visual vocabulary, and "no transparency, no shadow" rule for the tools module
type: reference
---

# KONT design system

## Stack
- Next.js 16 App Router, Tailwind 4, HeroUI as component library
- Font stack: `font-mono` (Geist Mono) is the **default body font** via `font-family: var(--font-mono)` in `body`. `font-sans` (Darker Grotesque) exists but is rarely used — the app has a monospace/terminal aesthetic across the board.
- `font-variant-numeric: tabular-nums` applied globally to `.font-mono`.

## Color tokens (CSS vars in `app/globals.css`)
- Background chain: `bg-background` → `bg-surface-1` (cards) → `bg-surface-2` (inputs/subtle fills) → `bg-surface-3` (elevated)
- Borders: `border-light` (default), `border-medium` (hover/stronger)
- Primary: `primary-500` is Konta Orange. `#D93A10` in light, `#FF4A18` in dark. WCAG-safe.
- Text tokens exist (`text-text-primary`, `text-text-secondary`, `text-text-tertiary`) but components tend to use `text-foreground` + opacity utilities, which `globals.css` overrides to guarantee AA contrast at `/50`, `/40`, `/35`, etc.
- Semantic status colors available: `text-success`, `text-warning`, `text-error`, `text-info`, plus badge-* tokens. Bare `text-green-500`/`text-red-500` are overridden in globals.css to map to the accessible variants.

## Component wrappers (canonical)
- `BaseButton.Root` / `BaseButton.Icon` from `src/shared/frontend/components/base-button.tsx`. Variants: primary, secondary, ghost, danger, outline, dangerOutline. All uppercase-mono label by default, `rounded-lg`, sizes sm/md/lg.
- `BaseAccordion.Root` + `BaseAccordion.Item` + `accordionItemProps({ title, subtitle })` from `base-accordion.tsx`. **`selectionMode` default is `multiple`** — pass `selectionMode="single"` for single-open FAQ style.
- `BaseSelect` from `base-select.tsx` is a tagged/chips-style multi-select (designed for filters). For inline single-value selects (currency picker, period picker) prefer direct HeroUI `<Select>` from `@heroui/react`.
- `BaseInput`, `BaseSwitch`, `BaseCheckbox`, `BaseTable` also exist.

## Spacing/size tokens (`src/shared/frontend/sizes.ts`)
`APP_SIZES.text.*`, `APP_SIZES.button.*`, `APP_SIZES.nav.*`. Target demographic is finance pros 40-60y → slightly larger than SaaS-default. Labels are `text-[12px] tracking-[0.12em]`, table body is 15px, buttons sm=h-8, md=h-9, lg=h-10.

## Visual vocabulary
- Uppercase mono labels with `tracking-[0.12em]` to `tracking-[0.18em]` everywhere.
- Radii: `rounded-lg` for inputs/buttons (8px), `rounded-xl` for small cards, `rounded-2xl` for large cards (16px).
- Accent color usage: the primary-500 orange is used sparingly for active/selected states, hover indicators, and the brand chart line `rgb(255,74,24)`.

## "Flat, no transparency" rule (tools module, may apply app-wide)
User directive (2026-04): no tinted alpha backgrounds, borders, rings, or box-shadows. The tools module was stripped of all of these. Canonical replacements:

| Forbidden | Use instead |
|---|---|
| `bg-primary-500/[0.06..0.12]` (tinted result/highlight plates) | `bg-primary-500` with `text-white` (treat as CTA-like) or `bg-surface-2` for subtle differentiation |
| `bg-surface-2/30..80` | `bg-surface-2` (no alpha) |
| `border-primary-500/20..60` | `border-primary-500` (solid accent) or `border-border-light` (neutral) |
| `ring-primary-500/10..20`, `ring-inset`, tinted `ring-emerald-500/20` etc | remove entirely — keep only `focus-visible:ring-2 focus-visible:ring-primary-500` (solid, for a11y) |
| `bg-emerald-500/10` / `bg-red-500/10` (trend badges) | `bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300` and the red analog |
| `shadow-[custom]`, `shadow-sm/md/lg`, `hover:shadow-*`, `dark:shadow-*` | remove — rely on border + surface color chain for separation |
| `bg-gradient-to-r/br from-primary-500/[0.04]...` (header wash) | remove — keep only the `border-b` that separates sections |
| `radial-gradient(...)` decorative glows | remove entirely |

**Exceptions allowed**: `text-foreground/40..70` (text opacity is typographic hierarchy, not "transparency"). SVG-internal `stopOpacity` for gradient fills inside chart paths (part of the line treatment, not a tinted background). HeroUI popover shadows injected by the library for the Select dropdown popover (cannot be controlled by consumer).

## Marketing layout
`app/(marketing)/layout.tsx` provides ambient orange radial gradients behind content. Tools shell doesn't need its own hero background — the marketing layout already has one.

## Tools module context
- `src/modules/tools/frontend/components/` — BCV currency calculator components.
- `tools-shell.tsx` is the orchestrator; mounted in `(marketing)/herramientas/divisas` (public+SEO) and `(app)/tools/divisas` (authed).
- Data layer is via `useBcvRates` and `useBcvHistory` hooks with `fetch("/api/bcv/...")`. Do not change data layer.
- Shared within the module: `CurrencyInlineSelect` (sizes sm/md/lg, wraps HeroUI Select with Flag SVG + code), `AnimatedNumber` (AnimatePresence crossfade on value change), `RateSparkline` (tiny SVG trend line consuming `useBcvHistory`), and `RateCard.Skeleton` (compound loading state). Prefer reusing these over duplicating the patterns.
- Stagger convention for the shell: `STAGGER_STEP = 0.08s` between sections, `duration 0.35`, `ease "easeOut"`, `y: 8 → 0`, on mount only (not on re-renders).

## Flag rendering — <Flag> component (`flag.tsx`)
Windows does not ship flag glyphs in Segoe UI Emoji — emoji flags like `🇺🇸` render as "US" inside a box. The tools module uses an inline-SVG `<Flag code="US" size={16} />` component that renders identically across OS. Currency metadata carries `countryCode: string` (ISO 3166-1 alpha-2); use `currencyToCountry(code)` helper from `utils/currency-codes.ts` when needed. Unknown codes fall back to a neutral 2-letter chip. All 12 BCV currencies have custom SVG renderers (US, EU, CN, GB, JP, CA, MX, BR, AE, TR, RU, VE).

**Do not reintroduce emoji flags in the tools module.** The `CurrencyMeta.flag` emoji field was removed from `currency-codes.ts` — use `Flag` component exclusively.

## Tools module typography hierarchy
- Converter input (amount): `text-[18px]`
- Converter result plate: `text-[22px] sm:text-[26px]` (on solid `bg-primary-500` with `text-white`)
- Rate card hero number: `text-[34px] sm:text-[40px]`
- USD hero quote (public): `text-[32px] sm:text-[40px]`

## Inline currency select widths
`CurrencyInlineSelect` uses wider bases to accommodate the SVG flag + ISO code + chevron without overlap:
- sm: `w-[108px]`, trigger `h-10 pl-3 pr-8`
- md: `w-[116px]`, trigger `h-11 pl-3 pr-8`
- lg: `w-[124px]`, trigger `h-12 pl-3 pr-8`

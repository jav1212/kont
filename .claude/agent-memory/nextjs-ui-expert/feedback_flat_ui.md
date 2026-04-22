---
name: User prefers flat UI — no tinted alpha backgrounds, no shadows
description: For the tools module (and likely the rest of KONT), avoid transparencies on backgrounds/borders/rings and any box-shadows. Keep text opacity as typographic hierarchy.
type: feedback
---

User explicitly pushed back on a "premium-but-floaty" design I delivered for the BCV calculator and asked me to redo it. The two non-negotiables are:

1. **No alpha on backgrounds/borders/rings.** Every tint like `bg-primary-500/[0.06]`, `bg-surface-2/40`, `border-primary-500/25`, `ring-primary-500/15`, `bg-emerald-500/10`, `ring-inset`, decorative `radial-gradient`, or `bg-gradient-to-r from-primary/[0.04]` must be replaced with solid colors. Tinted "highlight" states become either `bg-primary-500 text-white` (treated as CTA) or `bg-surface-2` (subtle differentiation from card). Badges: `bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300` instead of `bg-emerald-500/10`.

2. **No box-shadows at all.** Strip every `shadow-[custom]`, `shadow-sm/md/lg`, `hover:shadow-*`, `dark:shadow-*`. Separation comes from borders (`border-border-light` default, `border-border-medium` hover/emphasis, `border-primary-500` accent) and the surface color chain.

**Why:** The user wants a crisp, flat, "screen-of-numbers" look — KONT's mono/terminal aesthetic amplified. Alpha fills and shadows make the UI look like a floating glass-morphism SaaS template; they do not match the brand. The surface chain (`bg-background → bg-surface-1 → bg-surface-2 → bg-surface-3`) already provides enough visual separation without additional transparency.

**How to apply:**
- When introducing a "highlight" or "accent" element (result plate, active state, CTA chip), pick: solid `bg-primary-500 + text-white`, or solid `bg-surface-2`. Never `/[0.08]` style.
- Focus rings: keep `focus-visible:ring-2 focus-visible:ring-primary-500` — it's solid, not alpha. This is a11y, not decoration.
- Text opacity (`text-foreground/50`, `/60`, `/70`) is **fine** — KONT's `globals.css` overrides those to keep AA contrast. It's typographic hierarchy, not "transparency".
- SVG-internal gradients (`stopOpacity` inside `<linearGradient>` for chart area fills) are **fine** — they're part of a drawn path, not a tinted container.
- HeroUI popover internal shadows are hard to remove and are allowed (library-controlled).

**Windows flags caveat** tied to this same redesign iteration: don't use emoji flags (`🇺🇸`, `🇻🇪`, etc.) — Windows does not render them as flags, only as letter boxes. Use the `<Flag code="US" />` SVG component at `src/modules/tools/frontend/components/flag.tsx` which covers the 12 BCV currencies.

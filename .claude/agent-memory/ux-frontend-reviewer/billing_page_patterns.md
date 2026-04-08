---
name: Billing Page UX Patterns
description: UX review findings for the billing page — plan comparison grid, interaction design, accessibility, color conventions
type: project
---

## Review 2026-04-08 — Plan comparison grid added (5-card layout)

### Critical: xl:grid-cols-5 produces ~180px cards at 1280px viewport

At 1280px (xl breakpoint), 5 cards in a 5-column grid with gap-3 = roughly 180px per card. The featured Emprendedor
card has a 22px bold price, feature list, and CTA at 11px text. At 180px wide that price wraps, the feature labels
clip, and the CTA button is barely tappable. The intermediate lg:grid-cols-3 breakpoint is correct, but the jump
to 5 columns at xl is too aggressive. A 2→3→4→5 progression is safer with xl needing wider container (max-w-6xl
minimum) or settling at 4 columns max.

**Why:** Card content (price, feature list at 11px, CTA) has a minimum readable width of ~200px. At gap-3 (12px),
5 columns in max-w-4xl (896px) = (896 - 48)/5 = ~169px. That is narrower than the minimum.

**How to apply:** Change `max-w-4xl` on the page wrapper to `max-w-6xl`, or cap at `xl:grid-cols-4` and let
Empresarial's "Contáctanos" card be the odd one out. Also add `min-w-[160px]` to each card as a floor.

### Critical: "Seleccionar" button is a raw `<button>` — not BaseButton

The CTA button in plan cards uses a handwritten `<button>` with manual hover classes, bypassing BaseButton.Root.
This means it has no focus-visible ring, no loading state prop, and cannot accept the `loading` flag if async
state is ever added. The "Contáctanos" `<a>` and "Activo" `<div>` CTAs also lack keyboard focus rings.

**How to apply:** Replace with `<BaseButton.Root variant="primary" size="sm" fullWidth>Seleccionar</BaseButton.Root>`.
For the "Activo" display state, use `<BaseButton.Root variant="secondary" size="sm" fullWidth isDisabled>`.
For "Contáctanos", use `<BaseButton.Root as="a" href="mailto:..." variant="outline" size="sm" fullWidth>`.

### Critical: Gratuito plan has no CTA — leaves users with a blank card bottom

`plan.priceMonthlyUsd === 0 ? null` renders nothing in the CTA slot. If the user is on a paid plan and wants
to downgrade to Gratuito, there is no affordance. Even for new users, an empty card bottom breaks visual rhythm.

**How to apply:** Add `<BaseButton.Root variant="ghost" size="sm" fullWidth onClick={() => openFormForPlan(plan.id)}>Seleccionar</BaseButton.Root>`
for Gratuito — or at minimum a placeholder `<div className="h-8" />` to maintain card height consistency.

### Issue: Both "Popular" and "Plan Actual" banners can render simultaneously

If the user is on the Emprendedor plan, both the "Popular" banner and the "Plan Actual" banner render stacked
at the top of that card (isFeatured AND isCurrent are both true). Two colored bars in a 180px card is visually
broken. "Plan Actual" should always win — suppress "Popular" when isCurrent.

**How to apply:** `{isFeatured && !isCurrent && <div ...>Popular</div>}`

### Issue: Payment form is inline (AnimatePresence) but has no scroll-into-view behavior

The form appears below the plan grid via AnimatePresence. On small screens, users click "Seleccionar" and nothing
appears to happen because the form renders below the fold. No `scrollIntoView` or focus trap — users are left
confused.

**How to apply:** After `setFormOpen(true)` in `openFormForPlan`, call `formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })`.
Alternatively, move to a Modal/Drawer (HeroUI Modal) which auto-focuses and is always in-viewport.

### Issue: Page title text-foreground/70 and text-foreground/40 violate the no-opacity rule

Line 248: `text-foreground/70` (h2 heading) — overridden by globals.css to --text-tertiary but semantically
should be `text-text-secondary` for a heading.
Line 249: `text-foreground/40` (subtitle) — overridden to --text-tertiary which is correct, but explicit token
should be used.

### Issue: Amount display field has no htmlFor/id — "Monto a pagar" label is unlinked

The read-only amount `<div>` (line 534) has no id attribute, and its `<label>` has no htmlFor. It is a `<div>`
not an `<input>` — correct approach is `aria-label` on the div or wrap with role="status".

### Stale pattern (from 2026-03-29 review — now fixed)

- htmlFor/id pairs: now present on Plan, Ciclo, Método selects — good.
- selCycle reset on plan change: `openFormForPlan` calls `setSelCycle("monthly")` — fixed.
- Badge classes: STATUS_CLS uses `badge-success` / `badge-error` / `badge-warning` correctly.
- Success/error banners use `badge-success` + `text-text-success` / `badge-error` + `text-text-error` — fixed.

## Good patterns established in this page

- Promise.all for three concurrent initial fetches
- `loadAll` wrapped in useCallback to avoid re-creation
- `formatDate` uses es-VE locale
- `tabular-nums` on all monetary and date values
- History table uses semantic table/thead/tbody (not div soup)
- STATUS_CLS and STATUS_LABEL maps are clean, extensible
- `motion.div` stagger (delay: index * 0.06) on plan cards creates smooth cascade entrance
- `overflow-x-auto` on the history table prevents horizontal page scroll
- `admin_note` progressive disclosure via `line-clamp-1 group-hover:line-clamp-none` is a solid pattern
- Capacity progress bar uses `Math.min(100, ...)` — correctly caps the bar at 100%
- Custom SVG spinner is lightweight and consistent with the design system

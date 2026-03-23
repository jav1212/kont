---
name: Landing page patterns
description: Structure, copy tone, and component patterns for the public landing page at app/(public)/page.tsx
type: project
---

The landing page is a "use client" component (because of pricing fetch + URL hash parsing) so it cannot export Next.js metadata. Any SEO changes must go in app/(public)/layout.tsx, which is shared with sign-in/sign-up pages — scope changes carefully.

## Page narrative arc (sections in order)
1. Hero — "Gestión precisa. siempre." — broadened from payroll-only to multi-module (2026-03-23)
2. Stat strip — BCV / employees / error rate / time to start (LOTTT removed 2026-03-23)
3. Feature grid — 4 cards: Nómina por lotes, Indexación BCV, Inventario en tiempo real, Auditoría
4. Module carousel — "Una plataforma. Todos tus procesos."
5. Pricing — cycle toggle (monthly / quarterly / annual) + module selector tabs + plan cards
6. Bottom CTA strip

## Legal copy removal (2026-03-23)
All references to Venezuelan labor law removed from landing page copy:
- LOTTT, FAOV, IVSS, SSO, RPE, "base legal", "Marco legal", "cumple con la ley"
- Hero h1 changed from "Nómina" to "Gestión"
- Hero subtitle rewritten to focus on product breadth (nómina + inventario + documentos)
- Stats: removed `{ value: "LOTTT", label: "Marco legal" }`, replaced with `{ value: "2 min", label: "Para empezar" }`
- Feature "Cálculo LOTTT" replaced with "Nómina por lotes" (non-law copy)
- Plan bullet "Cálculo LOTTT + BCV" replaced with "Recibos y reportes" and "Indexación BCV" (separate)
- Bottom CTA: "primera nómina" → "primera empresa"
BCV (central bank exchange rate) was kept — it is a general business utility, not legal compliance copy.

## Section header pattern
Every section starts with:
- A horizontal rule stub: `<div className="h-px w-8 bg-primary-500/60" />`
- An eyebrow label in `font-mono text-[12px] uppercase tracking-[0.28em] text-text-link`
- An `h2` in `font-mono text-[28px] font-black uppercase tracking-tighter text-foreground`
- The secondary line in the h2 uses `text-[var(--text-disabled)]` for a faded-out effect

## Plans module selector tabs (added 2026-03-23)
Above the plan cards there is a segmented control (pill tabs) to switch between modules:
- Only shown when `availableTabs.length > 1` (guard for the current single-module state)
- Tab list: `role="tablist"`, each button: `role="tab"` + `aria-selected`
- Active tab: `bg-surface-2 text-foreground border border-border-light shadow-sm`
- Idle tab: `text-foreground/40 hover:text-foreground/70 border border-transparent`
- `BILLABLE_MODULES` constant controls order: payroll → inventory → documents
- Payroll tab always present; other tabs appear only if `moduleSlug` data exists in fetched plans
- Plans with `moduleSlug === null` fall through to the active tab (backward compat)
- `moduleSlug` is resolved via a JOIN: `plans.product_id` FK → `products.slug` column. There is no `module_slug` column on `plans`. The API at `app/api/billing/plans/route.ts` must SELECT with `products ( slug )` and map `p.products.slug` to `moduleSlug`. The old cast `(p as Record<string, unknown>).module_slug` always returns null — this was the root bug (all plans showed on every tab).

## Plan card feature bullets
Feature bullets inside plan cards are now module-agnostic where possible:
- Companies count, employees count — from DB fields, always shown
- "Recibos y reportes" — replaces old law-specific "Cálculo LOTTT + BCV"
- "Indexación BCV" — retained, law-free

## ModuleCarousel component
Location: `src/shared/frontend/components/module-carousel.tsx`
- Pure React state + CSS transform, no external carousel library
- Track strategy: track width = TOTAL * 100%, each card = 1/TOTAL of track = 100% of container
- Translate formula: `translateX(-${index * (100 / TOTAL)}%)` on the track
- Auto-advances every 4000ms via setTimeout (not setInterval — resets cleanly on index change)
- Pauses on hover and on focus-within (onFocusCapture / onBlurCapture)
- Keyboard: ArrowLeft/ArrowRight on a tabIndex={0} region
- Dots: role="tablist" + role="tab" + aria-selected per dot; active dot is wider pill (w-5) vs circle (w-1.5)
- Cards: aria-hidden={!active} on inactive cards
- Active card styling: border-primary-500/30, bg-primary-500/[0.04], icon bg-primary-500/15 text-primary-500

**Why:** The app grew from payroll-only to 5 modules. The carousel communicates platform breadth without making the landing page feel like a feature dump.
**How to apply:** When adding new modules to APP_MODULES in navigation.ts, also add them to the MODULES array in module-carousel.tsx (same SVG icon as in app-sidebar.tsx). If the new module has billing plans with a DB `module_slug`, also add it to `BILLABLE_MODULES` in the landing page.

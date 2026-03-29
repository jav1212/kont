---
name: Billing Page UX Patterns
description: UX review findings for the billing page (2026-03-29) — upsell card visibility bug, cycle stale state, label/htmlFor gap, raw color tokens in banners
type: project
---

## Critical: upsell cards invisible to zero-subscription users

Both inventory and accounting upsell cards are wrapped inside `{subscriptions.length > 0 && ...}`.
A brand-new user with no subscriptions sees no upsell cards — the highest-value moment is missed.

**Why:** The upsell cards were added inside the "Módulos activos" guard block rather than as a parallel section.

**How to apply:** The section heading "Módulos activos" can be conditional, but upsell cards must render regardless of whether any subscriptions exist.

## Critical: stale selCycle state when plan changes

When the user switches selPlanId to a plan with no quarterly/annual pricing, selCycle may retain a stale value ("quarterly"/"annual"). The cycle options disappear from the DOM but state is not reset. planPrice() silently falls back to monthly, so the displayed amount mismatches the user's belief about what cycle they are paying for.

Fix: reset selCycle to "monthly" whenever selPlanId changes.

## Accessibility: form labels not programmatically linked

All labels in the payment form use proximity-based association only — no htmlFor/id pairs. Screen readers will not associate labels with inputs. Every label needs `htmlFor="field-id"` and every control needs a matching `id`.

## Accessibility: icon-only close button missing aria-label

The close (X) button on the payment form has no accessible name. Add `aria-label="Cerrar formulario de pago"`.

## Color token: success/error banners use raw Tailwind values

Success banner (submitOk): `border-green-500/20 bg-green-500/[0.05] text-green-500` — should use `badge-success` + `text-text-success`.
Error banner (dataError): same pattern with `red-500` — should use `badge-error` + `text-text-error`.
`text-green-500` and `text-red-500` are overridden in globals.css but the bg/border values are not.

## Color token: "No activo" badge uses --text-disabled (3.0:1, fails WCAG AA)

Both upsell card "No activo" badges use `text-[var(--text-disabled)]` which is documented as decorative-only (3.0:1).
Fix: use `text-[var(--text-tertiary)]` (5.62:1).

## Good patterns established in this page

- Dashed border + text-disabled combination correctly communicates "not yet active" without relying on color alone
- Icon SVG attrs (viewBox, strokeWidth, strokeLinecap, strokeLinejoin) are consistent across all three product icons — same optical weight
- optgroup grouping of plans by module is the semantically correct HTML choice
- selCycle dynamically shows/hides quarterly/annual options based on selectedPlan — error prevention via constraint
- loadAll uses Promise.all for four concurrent initial fetches
- Submit button shows Spinner + label change during async op, with disabled guard
- formatDate uses es-VE locale (correct)
- History table uses semantic table/thead/tbody (not div soup)

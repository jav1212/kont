---
name: Typography Scale — Inventory Module
description: Approved font-size scale after the 40-60yr user legibility audit; canonical sizes for each element type across all inventory pages
type: project
---

Completed full typography audit and upgrade across all inventory module pages and shared components (2026-03-21). The target audience (40–60 year old Venezuelan accountants) reported difficulty reading the original dense monospace type.

## Canonical minimum sizes (enforce going forward)

| Element | Min size | Notes |
|---|---|---|
| Page `h1` | `text-[16px]` | `tracking-[0.14em]` |
| Section `h2` in panels | `text-[14px]` | `tracking-[0.12em]` |
| Sidebar `h3` / panel sub-headers | `text-[12px]` | `tracking-[0.14em]` |
| Form labels (`labelCls`) | `text-[11px]` | `tracking-[0.12em]` — was `text-[9px] tracking-[0.18em]` |
| Form inputs (`fieldCls`) | `text-[14px]`, `h-10` | — was `text-[13px]`, `h-9` |
| Table column headers | `text-[11px]` | `tracking-[0.14em]` — was `text-[9px]` |
| Table body cells | `text-[13px]` | — was `text-[11px]` |
| Status badges / chips | `text-[11px]` | — was `text-[9px]` |
| Body text / card text | `text-[13px]` | — was `text-[11px]` |
| Secondary/helper text | `text-[11px]` | — was `text-[9px]` or `text-[8px]` |
| Error/success banners | `text-[13px]` | — was `text-[11px]` |
| Loading/empty state text | `text-[13px]` | — was `text-[11px]` |
| Page subtitle | `text-[12px]` | — was `text-[10px]` |
| Primary action buttons | `h-9 text-[12px]` | — was `h-8 text-[11px]` |
| Sidebar nav items | `text-[12px]` | via `NAV_ITEM_BASE` const |
| Sub-nav link items | `text-[12px]` | — was `text-[10px]` |

## Tracking adjustment rule
Larger font → reduce tracking proportionally. Examples:
- `tracking-[0.24em]` → `tracking-[0.18em]` (section labels)
- `tracking-[0.18em]` → `tracking-[0.12em]` (form labels)
- `tracking-[0.14em]` → `tracking-[0.12em]` (buttons)

## Files completed
- `src/shared/frontend/components/base-table.tsx`
- `src/shared/frontend/components/base-input.tsx`
- `src/shared/frontend/components/base-select.tsx`
- `src/shared/frontend/components/app-sidebar.tsx`
- `app/(app)/inventory/page.tsx`
- `app/(app)/inventory/productos/page.tsx`
- `app/(app)/inventory/compras/page.tsx`
- `app/(app)/inventory/compras/nueva/page.tsx`
- `app/(app)/inventory/ventas/page.tsx`
- `app/(app)/inventory/libro-ventas/page.tsx`
- `app/(app)/inventory/cierres/page.tsx`
- `app/(app)/inventory/movimientos/page.tsx`
- `src/modules/inventory/frontend/components/factura-items-grid.tsx`

**Why:** Users aged 40–60 reported illegibility with the original scale (many elements at 8–10px). The Geist Mono font at small sizes on retina displays rendered as visually smaller than expected.

**How to apply:** Never introduce `text-[8px]`, `text-[9px]`, or `text-[10px]` for any user-facing text in inventory pages. Use `text-[11px]` as the absolute floor for secondary/helper text, `text-[13px]` as the floor for body/cell text.

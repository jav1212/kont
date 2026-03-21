---
name: Typography Scale — Shared Components + APP_SIZES
description: Canonical font-size scale for KONT; now centralized in sizes.ts — do not hardcode px sizes in shared components
type: project
---

Completed full typography audit and upgrade across all inventory module pages and shared components (2026-03-21). Then centralized all sizes into `src/shared/frontend/sizes.ts` (2026-03-21). The target audience (40–60 year old Venezuelan accountants) reported difficulty reading the original dense monospace type.

## Canonical source of truth

**`src/shared/frontend/sizes.ts`** — `APP_SIZES` object is the single source. All five shared components (`base-table`, `base-input`, `base-select`, `base-button`, `app-sidebar`) import from it. Do NOT hardcode `text-[Npx]` in those files — edit `sizes.ts` instead.

## Canonical minimum sizes (enforce going forward)

| Element | Token | Actual size | Notes |
|---|---|---|---|
| Table `<th>` headers | `APP_SIZES.text.tableHeader` | `text-[12px] tracking-[0.14em]` | was 11px |
| Table `<td>` body | `APP_SIZES.text.tableBody` | `text-[15px]` | was 14px |
| Form labels | `APP_SIZES.text.label` | `text-[12px] tracking-[0.12em]` | uppercase |
| Input / select value | `APP_SIZES.text.input` | `text-[15px]` | tabular-nums |
| Helper / error text | `APP_SIZES.text.helper` | `text-[12px]` | near source of error |
| Badge / chip | `APP_SIZES.text.badge` | `text-[11px] tracking-wide` | absolute floor |
| Select item | `APP_SIZES.text.selectItem` | `text-[13px]` | |
| Pagination count | `APP_SIZES.text.paginationCount` | `text-[12px]` | |
| Empty state | `APP_SIZES.text.emptyState` | `text-[12px] uppercase tracking-[0.12em]` | |
| Sidebar nav item | `APP_SIZES.nav.item` | `text-[13px] uppercase tracking-[0.12em]` | was 12px |
| Sidebar sub-item | `APP_SIZES.nav.subItem` | `text-[12px] uppercase tracking-[0.10em]` | |
| Sidebar group label | `APP_SIZES.nav.group` | `text-[11px] uppercase tracking-[0.16em]` | was 10px |
| Sidebar section label | `APP_SIZES.nav.sectionLabel` | `text-[10px] uppercase tracking-[0.18em]` | decorative only |
| Button sm | `APP_SIZES.button.sm` | `h-8 px-3 text-[12px] gap-1.5` | |
| Button md | `APP_SIZES.button.md` | `h-9 px-4 text-[13px] gap-2` | default |
| Button lg | `APP_SIZES.button.lg` | `h-10 px-5 text-[14px] gap-2` | primary CTAs |

## Public pages — minimum floors (enforced 2026-03-21)

APP_SIZES covers shared components only. Public pages (`app/(public)/`) and app dashboard pages have their own hardcoded sizes — apply these floors directly in Tailwind classes:

| Element in public pages | Minimum |
|---|---|
| Body / descriptive text | `text-[15px]` |
| Input value text | `text-[15px]` |
| Page subtitle / subheading | `text-[14px]` |
| Form labels (uppercase) | `text-[12px]` |
| Inline error messages | `text-[13px]` |
| Button text | `text-[13px]` |
| Navigation links | `text-[13px]` |
| Status messages | `text-[14px]` |
| Section eyebrow labels (decorative) | `text-[12px]` |
| Purely decorative chrome (footer copyright, divider "o") | `text-[11px]` min |

## App dashboard pages — minimum floors

App dashboard pages (inventory/page.tsx, etc.) have their own hardcoded sizes:

| Element | Minimum |
|---|---|
| Page h1 | `text-[20px]` |
| Page subtitle | `text-[13px]` |
| KPI card labels | `text-[13px]` |
| Table headers in inline tables | `text-[12px]` |
| Status badges inline | `text-[12px]` |

## Absolute floor rules
- `text-[10px]` — only for decorative sidebar section labels (not readable body text)
- `text-[11px]` — floor for badge/chip, secondary pagination text, and purely decorative chrome (footer, dividers). NOT for functional text.
- Never use `text-[8px]` or `text-[9px]` anywhere

## Tracking adjustment rule
Larger font → reduce tracking proportionally:
- `tracking-[0.18em]` → `tracking-[0.12em]` (form labels, nav items)
- `tracking-[0.16em]` → `tracking-[0.14em]` (table headers)

**Why:** Users aged 40–60 reported illegibility with the original scale (many elements at 8–10px). The Geist Mono font at small sizes on retina displays rendered as visually smaller than expected.

**How to apply:** Edit `APP_SIZES` in `src/shared/frontend/sizes.ts` to change any global size. For page-level components not covered by the shared components, follow the minimum floors above.

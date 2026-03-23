---
name: Sidebar Patterns & Conventions
description: Established patterns for the AppSidebar component — hover states, accessibility, active state logic, dropdown behavior
type: project
---

## Sidebar is now theme-adaptive (changed 2026-03-23)

The sidebar is NO LONGER always-dark. In light mode it uses a white/surface-based palette; in dark mode it uses `#111315`. The `:root` block in `globals.css` now defines light-mode sidebar values:

| Token | Light value | Contrast |
|---|---|---|
| `--sidebar-bg` | `#FFFFFF` | surface-1 |
| `--sidebar-border` | `#D1D5E8` | border-light |
| `--sidebar-fg` | `#464D66` | 8.35:1 on white |
| `--sidebar-fg-hover` | `#111525` | full contrast |
| `--sidebar-bg-hover` | `#EEF0F7` | neutral-100 |
| `--sidebar-active-bg` | `#FFE5DB` | primary-100 warm tint |
| `--sidebar-active-fg` | `#B22C0B` | 6.05:1 on white — WCAG AA ✓ |
| `--sidebar-active-border` | `#FFC9B5` | primary-200 |

The `.dark` block retains the dark treatment (`#111315` background, rgba white text). Do not revert `:root` sidebar tokens back to dark-always values.

**Logo in sidebar:** `<LogoFull>` must use `className="text-sidebar-fg"` (not `text-foreground`) so it reads correctly against both the light-white and dark backgrounds of the sidebar.

## Sidebar CSS tokens are usable as Tailwind classes

`globals.css` maps all `--sidebar-*` vars to `--color-sidebar-*`, so they resolve as Tailwind utilities:
- `text-sidebar-fg`, `text-sidebar-fg-hover`, `text-sidebar-label`, `text-sidebar-active-fg`
- `bg-sidebar-bg`, `bg-sidebar-bg-hover`, `bg-sidebar-active-bg`
- `border-sidebar-border`, `border-sidebar-active-border`

Do NOT use `onMouseEnter`/`onMouseLeave` to toggle inline styles for these — Tailwind `hover:` variants work directly.

## Nav item class constants

Three string constants are defined at module level to keep hover/focus/active states DRY across `Link` and `button` elements:
- `NAV_ITEM_BASE` — layout/typography shared by all nav items
- `NAV_ITEM_IDLE` — default + hover + focus-visible ring
- `NAV_ITEM_ACTIVE` — active state (text, bg, border)

Compose as `[NAV_ITEM_BASE, isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE].join(" ")`.

## Module link active state rule

When a module has a sub-nav and the user is inside that module, the module-level link should NOT show as active — child items own active state. Use:
```ts
const isActive = !subnavOpen && (pathname === mod.href || pathname.startsWith(mod.href + "/"));
```

## Company dropdown — close behavior

The dropdown ref is placed on the wrapper `<div>`, not the button. Two `useEffect`s handle close:
1. `mousedown` outside the wrapper closes it
2. `Escape` key closes it
Both effects early-return when `companyOpen` is false to avoid unnecessary listeners.

## Company dropdown — ARIA

- Trigger button: `aria-expanded`, `aria-haspopup="listbox"`, descriptive `aria-label` naming the currently selected company
- Dropdown container: `<ul role="listbox">` with `aria-label`
- Each item: `<li role="option" aria-selected={isSelected}>` wrapping the button

## CompanyAvatar sub-component

Extracted from inline JSX to avoid duplication across the 3 company display branches (loading/single/multi). The avatar div has `aria-hidden="true"` since the company name text is adjacent.

## Sign-out hover: use design tokens, not hardcoded hex

Use `hover:text-red-500 hover:bg-red-500/[0.05]` and `focus-visible:ring-red-500/40`. Never hardcode `#f87171` or `rgba(239,68,68,0.06)`.

## Company dropdown — search input (added 2026-03-23)

A `companySearch` state was added to filter the company list. Key decisions:
- The `<input>` uses `bg-sidebar-bg-hover`, `font-mono`, `APP_SIZES.nav.companyName` (`text-[12px]`), and `text-sidebar-fg` — matching the sidebar palette.
- `autoFocus` is applied to the search input so the user can type immediately after opening the dropdown.
- Search state is cleared on close (outside click, Escape, and selection).
- The `<ul>` has `max-h-48 overflow-y-auto` (~192 px / ~6 items visible).
- Known accessibility debt: the search `<input>` has no `<label>` and no `aria-controls` pointing at the listbox. A `role="combobox"` + `aria-controls` + `aria-activedescendant` pattern would be ideal but is not yet implemented. `placeholder` is used as a visual label only.

## Responsive layout — auto-close drawer on xl breakpoint

`app/(app)/layout.tsx` uses a `useEffect` with `window.matchMedia("(min-width: 1280px)")` to close the drawer when the viewport enters desktop mode. Only fires on crossing the threshold upward — does not reopen when shrinking back to mobile. This is the correct behavior. The `1280px` breakpoint matches Tailwind's `xl` which is also used in the sidebar CSS (`xl:static`).

## All SVG icons get `aria-hidden="true"`

Decorative SVGs in nav items, buttons, and the logo all carry `aria-hidden="true"`. Text labels adjacent to the icons carry the accessible name. Exception: if an icon is the sole content of a button, the button itself needs `aria-label`.

**Why:** Avoids screen readers announcing cryptic SVG paths. Established during sidebar review 2026-03-21.

**How to apply:** Apply to every `<svg>` that is decorative (has visible text or label nearby). Icon-only buttons must have `aria-label` on the button element itself.

---
name: Sidebar Redesign Proposal (Module Selector + Financo Style)
description: Detailed UX review and implementation plan for the sidebar redesign — module selector, Financo-inspired visual style, collapsed rail mode
type: project
---

## Status: proposal produced 2026-03-29 — awaiting user go/no-go

## Core decisions established in the proposal

1. **Module selector state lives in `app-sidebar.tsx`** as `activeModuleId` persisted in `localStorage`. A new `ModuleSelector` sub-component handles the dropdown — same ARIA pattern as company/tenant selectors.

2. **Collapsed rail mode** is gated behind a `collapsed` boolean state persisted in `localStorage`. Width collapses to 48px (a separate `COLLAPSED_WIDTH = 48` constant). The resize handle is hidden when collapsed. A toggle button (icon-only, `aria-label="Expandir barra lateral"`) lives at the top of the bottom section.

3. **Active accent bar** replaces the current `border-sidebar-active-border` left border with a 2px absolute-positioned `div` on the left edge — using `bg-primary-500` for the bar color (not the existing `bg-sidebar-active-bg` rectangle). This is a new visual pattern and will require either a new wrapper element or adjusting `NAV_ITEM_BASE` to `relative overflow-hidden`.

4. **Sub-nav groups use section header text only (no connecting line tree)**. The connecting line structure from Financo requires a positioned `::before` pseudo or a wrapper div — the sidebar memory already records `border-l border-sidebar-border` on the subnav container. Keep the left border but shift to a `4px wide solid bar` for active items rather than a filled circle.

5. **"Employees" (parentId: "payroll") is always included in the payroll module subnav** — it is currently a separate `APP_MODULES` entry with `parentId`. In the new model it should be treated as a payroll subnav item (added to `MODULE_SUBNAV.payroll`) and removed from the module selector list.

6. **Billing and Companies modules** have no `MODULE_SUBNAV` entries. In the module selector these show as direct links (no subnav section rendered). The module selector click navigates directly to `mod.href` for these.

**Why:** The current sidebar uses all vertical space on module links, leaving insufficient room for deep sub-navigation (inventory has 17 items). The module selector reclaims that space.

**How to apply:** When building the `ModuleSelector` component, follow the exact same ARIA shape as `TenantSwitcher`: `aria-expanded`, `aria-haspopup="listbox"`, `<ul role="listbox">`, `<li role="option" aria-selected>`. The company selector pattern is the canonical reference.

## Collapsed rail state machine

- Default: expanded (persisted in `localStorage` as `"sidebar-collapsed"`)
- In collapsed mode: `width: 48px`, `xl:w-[48px]`
- All text labels hidden (`collapsed && "hidden"` or `sr-only` based on element)
- Module selector trigger shows icon only, no label
- Company selector shows avatar only, no name text
- Tenant switcher shows avatar only
- Bottom actions: icon only, no text
- Resize handle hidden when collapsed
- Logo: icon variant only, no wordmark

## Key UX risks noted

1. **Module switch = route change** — when user switches module, app navigates to that module's `href`. If they have unsaved form state (e.g. payroll calculator mid-entry), they silently lose it. Must evaluate whether any module landing pages have unsaved state that would be lost.

2. **Employees module is currently in `APP_MODULES`** as a separate entry — it must not appear in the module selector dropdown since it has no independent identity separate from payroll. The filtering logic in `app-sidebar.tsx` needs to exclude entries with `parentId`.

3. **"Facturación" and "Empresas" have no subnav** — after selecting them, the subnav section is empty. This is fine because the module selector click also navigates. But the bottom `<nav>` area would show nothing, which could feel broken. Plan: render a brief section saying "Sin subnav" or simply leave the area blank with the module label as a header — the latter is cleaner.

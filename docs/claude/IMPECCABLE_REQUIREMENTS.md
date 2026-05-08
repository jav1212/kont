# Impeccable UI Requirements

Generated from `/impeccable critique` full-app evaluation (2026-05-07).
Design Health Score: **24/40 (Acceptable)**.

---

## P0 — Blocking

### REQ-001: Error recovery / undo for destructive actions

**Problem:** Delete operations (single employee, bulk employees, products) are irreversible. No soft-delete, no undo toast, no "recently deleted" view. The inline "Confirmar/Cancelar" prompt is easy to click through during rapid Enter-to-advance editing sessions.

**Impact:** A CPA accidentally bulk-deleting filtered employees means real data loss. This is the single biggest UX risk in the application.

**Requirements:**
- [ ] Implement a 5-second undo toast after any delete operation (single or bulk)
- [ ] Delay the actual API call until the undo window expires, OR use soft-delete with a grace period
- [ ] Apply to: employees page, products page, and any other CRUD list with delete
- [ ] Toast should show: "N elemento(s) eliminado(s)" + "Deshacer" action button
- [ ] If user navigates away during the undo window, commit the delete

**Files to modify:**
- `app/(app)/payroll/employees/page.tsx` (delete handlers)
- `app/(app)/inventory/products/page.tsx` (delete handlers)
- Consider a shared `useUndoableDelete` hook in `src/shared/frontend/hooks/`

**Suggested command:** `/impeccable harden`

---

## P1 — Major

### REQ-002: Landing page redesign — visual continuity with app

**Problem:** The landing page uses a completely different design language from the app: stock Unsplash photography, gradient glows (`blur-3xl`, `blur-[120px]`), rounded-full pill CTAs with orange glow shadow, `animate-pulse` chat bubble, identical feature card grids, and marketing-speak that contradicts the app's "precise, reliable, efficient" personality.

**Impact:** Users who sign up based on the landing page experience cognitive whiplash entering the app. Damages trust and brand coherence.

**Requirements:**
- [ ] Remove all Unsplash stock photography; replace with real product screenshots or `HeroProductMock`-style UI fragments
- [ ] Remove gradient glow blobs (`bg-primary-500/15 blur-3xl`, `bg-white/10 blur-[120px]`, `bg-black/20 blur-[120px]`)
- [ ] Replace rounded-full pill CTAs with the app's `BaseButton` styling (or equivalent)
- [ ] Remove `animate-pulse` on chat bubble
- [ ] Remove `hover:-translate-y-2` lift on feature cards
- [ ] Apply the app's mono/sans typography policy to all landing page text
- [ ] Adopt the same border/surface/neutral palette from `globals.css` tokens
- [ ] Replace "social proof" section (stock portraits + "+1.200 contadores") with real data or remove
- [ ] Remove `backdrop-blur-md` glassmorphism on badges
- [ ] Fix "Cálculo Retrolactivo" → "Retroactivo" (likely typo)
- [ ] Reduce stat numbers section ("25+", "30+", "2K+") or integrate them into contextual content rather than hero-metric layout
- [ ] The `HeroProductMock` component is the gold standard — extend its approach to the entire page

**Files to modify:**
- `app/(public)/page.tsx` (59KB, primary target)
- Related public components in `app/(public)/`

**Suggested command:** `/impeccable craft landing page`

---

### REQ-003: Extract duplicated page-local components to shared

**Problem:** `StatTile` is copy-pasted between `/payroll/employees/page.tsx` and `/inventory/products/page.tsx` with slightly different APIs. `FilterChip` is also duplicated. Both pages build raw `<table>` markup instead of using `BaseTable.Render`. Custom `motion.div` modals coexist with `ResponsiveDrawer`.

**Impact:** Violates the codebase's own rule: "If a UI pattern appears in more than one place, evaluate whether it belongs in shared." Bug fixes in one location don't propagate. Visual drift will compound.

**Requirements:**
- [ ] Extract `StatTile` to `src/shared/frontend/components/stat-tile.tsx`
  - Unify API with `DashboardKpiCard` or establish clear variant contracts (compact mode vs full mode)
  - Support both `tone` (StatTile) and `color` (DashboardKpiCard) APIs during migration, then converge
- [ ] Extract `FilterChip` to `src/shared/frontend/components/filter-chip.tsx`
  - Support: label, count badge, active/inactive state, onClick handler
- [ ] Replace raw `<table>` in employees page with `BaseTable.Render` or document why it intentionally diverges
- [ ] Replace raw `<table>` in products page with `BaseTable.Render` or document why it intentionally diverges
- [ ] Replace custom `motion.div` salary history modal with `ResponsiveDrawer`
- [ ] Replace custom `motion.div` paste CSV modal with `ResponsiveDrawer`
- [ ] Audit all pages for other duplicated UI patterns

**Files to modify:**
- `app/(app)/payroll/employees/page.tsx` (StatTile ~L107-143, FilterChip, raw table, modals)
- `app/(app)/inventory/products/page.tsx` (StatTile, FilterChip, raw table)
- `src/shared/frontend/components/stat-tile.tsx` (new)
- `src/shared/frontend/components/filter-chip.tsx` (new)

**Suggested command:** `/impeccable distill`

---

## P2 — Minor

### REQ-004: Replace `window.confirm()` with design-system confirmation

**Problem:** The cedula rename flow in the employees page uses `window.confirm()` — the only native browser dialog in the entire application.

**Impact:** Cannot be styled, ignores dark mode, breaks PWA immersion. Inconsistent with the inline confirmation pattern used everywhere else.

**Requirements:**
- [ ] Replace `window.confirm()` with an inline confirmation pattern (like delete confirmation) or a `ResponsiveDrawer`
- [ ] Preserve the existing copy ("Vas a cambiar la cedula... esto también actualizará la cédula en los recibos...")
- [ ] Render in the design system with proper dark/light mode support

**Files to modify:**
- `app/(app)/payroll/employees/page.tsx` (cedula rename handler)

**Suggested command:** `/impeccable harden`

---

### REQ-005: Remove KPI card decorative glow effects

**Problem:** `DashboardKpiCard` has: `shadow-[0_0_15px_rgba(...)]` glow, `blur-3xl` bloom div (absolutely positioned blurred circle), and `whileHover={{ y: -2 }}` lift animation. Both assessments flagged these as the "hero-metric template" AI slop anti-pattern.

**Impact:** Decorative noise that adds no information. The container-query responsive sizing and semantic tokens are already strong enough without visual decoration.

**Requirements:**
- [ ] Remove `glow` shadow variant from KPI cards
- [ ] Remove the `blur-3xl` ambient bloom div (the absolutely positioned blurred circle behind each card)
- [ ] Remove `whileHover={{ y: -2 }}` hover lift animation
- [ ] Keep: semantic color mapping, container-query responsive font sizing, trend indicators, loading skeleton
- [ ] Optionally replace `motion.div` entrance animation with a simpler CSS `transition` or remove entirely (product register: "no orchestrated load sequences")

**Files to modify:**
- `src/shared/frontend/components/dashboard-kpi-card.tsx`

**Suggested command:** `/impeccable distill`

---

### REQ-006: PageHeader toolbar overflow on mobile

**Problem:** The products page has 5 action buttons (Export, Paste CSV, Import CSV, Import Excel, New) in the `PageHeader`. On 375px viewport, these wrap into 3-4 rows, pushing content far down.

**Impact:** On mobile, 200+ px of vertical space consumed before any content appears.

**Requirements:**
- [ ] Implement overflow menu (dropdown) for secondary actions on mobile viewports
- [ ] Keep only the primary CTA visible at mobile breakpoints
- [ ] Apply to all pages where PageHeader has 3+ action buttons
- [ ] Alternatively: move bulk import actions to a dedicated import view

**Files to modify:**
- `src/shared/frontend/components/page-header.tsx`
- `app/(app)/inventory/products/page.tsx`
- Any other pages with crowded PageHeader toolbars

**Suggested command:** `/impeccable adapt`

---

### REQ-007: Landing page accessibility (FAQ + error banner)

**Problem:** FAQ accordion buttons lack `aria-expanded`. The error banner "[ CERRAR ]" is raw text, not a button element.

**Impact:** Screen reader users cannot interact with or understand the FAQ section state. Error banner close action is not keyboard-accessible.

**Requirements:**
- [ ] Add `aria-expanded={boolean}` to FAQ toggle buttons
- [ ] Add `aria-label` to FAQ toggle buttons (e.g., "Expandir pregunta: ...")
- [ ] Replace "[ CERRAR ]" raw text with a `<button>` element with proper `onClick` and `aria-label`
- [ ] Ensure all interactive elements in the landing page are keyboard-navigable

**Files to modify:**
- `app/(public)/page.tsx` (FAQ section ~L616+, error banner ~L139)

**Suggested command:** `/impeccable harden`

---

## P3 — Polish

### REQ-008: Add column sorting to employees and products tables

**Problem:** `BaseTable` supports sort descriptors, but the hand-built tables in employees and products pages have no sorting capability.

**Impact:** CPAs with 50+ employees expect to sort by name, salary, hire date, or status. Lack of sorting forces manual scanning.

**Requirements:**
- [ ] Add sortable column headers to employees table (at minimum: name, salary, hire date, status)
- [ ] Add sortable column headers to products table (at minimum: name, stock, department, status)
- [ ] Use `BaseTable` sort infrastructure if migrating to it, or implement consistent sort UX on raw tables

**Files to modify:**
- `app/(app)/payroll/employees/page.tsx`
- `app/(app)/inventory/products/page.tsx`

---

### REQ-009: Add pagination to large lists

**Problem:** Both employees and products pages render all filtered results in a single scroll. `BaseTable` supports pagination but these pages don't use it.

**Impact:** At 200+ employees or 500+ products: slow rendering, scroll fatigue, and disorientation when using inline editing (save-and-advance scrolls away from context).

**Requirements:**
- [ ] Add pagination (25-50 items per page) to employees list
- [ ] Add pagination (25-50 items per page) to products list
- [ ] Preserve current filter/search state across page changes
- [ ] Consider virtual scrolling as an alternative if inline editing makes pagination awkward

**Files to modify:**
- `app/(app)/payroll/employees/page.tsx`
- `app/(app)/inventory/products/page.tsx`

---

### REQ-010: Remove side-stripe border on error list

**Problem:** Paste CSV error list uses `border-l-2 border-error/30` — a side-stripe accent banned by impeccable design laws.

**Impact:** Low severity. Single instance.

**Requirements:**
- [ ] Replace `border-l-2 border-error/30` with full border, background tint (`bg-error/5 border border-error/20`), or leading icon/number

**Files to modify:**
- `app/(app)/payroll/employees/page.tsx` (~L1676)

---

### REQ-011: Remove custom global scrollbar styling

**Problem:** `globals.css` defines custom `::-webkit-scrollbar` styles. Non-standard and listed as a product register ban ("reinventing standard affordances for flavor").

**Impact:** Low severity. The scrollbar uses design tokens and `scrollbar-width: thin`, which is a reasonable choice, but the webkit customization is unnecessary.

**Requirements:**
- [ ] Evaluate whether to keep `scrollbar-width: thin` (acceptable) and remove the webkit-specific styling, or keep both
- [ ] If keeping: document the decision

**Files to modify:**
- `app/globals.css` (~L390-411)

---

### REQ-012: Improve keyboard shortcut discoverability

**Problem:** Enter-to-advance and Esc-to-cancel keyboard shortcuts are only visible in a small hint during edit mode. Not discoverable organically.

**Impact:** Power-user efficiency feature may go unused if CPAs default to mouse clicking.

**Requirements:**
- [ ] Add a first-time tooltip or coach mark when a user enters edit mode for the first time
- [ ] Consider a keyboard shortcut overlay (Cmd+/ or ?) listing all available shortcuts
- [ ] Persist "has seen shortcut hint" to avoid repetition

---

### REQ-013: Sidebar sub-navigation tree connector review

**Problem:** The `SidebarSubnav` uses vertical/horizontal line connectors creating a file-tree visual metaphor. Unusual for a SaaS sidebar.

**Impact:** Adds visual complexity without clear UX benefit. Most users don't associate navigation with file trees.

**Requirements:**
- [ ] Evaluate whether tree connectors add value or just noise
- [ ] Consider replacing with indentation + active-state highlighting (standard SaaS pattern)
- [ ] If keeping: document the design rationale

**Files to modify:**
- `src/shared/frontend/components/sidebar-subnav.tsx`

---

### REQ-014: Mobile card / desktop table rendering deduplication

**Problem:** Employee cards and table rows are separate components with duplicated rendering logic. Changes to field display must be manually synchronized between mobile and desktop views.

**Impact:** Maintenance burden. Risk of mobile/desktop showing different data or formatting.

**Requirements:**
- [ ] Extract shared field renderers (salary display, status badge, date formatter, seniority calculator)
- [ ] Use these renderers in both card and table views
- [ ] Consider a responsive table/card component that handles the breakpoint switch internally

---

## Persona-Specific Notes

### Alex (Power User / CPA)
- REQ-008 (sorting) and REQ-009 (pagination) are critical for Alex's workflow
- REQ-012 (shortcut discoverability) determines whether Enter-to-advance gets adopted
- No saved filters/views for recurring workflows (future consideration)

### Sam (Accessibility)
- REQ-007 (landing page a11y) is the primary gap
- App UI is generally strong: global focus ring, semantic tokens, aria-labels on status dots
- REQ-010 (side-stripe) is a minor a11y concern (color-only accent on errors)

### Casey (Mobile User)
- REQ-006 (PageHeader overflow) is critical for mobile
- KPI cards take prime viewport space before actionable content on mobile
- Mobile editing experience needs separate evaluation

---

## Recommended Execution Order

| Order | Req | Command | Effort |
|-------|-----|---------|--------|
| 1 | REQ-005 | `/impeccable distill` | Small (1 file) |
| 2 | REQ-010 | Manual fix | Tiny (1 line) |
| 3 | REQ-004 | `/impeccable harden` | Small (1 file) |
| 4 | REQ-007 | `/impeccable harden` | Small (1 file) |
| 5 | REQ-003 | `/impeccable distill` | Medium (extract + refactor) |
| 6 | REQ-006 | `/impeccable adapt` | Medium (shared component) |
| 7 | REQ-001 | `/impeccable harden` | Medium (new hook + integration) |
| 8 | REQ-008 | Manual impl | Medium |
| 9 | REQ-009 | Manual impl | Medium |
| 10 | REQ-002 | `/impeccable craft` | Large (full page redesign) |
| 11 | REQ-012 | `/impeccable onboard` | Small |
| 12 | REQ-013 | `/impeccable distill` | Small |
| 13 | REQ-014 | Refactor | Medium |
| 14 | REQ-011 | Manual decision | Tiny |

Quick wins first (REQ-005, 010, 004, 007), then structural improvements (REQ-003, 006, 001), then larger efforts (REQ-008, 009, 002).

Re-run `/impeccable critique` after completing REQ-001 through REQ-007 to measure score improvement.

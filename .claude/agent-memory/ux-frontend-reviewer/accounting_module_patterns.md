---
name: Accounting Module UX Patterns
description: Homologation completed 2026-03-29. Canonical patterns used in the accounting module after remediation. Reference for future accounting page reviews.
type: project
---

## Status: HOMOLOGATED (2026-03-29)

All issues found in the initial review have been corrected. The module now uses the same patterns as payroll and inventory.

## Canonical patterns now in use

### Buttons
All buttons use `BaseButton.Root` / `BaseButton.Icon` from `src/shared/frontend/components/base-button.tsx`.
- Primary CTA: `variant="primary" size="sm"`
- Cancel / secondary: `variant="ghost" size="sm"`
- Destructive: `variant="danger" size="sm"` (inside modals only)
- Never use: `btn-primary`, `btn-ghost` — these classes do not exist in globals.css

### Inputs and selects
Native `<input>` and `<select>` elements with the shared `fieldCls` pattern (defined locally in each page):
```
w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none
font-mono text-[13px] text-foreground tabular-nums
focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150
placeholder:text-neutral-400
```
Labels: `font-mono text-[12px] tracking-[0.12em] uppercase text-neutral-500 block mb-1.5`
Every input/select has a `<label>` with `htmlFor` linked via `useId()`.

### Tables
All tables use `BaseTable.Render` from `src/shared/frontend/components/base-table.tsx`.
Empty states include both a heading and an explanatory sentence with CTA.

### Destructive / irreversible actions
Use HeroUI `<Modal>` with explicit confirmation. Never `window.confirm()`.
Modals have: loading state, error message slot, cancel + confirm buttons.
Actions affected: delete account, close period, post journal entry, delete integration rule.

### Status badges
Use inline `style={{ background: 'var(--badge-success-bg)', ... }}` with semantic CSS variables.
Available vars: `--badge-success-bg/border`, `--badge-warning-bg/border`, `--badge-error-bg/border`.
Text color vars: `--text-success`, `--text-warning`, `--text-error`.
Never use raw Tailwind colors for status badges (e.g. `bg-green-100 text-green-700`).

### Token usage
Canonical tokens: `border-border-light`, `bg-surface-1`, `bg-surface-2`, `text-foreground`, `text-neutral-400/500/600`.
Non-canonical (must not use): `var(--border)`, `var(--surface)`, `var(--surface-hover)`, `var(--accent)`, `var(--surface-secondary)`.

### Page layout structure
```tsx
<AccountingAccessGuard>
  <div className="flex flex-col min-h-full">
    <PageHeader title="...">  {/* optional action buttons as children */}
    </PageHeader>
    <div className="flex flex-col gap-6 p-8 max-w-Nxl">
      {/* content */}
    </div>
  </div>
</AccountingAccessGuard>
```
No extra `p-6` wrapper around PageHeader — PageHeader has its own `px-8 py-6` padding.

### AccountingAccessGuard paywall CTA
The guard now renders a `<Link href="/billing">` button when access is denied. Previously it was dead text.

### hook usage
`trial-balance/page.tsx` now uses `useTrialBalance(companyId, periodId)` instead of raw `fetch()` in a `useCallback`/`useEffect`.

### module layout
`app/(app)/accounting/layout.tsx` wraps in `DesktopOnlyGuard`, matching payroll and inventory.

### Financial number formatting
Always `n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` with `tabular-nums` class on the wrapping span.

### aria-live for balance feedback
The "Cuadrado / No cuadra" indicator in new entry form uses `aria-live="polite"` for screen reader feedback.

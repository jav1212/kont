---
name: Status Badge Patterns
description: How status/state badges are implemented in KONT and the correct utility classes to use
type: reference
---

## Correct pattern (post-March 2026 refactor)

Use the `.badge-*` utility classes defined in `app/globals.css`.
These handle background, border, and text color in a single class, with proper dark mode support.

```tsx
// Status badge — single record
<span className="inline-flex px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-[0.12em] font-medium badge-success">
    Activo
</span>

// Status badge mapping
const STATUS_CLS = {
    activo:   "border badge-success",
    inactivo: "border badge-error",
    vacacion: "border badge-warning",
};
```

Available classes:
- `.badge-success` — green tint, accessible green text (emerald-700 in light, emerald-400 in dark)
- `.badge-warning` — amber tint, accessible amber text (amber-800 in light, amber-300 in dark)
- `.badge-error` — red tint, accessible red text (red-700 in light, red-400 in dark)
- `.badge-info` — cyan tint, accessible cyan text (primary-500 in light, primary-500 dark in dark)

All combinations verified to pass WCAG AA (≥4.5:1) on both light and dark surfaces.

## Wrong pattern (pre-refactor, do NOT use)

```tsx
// WRONG — green-500 text on white is 2.28:1 (fails WCAG AA)
"border-green-500/20 bg-green-500/[0.08] text-green-600 dark:text-green-400"

// WRONG — amber-600 on white is 3.19:1 (fails WCAG AA)
"border-amber-500/20 bg-amber-500/[0.08] text-amber-600 dark:text-amber-400"
```

## Active/Inactive inline text

For non-badged status text inside table cells:

```tsx
// Correct
<span className="text-text-success text-[9px] uppercase tracking-[0.14em]">Activo</span>
<span className="text-text-tertiary text-[9px] uppercase tracking-[0.14em]">Inactivo</span>

// Wrong
<span className="text-green-500 ...">Activo</span>      // 2.28:1 fails
<span className="text-foreground/40 ...">Inactivo</span> // 2.57:1 fails
```

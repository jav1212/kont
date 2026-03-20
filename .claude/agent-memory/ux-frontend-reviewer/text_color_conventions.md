---
name: Text Color Conventions
description: Which CSS tokens to use for which types of text in KONT, replacing the broken opacity-based approach
type: reference
---

## Semantic text token reference

All tokens defined in `app/globals.css` under `:root` (light) and `.dark`.

| Use case | Token | Light value | Dark value | Contrast (white/dark-s1) |
|---|---|---|---|---|
| Primary content, headings | `text-text-primary` / `text-foreground` | #111525 | #E8ECF8 | 16.5:1 / 14.8:1 |
| Secondary body text | `text-text-secondary` | #464D66 | #A8AEBF | 8.35:1 / 6.5:1 |
| Labels, captions, helper text | `text-text-tertiary` | #5F6780 | #7E8494 | 5.62:1 / 4.6:1 |
| Decorative, dividers, footers | `text-text-disabled` | #858EAA | #4E5372 | 3.0:1 (decorative) |
| Links, interactive text | `text-text-link` | #0E7490 | #22D3EE | 5.36:1 / 10.49:1 |
| Link hover state | `text-text-link-hover` | #155E75 | #67E8F9 | 7.27:1 |
| Success text | `text-text-success` | #047857 | #34D399 | 5.59:1 / 6.6:1 |
| Warning text | `text-text-warning` | #92400E | #FCD34D | 7.48:1 / 8.1:1 |
| Error text | `text-text-error` | #B91C1C | #F87171 | 5.93:1 / 5.2:1 |

## Rules

1. **Never use `text-foreground/XX` for readable text** — /50 and below fail in light mode.
2. **Never use raw semantic colors** (`text-green-500`, `text-red-400`, `text-amber-500`) for standalone text — these are decorative, not text colors. They are overridden globally in globals.css but the intent matters.
3. **Form labels** → `text-text-tertiary` (was `text-foreground/40`)
4. **Helper/hint text** → `text-text-tertiary` (was `text-foreground/30`)
5. **Page subtitles / breadcrumbs** → `text-text-secondary` (was `text-foreground/60`)
6. **Footer / copyright / decorative** → `text-text-disabled` is acceptable (3:1 — large text exception applies)

## Global CSS override safety net

`app/globals.css` contains `!important` overrides that correct the failing utilities:
- `.text-foreground/50` → `--text-tertiary`
- `.text-foreground/40` → `--text-tertiary`
- `.text-foreground/35` → `--text-tertiary`
- `.text-foreground/30` → `--text-tertiary`
- `.text-foreground/25` → `--text-tertiary`
- `.text-foreground/20` → `--text-disabled`
- `.text-green-500/400/emerald-500/400` → `--text-success`
- `.text-amber-500/yellow-500` → `--text-warning`
- `.text-red-500/red-400` → `--text-error`
- `.text-primary-400` → `--text-link`

These overrides catch legacy code. New code should use the semantic tokens directly.

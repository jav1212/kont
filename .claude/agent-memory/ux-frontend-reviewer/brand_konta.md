---
name: Konta Brand System
description: Complete brand spec after rebrand from Kont to Konta — logo treatment, color tokens, do/don't for new files
type: project
---

## Brand identity

Product renamed from **Kont** to **Konta.** (with trailing orange dot as part of wordmark).

### Logo treatment — always use this pattern

```tsx
<div className="flex items-end leading-none gap-0" aria-label="Konta">
  <span className="font-sans font-black text-[20px] leading-none tracking-[-0.03em] text-foreground">Konta</span>
  <span className="font-black text-[20px] leading-none" style={{ color: '#FF4A18' }}>.</span>
</div>
```

- Font: `font-sans` (Darker Grotesque) — NOT `font-mono`
- Weight: `font-black` (900)
- Letter spacing: `tracking-[-0.03em]`
- The dot is an inline `style={{ color: '#FF4A18' }}` — acceptable because there is no direct Tailwind class for this exact raw hex (the Tailwind token `bg-primary-500` maps to `#D93A10` in light mode for WCAG compliance, not `#FF4A18`)
- In the sidebar the "K." monogram uses the same pattern but for the "K" only

### Reusable logo components (canonical — use these)

`src/shared/frontend/components/logo.tsx` exports two components — **HTML+Tailwind only, no SVG**:

- `<LogoFull size={n} className="text-foreground" />` — full "konta." wordmark as a `<span>`. `size` sets font-size in px (default 20). `className` controls text color (forwarded to outer wrapper). Props extend `HTMLAttributes<HTMLSpanElement>`.
- `<LogoMark size={n} className="text-foreground" />` — "k." monogram, same API.

The orange dot is always `style={{ color: "#FF4A18" }}` on an inner `<span>` — intentional, no Tailwind token maps to this exact brand hex. `role="img"` and `aria-label="Konta"` are on the outer `<span>` wrapper.

Use these components everywhere instead of repeating the raw text+span pattern. The sidebar uses `<LogoFull size={20} className="text-foreground" />`.

### SVG assets (static files)

- `public/logo-full.svg` — DELETED 2026-03-23 (was unused, no references in codebase)
- `public/logo-mark.svg` — DELETED 2026-03-23 (was unused, no references in codebase)
- `app/icon.svg` — DELETED 2026-03-23 (redundant; `app/icon.tsx` takes precedence for the dynamic favicon)
- `public/icons/icon.svg` — KEEP — referenced by `app/layout.tsx` icons metadata and `public/manifest.json`
- `app/apple-icon.tsx` and `app/icon.tsx` — use `ImageResponse` (server PNG generation), CANNOT import React components; raw JSX with inline styles is correct here

### Color tokens

| Intent | Token class | Light value | Dark value |
|---|---|---|---|
| Primary button | `bg-primary-500` | `#D93A10` (4.58:1) | `#FF4A18` (5.89:1) |
| Primary button hover | `bg-primary-600` | `#B22C0B` (6.05:1) | `#D93A10` |
| Accent text | `text-primary-500` | `#D93A10` | `#FF4A18` |
| Accent lighter | `text-primary-400` | `→ var(--text-link)` | `#FF4A18` |
| Logo dot inline | `style={{ color: '#FF4A18' }}` | always raw hex | same |
| Brand glow (decorative) | inline `rgba(255,74,24,...)` | acceptable | same |

### Do NOT use

- `bg-[#D93A10]`, `bg-[#B22C0B]`, `bg-[#FF4A18]` in UI components — use `bg-primary-500`, `bg-primary-600`
- The old 2×2 grid SVG icon as a logo mark — was used in `app/admin` before rebrand, now replaced
- The name "Kont" anywhere — always "Konta" (with capital K, no period unless it's the dot treatment)

### Admin area note

The admin area uses `red-600` / `red-500` intentionally for its submit buttons and focus styles — this is a deliberate visual differentiation from the main app. Do not replace these with `primary-500`.

### Document/print shells

All payroll document pages (`vacaciones`, `liquidaciones`, `prestaciones`, `utilidades`) contain a print-fidelity document preview with hardcoded hex colors (`#12121a`, `#f6f6fa`, `#dadae2`, `#787884`, etc.). These are INTENTIONAL — do not replace with design tokens.

**Why:** **How to apply:** When auditing for hardcoded colors, skip anything inside the document shell containers (`bg-[#12121a]`, `bg-[#f6f6fa]`). Only replace colors that belong to actual UI controls (buttons, inputs, status chips) outside those containers.

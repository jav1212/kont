---
name: Inline Table Edit Patterns
description: Established patterns for inline row editing in KONT tables, including logo upload, mobile fallback fields, icon-only button aria-labels, and upload state management
type: reference
---

## Inline edit row — established pattern

Inline editing inside a table row is the right pattern for this data density (2–4 short fields). A slide-out panel adds unnecessary friction when all editable content fits within the row.

## Logo/avatar upload button — design decisions

- Size: `w-7 h-7` both in edit mode AND display mode (normalized — a `w-6 h-6` display / `w-7 h-7` edit pairing causes a layout shift)
- Edit mode trigger: a `<button>` wrapping the avatar, with a persistent **camera overlay icon** (`absolute bottom-0 right-0 w-3.5 h-3.5`) to signal interactivity
- During upload: existing image/initial stays visible at `opacity-40`; a spinner overlay sits on top at `bg-surface-1/60` — the user never sees a blank avatar
- Success feedback: `ring-2 ring-green-500/20` + `border-green-500/60` on the button for 1800ms via `setTimeout`
- `aria-label` on the button: `"Cambiar logo de la empresa"` (not just `title` — title doesn't fire on touch)
- `onError` on `<img>`: hide broken images silently (`style.display = "none"`)
- `alt` on display mode: `Logo de ${company.name}` (not empty — screen readers need company identity)
- `alt` on edit mode: `Logo de ${editName || "la empresa"}`

## Upload error handling rules

- File size guard: 2 MB limit. Reject before upload with `"El logo debe ser menor a 2 MB."` — no Supabase call
- **Do NOT clear `editError` at the START of the upload** — only clear it on confirmed success. Premature clearing gives a false "no error" period on retry
- On Supabase error: `console.error("[logo-upload]", uploadErr)` + user-facing: `"No se pudo subir el logo. Verifica el archivo e intenta de nuevo."` (never expose raw Supabase error messages to the user)
- On success: `setEditError(null)` then `setLogoUploadSuccess(true)` then `setTimeout(() => setLogoUploadSuccess(false), 1800)`

## Mobile edit completeness

Phone and Address columns are hidden (`hidden sm:table-cell`) on mobile — they have no edit path on small screens unless explicitly handled. Fix: render those fields inside the Name cell using `<div className="sm:hidden space-y-1.5">` when `isEditing`. This makes the full edit form available on mobile without adding a new column.

## Icon-only buttons — aria-label convention

All icon-only action buttons (edit, trash, save, cancel, logo) must have both `title` (tooltip) AND `aria-label`. The `aria-label` should include the entity name where relevant:
- Edit: `aria-label={\`Editar ${company.name}\`}`
- Delete: `aria-label={\`Eliminar ${company.name}\`}`
- Save: `aria-label="Guardar cambios"`
- Cancel: `aria-label="Cancelar edición"`

## SVG icons — aria-hidden

All decorative SVG icon components (`IconSave`, `IconCancel`, `IconEdit`, `IconTrash`, `IconPlus`, `IconCamera`) have `aria-hidden="true"` baked into the SVG element. They are always paired with a button that has `aria-label`.

## focus-visible convention for action buttons

Icon-only action buttons use:
- Save: `focus-visible:ring-2 focus-visible:ring-green-500/40`
- Cancel/Edit: `focus-visible:ring-2 focus-visible:ring-border-medium`
- Delete: `focus-visible:ring-2 focus-visible:ring-red-500/30`
- Logo upload button: `focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1`

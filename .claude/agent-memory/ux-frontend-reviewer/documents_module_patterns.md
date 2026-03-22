---
name: Documents Module UX Patterns
description: Established patterns, anti-patterns, and decisions from the Documents module review (Phase 2 + Replicar plantilla feature)
type: project
---

## Replicar plantilla button placement

The "Replicar plantilla" button lives at the bottom of `FoldersPanel` (the JSX constant rendered in both the desktop sidebar and the mobile drawer). This is intentional — it must appear in both contexts.

**Critical bug found 2026-03-22:** The mobile drawer renders a *different* JSX tree than the desktop sidebar — it manually renders `FolderTree` inside a `<div className="px-4 pb-4">` and does NOT include the replication button. The `FoldersPanel` constant is only used by the desktop `<aside>`. Mobile users have no access to "Replicar plantilla".

**Fix pattern:** The `FoldersPanel` JSX constant should be used inside the mobile drawer as well, or the replication button should be extracted into a shared sub-component rendered in both contexts.

## Confirmation modal — no keyboard trap

The custom modal divs at the bottom of `page.tsx` (both replicConfirm and replicResult) have no focus trap. Tab focus escapes to the page behind the overlay. No `Escape` key handler to close.

**Fix pattern:** Either use HeroUI `<Modal>` (preferred — it handles focus trap, Escape, and aria-modal automatically), or add `useFocusTrap` + `onKeyDown` to the overlay div.

## Result modal — tenantId as display label

The result modal shows `r.tenantId.slice(0, 8)…` as the company identifier. This is meaningless to an accountant. Should show company name instead. Requires the API to return a `companyName` field in each result item.

## Result modal — color-only status signal

Success/error rows use only ✓/✕ characters with color (`text-primary-500` / `text-red-500`). Color alone is insufficient per WCAG 1.4.1. The check/cross glyphs partially remediate this, but the copy is missing: there is no text label like "OK" or "Error" — the error message `r.error` fills that gap only when there is an error. Acceptable but borderline.

## Dashed border button style (established pattern)

Both "Nueva carpeta" (in `FolderTree`) and "Replicar plantilla" use the same dashed border style:
`border border-dashed border-border-medium text-foreground/40 hover:text-primary-500 hover:border-primary-500/40 hover:bg-primary-500/[0.04] font-mono text-[11px] transition-colors`

This is now an established pattern for "action that creates or initializes something" in the sidebar. Keep consistent.

## replicateFolders error is swallowed at call site

In `handleReplicate()`, the `try/finally` has no `catch`. If `replicateFolders()` throws (e.g. network error), the error is silently swallowed — `replicResult` stays `null`, the modal closes, and the user sees nothing. The `error` state from the hook is also not used here. Must add error handling.

**Why:** The hook's `error` state is only set inside `loadFolders` / `loadDocuments`. `replicateFolders` throws directly. The page never catches it.

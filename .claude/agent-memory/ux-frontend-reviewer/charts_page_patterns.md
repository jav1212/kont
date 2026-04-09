---
name: Charts Page UX Patterns
description: Accounting charts page (Plan de Cuentas) review 2026-04-08. Confirmed good patterns and issues found vs. accounts/page.tsx.
type: project
---

## Confirmed Good Patterns (charts/page.tsx)
- `useCharts(companyId)` feature hook — no raw fetch in component
- HeroUI Modal for both import and delete confirmation
- `BaseButton.Root` with `variant="danger"` for destructive confirm, `variant="ghost"` for cancel
- `role="alert"` on every error paragraph
- Import button disabled until file parsed and preview shown (`!importFile || !importPreview`)
- `loading` prop on confirm buttons during async ops
- Empty state: dashed border box with heading + explanatory sentence — matches canonical pattern
- `es-VE` locale on `accountCount.toLocaleString`
- `latin1` encoding for Venezuelan TXT files — correct domain knowledge
- File read happens client-side before submit — immediate parse feedback on file select

## Issues Found (must fix)

### 1. labelCls uses hardcoded text-[11px] instead of APP_SIZES
charts/page.tsx defines `labelCls` with `text-[11px]` and manual `tracking-[0.12em]`.
accounts/page.tsx uses `APP_SIZES.text.label` which resolves to `text-[12px] tracking-[0.12em]`.
This causes a 1px font-size regression on labels inside the import modal.
Fix: import `APP_SIZES` and set `labelCls = \`font-mono ${APP_SIZES.text.label} uppercase ...\``

### 2. fieldCls missing `tabular-nums`
charts/page.tsx fieldCls lacks `tabular-nums`. accounts/page.tsx includes it.
Minor but breaks consistency for numeric account name inputs.

### 3. File input has no `<label>` with htmlFor
The file input (`ref={fileInputRef}`) has no `id` prop and its adjacent `<label className={labelCls}>Archivo TXT</label>` is not associated via htmlFor/id. Screen readers cannot navigate to the file input from its label.

### 4. Import modal: re-reads file on confirm (double parse)
handleFileChange reads and parses the file with FileReader+latin1.
handleImport calls importFile.text() — which uses UTF-8 by default and bypasses the latin1 encoding used in preview. If the file has accented characters, the imported data may differ from the preview. Should store the decoded text from the FileReader result in state and reuse it on confirm.

### 5. handleImport: importFile.text() ignores latin1 encoding
`importFile.text()` is File.prototype.text() which always decodes as UTF-8. The preview correctly uses `reader.readAsText(file, 'latin1')`. The confirm step must reuse the already-decoded string — currently it silently re-parses with the wrong encoding.

### 6. Delete modal body missing irreversibility warning
accounts/page.tsx delete modal says "Esta acción no se puede deshacer."
charts/page.tsx delete modal omits this phrase. The consequence text ("quedarán sin plan asignado") is informational but does not convey permanence. Add the irreversibility warning for consistency and error prevention.

### 7. Page content gap uses gap-4 instead of canonical gap-6
accounts/page.tsx uses `gap-6` in its content wrapper. charts/page.tsx uses `gap-4`. Minor visual inconsistency.

### 8. Loading state: plain text "Cargando..." instead of skeleton
All other accounting pages use BaseTable.Render isLoading which shows a skeleton. The charts list shows a plain `<p>Cargando...</p>`. No skeleton, no layout placeholder — causes CLS when data loads.

### 9. Success state: no toast/confirmation after import
After successful import, the modal closes silently. No success message is shown. Users cannot tell if the import ran. Recommend a brief `addToast` (HeroUI) or an inline success banner on the page.

"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { parseCompositeProductsCsv, type CompositeImportResult } from "../utils/composite-import";
import { useExcelImport } from "../hooks/use-excel-import";

/**
 * Previews a companion composite report and imports it into the selected company.
 * @returns File selection, validation results and an explicit import action.
 * @throws No expected errors; file/network failures are displayed in the form.
 */
export function CompositeReportImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [errors, setErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [preview, setPreview] = useState<CompositeImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const { previewCompositeImport, executeCompositeImport } = useExcelImport();

  const selectFile = async (file: File) => {
    setBusy(true); setErrors([]); setSummary(null); setFileName(file.name); setPreview(null);
    try {
      const parsed = parseCompositeProductsCsv(await file.text());
      const validated = parsed.errors.length ? parsed : await previewCompositeImport(parsed);
      setPreview(validated); setErrors(validated.errors);
    } catch (error) { setErrors([{ row: 0, message: error instanceof Error ? error.message : "No se pudo leer el reporte." }]); }
    finally { setBusy(false); }
  };

  const importPreview = async () => {
    if (!preview || preview.errors.length) return;
    setBusy(true); setErrors([]); setSummary(null);
    try {
      const outcome = await executeCompositeImport(preview);
      setErrors(outcome.errors);
      setSummary(`Se actualizaron ${outcome.saved} de ${preview.recipes.length} productos compuestos.${outcome.errors.length ? " Revisa los errores para los restantes." : ""}`);
    } catch (error) { setErrors([{ row: 0, message: error instanceof Error ? error.message : "No se pudo importar el reporte." }]); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-xl border border-border-light bg-surface-1 p-6 space-y-3">
      <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">Importar productos compuestos</h2>
      <p className="text-[12px] text-[var(--text-tertiary)]">Carga el reporte “Listado de Productos Compuestos” después de importar el catálogo. Cada combo reemplaza únicamente su propia composición.</p>
      <BaseButton.Root variant="secondary" size="sm" isDisabled={busy} onClick={() => fileRef.current?.click()} leftIcon={busy ? undefined : <Upload size={14} />}>
        {busy ? "Importando…" : fileName ? `Cambiar ${fileName}` : "Seleccionar reporte CSV"}
      </BaseButton.Root>
      <input ref={fileRef} className="hidden" type="file" accept=".csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void selectFile(file); event.currentTarget.value = ""; }} />
      {preview && <div className="rounded-lg border border-border-light p-3 text-[12px] text-[var(--text-secondary)]">Vista previa: {preview.recipes.length} compuestos y {preview.totalLines} componentes. {preview.errors.length === 0 ? "Todos los componentes están disponibles y activos." : `${preview.errors.length} conflictos requieren corrección.`}</div>}
      {!!preview?.pendingProducts?.length && <div className="rounded-lg border border-amber-500/30 p-3 text-[12px] text-amber-700">
        <p>Quedarán pendientes y no podrán venderse hasta completar su composición:</p>
        <ul className="mt-2 list-disc pl-4">{preview.pendingProducts.map((product) => <li key={product.code}>{product.code} · {product.name}</li>)}</ul>
      </div>}
      {preview && preview.errors.length === 0 && <BaseButton.Root variant="primary" size="sm" isDisabled={busy} onClick={() => void importPreview()}>Confirmar importación</BaseButton.Root>}
      {summary && <p className="flex gap-2 text-[12px] text-green-600"><CheckCircle2 size={14} />{summary}</p>}
      {errors.length > 0 && <div className="space-y-1 text-[12px] text-red-500"><p className="flex gap-2"><AlertTriangle size={14} />Revisa los conflictos antes de continuar.</p>{errors.slice(0, 20).map((error, index) => <p key={`${error.row}-${index}`}>Fila {error.row}: {error.message}</p>)}</div>}
      {!fileName && <p className="flex gap-2 text-[11px] text-[var(--text-disabled)]"><FileSpreadsheet size={13} />Se conservan ceros iniciales y cantidades con coma decimal.</p>}
    </section>
  );
}

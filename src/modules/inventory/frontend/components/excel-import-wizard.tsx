// excel-import-wizard.tsx — 4-step wizard for importing inventory from Excel files.
// Step 1: Upload file + select sheet
// Step 2: Review/adjust column mappings
// Step 3: Import configuration (period, date, reference)
// Step 4: Execution with progress
"use client";

import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import {
  parseExcelSheet,
  parseExcelFileWithProfiles,
  applyMappings,
  SYSTEM_FIELD_OPTIONS,
  type ColumnMapping,
  type ExcelParseResult,
  type ExcelImportResult,
  type SystemFieldTarget,
  type ParseSheetOptions,
} from "../utils/inventory-excel";
import { applyProfileMappings, type ImportFormatProfile } from "../utils/import-format-profiles";
import { useExcelImport, type ImportConfig } from "../hooks/use-excel-import";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, X, Loader2, Sparkles } from "lucide-react";

// ── Shared styles ───────────────────────────────────────────────────────────

const fieldCls = [
  "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
  "font-mono text-[13px] text-foreground",
  "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1 block";

const STEP_LABELS = ["Archivo", "Columnas", "Configurar", "Importar"];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ExcelImportWizard() {
  // Wizard step state
  const [step, setStep] = useState(0);

  // Step 1 state
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ExcelParseResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const workbookRef = useRef<XLSX.WorkBook | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // Stores detected profile info and its parsing options for sheet-change re-parsing
  const detectedProfileRef = useRef<{
    info: NonNullable<ExcelParseResult["detectedProfile"]>;
    headerRowIndex: number | undefined;
    profile: ImportFormatProfile;
  } | null>(null);

  // Step 2 state
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);

  // Step 3 state
  const [importConfig, setImportConfig] = useState<ImportConfig>({
    period: getCurrentPeriod(),
    date: getTodayDate(),
    reference: "",
  });

  // Step 4 state
  const [importData, setImportData] = useState<ExcelImportResult | null>(null);
  const { progress, executeImport, reset, cancel } = useExcelImport();

  // ── Step 1 handlers ─────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
      workbookRef.current = wb;
      setFileName(file.name);

      if (wb.SheetNames.length === 0) {
        setFileError("El archivo no contiene hojas de cálculo.");
        return;
      }

      // Use profile-aware parsing: auto-detects format, picks the right sheet,
      // and applies profile-specific column mappings when a match is found.
      const result = parseExcelFileWithProfiles(wb, file.name);
      if (result.detectedProfile && result.detectedProfileFull) {
        detectedProfileRef.current = {
          info: result.detectedProfile,
          headerRowIndex: result.detectedProfileFull.headerRowIndex ?? undefined,
          profile: result.detectedProfileFull,
        };
      } else {
        detectedProfileRef.current = null;
      }
      const sheetToUse = result.selectedSheet ?? wb.SheetNames[0];
      setParseResult(result);
      setSelectedSheet(sheetToUse);
      setMappings(result.suggestedMappings);
      setImportConfig(prev => ({ ...prev, reference: `Importación Excel - ${file.name}` }));
    } catch {
      setFileError("No se pudo leer el archivo. Verifica que sea un archivo Excel válido (.xls o .xlsx).");
    }

    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleSheetChange = useCallback((sheetName: string) => {
    if (!workbookRef.current) return;
    setSelectedSheet(sheetName);
    // If a profile was detected, preserve its headerRowIndex and mapping strategy
    const dp = detectedProfileRef.current;
    const options: ParseSheetOptions | undefined = dp
      ? {
          headerRowIndex: dp.headerRowIndex,
          mapHeaders: (headers) => applyProfileMappings(headers, dp.profile),
        }
      : undefined;
    const result = parseExcelSheet(workbookRef.current, sheetName, options);
    setParseResult(result);
    setMappings(result.suggestedMappings);
  }, []);

  // ── Step 2 handlers ─────────────────────────────────────────────────────

  const handleMappingChange = useCallback((sourceIndex: number, newValue: string) => {
    setMappings(prev => prev.map(m => {
      if (m.sourceIndex !== sourceIndex) return m;
      if (newValue === "__skip__") {
        return { ...m, target: null, confidence: "manual" as const };
      }
      if (newValue.startsWith("custom:")) {
        const key = newValue.slice(7);
        return { ...m, target: { target: "custom", field: key } as SystemFieldTarget, confidence: "manual" as const };
      }
      const opt = SYSTEM_FIELD_OPTIONS.find(o => o.value === newValue);
      if (opt) return { ...m, target: opt.target, confidence: "manual" as const };
      return m;
    }));
  }, []);

  // ── Step 3 → 4 transition ──────────────────────────────────────────────

  const handleStartImport = useCallback(async () => {
    if (!workbookRef.current || !selectedSheet) return;
    const result = applyMappings(workbookRef.current, selectedSheet, mappings);
    setImportData(result);
    setStep(3);
    await executeImport(result.rows, result.newCustomFields, importConfig);
  }, [selectedSheet, mappings, importConfig, executeImport]);

  // ── Render ────────────────────────────────────────────────────────────

  const canGoNext = (): boolean => {
    if (step === 0) return !!parseResult && parseResult.totalRows > 0;
    if (step === 1) {
      const hasName = mappings.some(m => m.target?.target === "product" && m.target.field === "name");
      return hasName;
    }
    if (step === 2) return !!importConfig.period && !!importConfig.date;
    return false;
  };

  const mappedFieldCount = mappings.filter(m => m.target !== null).length;
  const customFieldCount = mappings.filter(m => m.target?.target === "custom").length;

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={[
              "flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold transition-colors",
              i === step ? "bg-primary-500 text-white" :
              i < step ? "bg-primary-500/20 text-primary-500" :
              "bg-surface-2 text-[var(--text-tertiary)]",
            ].join(" ")}>
              {i < step ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <span className={[
              "font-mono text-[11px] uppercase tracking-[0.12em]",
              i === step ? "text-foreground font-bold" : "text-[var(--text-tertiary)]",
            ].join(" ")}>
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && <div className="w-8 h-px bg-border-light" />}
          </div>
        ))}
      </div>

      {/* ── Step 0: Upload ─────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="rounded-xl border border-border-light bg-surface-1 p-6 space-y-4">
          <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">
            Seleccionar archivo Excel
          </h2>
          <p className="text-[12px] text-[var(--text-tertiary)]">
            Sube tu archivo de inventario (.xls o .xlsx). El sistema detectará automáticamente las columnas y te permitirá ajustar el mapeo.
          </p>

          <div
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 py-12 border-2 border-dashed border-border-light rounded-xl cursor-pointer hover:border-primary-500/40 hover:bg-primary-500/[0.02] transition-all"
          >
            {fileName ? (
              <>
                <FileSpreadsheet size={32} className="text-primary-500" />
                <span className="text-[14px] font-medium text-foreground">{fileName}</span>
                <span className="text-[12px] text-[var(--text-tertiary)]">
                  {parseResult ? `${parseResult.totalRows} filas en ${parseResult.headers.length} columnas` : "Procesando..."}
                </span>
              </>
            ) : (
              <>
                <Upload size={32} className="text-[var(--text-tertiary)]" />
                <span className="text-[13px] text-[var(--text-tertiary)]">Haz clic para seleccionar un archivo</span>
                <span className="text-[11px] text-[var(--text-disabled)]">.xls, .xlsx</span>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFileSelect} />

          {fileError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
              <AlertTriangle size={14} /> {fileError}
            </div>
          )}

          {/* Detected format profile badge */}
          {parseResult?.detectedProfile && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-primary-500/20 bg-primary-500/[0.05] text-primary-500 text-[13px]">
              <Sparkles size={14} />
              <span>
                Formato detectado: <strong>{parseResult.detectedProfile.label}</strong>
                {" "}— Confianza: {Math.round(parseResult.detectedProfile.confidence * 100)}%
              </span>
            </div>
          )}

          {/* Sheet selector */}
          {parseResult && parseResult.sheetNames.length > 1 && (
            <div>
              <label className={labelCls}>Hoja a importar</label>
              <select className={fieldCls} value={selectedSheet} onChange={e => handleSheetChange(e.target.value)}>
                {parseResult.sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Preview */}
          {parseResult && parseResult.previewRows.length > 0 && (
            <div>
              <p className={labelCls}>Vista previa (primeras filas)</p>
              <div className="overflow-x-auto rounded-lg border border-border-light">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-surface-2/50">
                      {parseResult.headers.map((h, idx) => h ? (
                        <th key={idx} className="px-3 py-2 text-left text-[var(--text-tertiary)] font-normal whitespace-nowrap">{h}</th>
                      ) : null)}
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.previewRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-border-light/50">
                        {parseResult.headers.map((h, idx) => h ? (
                          <td key={idx} className="px-3 py-1.5 text-[var(--text-secondary)] whitespace-nowrap max-w-[200px] truncate">{row[h] ?? ""}</td>
                        ) : null)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 1: Column mapping ──────────────────────────────────────── */}
      {step === 1 && parseResult && (
        <div className="rounded-xl border border-border-light bg-surface-1 p-6 space-y-4">
          <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">
            Mapeo de columnas
          </h2>
          <p className="text-[12px] text-[var(--text-tertiary)]">
            Se detectaron {mappedFieldCount} columnas automáticamente ({customFieldCount} como campos personalizados).
            Ajusta el mapeo si es necesario. Al menos el nombre del producto debe estar mapeado.
          </p>

          <div className="overflow-x-auto rounded-lg border border-border-light">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-surface-2/50 border-b border-border-light">
                  <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal">Columna del archivo</th>
                  <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal">Campo del sistema</th>
                  <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal">Ejemplo</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => {
                  if (!m.sourceHeader) return null;
                  const sampleValue = parseResult.previewRows[0]?.[m.sourceHeader] ?? "";
                  const currentValue = m.target
                    ? (m.target.target === "custom" ? `custom:${m.target.field}` : `${m.target.target}.${m.target.field}`)
                    : "__skip__";

                  return (
                    <tr key={m.sourceIndex} className="border-t border-border-light/50">
                      <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {m.confidence === "auto" && m.target && (
                            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Auto-detectado" />
                          )}
                          {m.sourceHeader}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="h-8 px-2 rounded-lg border border-border-light bg-surface-1 outline-none text-[12px] text-foreground focus:border-primary-500/60 w-56"
                          value={currentValue}
                          onChange={e => handleMappingChange(m.sourceIndex, e.target.value)}
                        >
                          <option value="__skip__">— Ignorar —</option>
                          <optgroup label="Producto">
                            {SYSTEM_FIELD_OPTIONS.filter(o => o.target.target === "product").map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Departamento">
                            {SYSTEM_FIELD_OPTIONS.filter(o => o.target.target === "department").map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Movimientos">
                            {SYSTEM_FIELD_OPTIONS.filter(o => o.target.target === "movement").map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Moneda">
                            {SYSTEM_FIELD_OPTIONS.filter(o => o.target.target === "currency").map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                          <option value={`custom:${m.target?.target === "custom" ? m.target.field : labelToKey(m.sourceHeader)}`}>
                            Campo personalizado
                          </option>
                        </select>
                      </td>
                      <td className="px-4 py-2 text-[var(--text-tertiary)] max-w-[200px] truncate">
                        {sampleValue}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Step 2: Configuration ───────────────────────────────────────── */}
      {step === 2 && (
        <div className="rounded-xl border border-border-light bg-surface-1 p-6 space-y-4">
          <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">
            Configuración de importación
          </h2>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Periodo</label>
              <BaseInput.Field
                type="month"
                value={importConfig.period}
                onValueChange={v => setImportConfig(prev => ({ ...prev, period: v }))}
              />
            </div>
            <div>
              <label className={labelCls}>Fecha de movimientos</label>
              <BaseInput.Field
                type="date"
                value={importConfig.date}
                onValueChange={v => setImportConfig(prev => ({ ...prev, date: v }))}
              />
            </div>
            <div>
              <label className={labelCls}>Referencia</label>
              <BaseInput.Field
                type="text"
                value={importConfig.reference}
                onValueChange={v => setImportConfig(prev => ({ ...prev, reference: v }))}
              />
            </div>
          </div>

          {/* Summary */}
          {parseResult && (
            <div className="px-4 py-3 rounded-lg bg-surface-2/50 border border-border-light space-y-1">
              <p className="text-[13px] font-medium text-foreground">Resumen de importación</p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {parseResult.totalRows} productos a procesar
              </p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {mappedFieldCount} columnas mapeadas, {customFieldCount} campos personalizados
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Execution ───────────────────────────────────────────── */}
      {step === 3 && (
        <div className="rounded-xl border border-border-light bg-surface-1 p-6 space-y-4">
          <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">
            {progress.phase === "done" ? "Importación completada" : "Importando..."}
          </h2>

          {/* Progress bar */}
          {progress.phase !== "idle" && progress.phase !== "done" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
                <span className="uppercase tracking-[0.12em]">
                  {progress.phase === "departments" && "Creando departamentos..."}
                  {progress.phase === "customFields" && "Configurando campos..."}
                  {progress.phase === "products" && "Importando productos..."}
                  {progress.phase === "movements" && "Creando movimientos..."}
                </span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Counters */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Departamentos", value: progress.created.departments },
              { label: "Productos creados", value: progress.created.products },
              { label: "Productos actualizados", value: progress.updated.products },
              { label: "Movimientos", value: progress.created.movements },
            ].map(({ label, value }) => (
              <div key={label} className="px-3 py-2 rounded-lg bg-surface-2/50 border border-border-light text-center">
                <p className="text-[18px] font-bold text-foreground tabular-nums">{value}</p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{label}</p>
              </div>
            ))}
          </div>

          {/* Errors */}
          {progress.errors.length > 0 && (
            <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] space-y-1 max-h-40 overflow-y-auto">
              {progress.errors.slice(0, 20).map((err, i) => (
                <p key={i} className="text-[11px] text-red-500 flex items-center gap-1.5">
                  <X size={10} /> Fila {err.row}: {err.message}
                </p>
              ))}
              {progress.errors.length > 20 && (
                <p className="text-[11px] text-[var(--text-tertiary)]">...y {progress.errors.length - 20} errores más</p>
              )}
            </div>
          )}

          {/* Import data warnings */}
          {importData && importData.warnings.length > 0 && progress.phase === "done" && (
            <div className="px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] space-y-1 max-h-40 overflow-y-auto">
              <p className="text-[12px] font-medium text-amber-600">{importData.warnings.length} advertencias</p>
              {importData.warnings.slice(0, 10).map((w, i) => (
                <p key={i} className="text-[11px] text-amber-600">Fila {w.row}: {w.message}</p>
              ))}
            </div>
          )}

          {/* Done message */}
          {progress.phase === "done" && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-green-500/20 bg-green-500/[0.05] text-green-600 text-[13px]">
              <CheckCircle2 size={16} /> Importación finalizada correctamente.
            </div>
          )}
        </div>
      )}

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          {step > 0 && step < 3 && (
            <BaseButton.Root variant="secondary" size="sm" onClick={() => setStep(s => s - 1)} leftIcon={<ArrowLeft size={14} />}>
              Atrás
            </BaseButton.Root>
          )}
        </div>
        <div className="flex items-center gap-2">
          {progress.phase !== "idle" && progress.phase !== "done" && step === 3 && (
            <BaseButton.Root variant="secondary" size="sm" onClick={cancel}>
              Cancelar
            </BaseButton.Root>
          )}
          {step < 2 && (
            <BaseButton.Root
              variant="primary"
              size="sm"
              onClick={() => setStep(s => s + 1)}
              isDisabled={!canGoNext()}
              leftIcon={<ArrowRight size={14} />}
            >
              Siguiente
            </BaseButton.Root>
          )}
          {step === 2 && (
            <BaseButton.Root
              variant="primary"
              size="sm"
              onClick={handleStartImport}
              isDisabled={!canGoNext()}
              leftIcon={<Loader2 size={14} />}
            >
              Iniciar importación
            </BaseButton.Root>
          )}
          {step === 3 && progress.phase === "done" && (
            <BaseButton.Root variant="primary" size="sm" onClick={() => { reset(); setStep(0); setParseResult(null); setFileName(null); }}>
              Nueva importación
            </BaseButton.Root>
          )}
        </div>
      </div>
    </div>
  );
}

// Local helper (duplicated to avoid cross-file import for a 3-line function)
function labelToKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

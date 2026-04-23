// inventory-excel.ts — Excel import utilities for inventory migration.
// Architectural role: pure data transformation — parses .xls/.xlsx into typed domain rows.
// Column detection uses a Spanish-first dictionary with fallback to custom fields.
// No side effects — all I/O happens in the calling hook.

import * as XLSX from "xlsx";
import type { VatType } from "@/src/modules/inventory/backend/domain/product";
import type { CustomFieldDefinition } from "@/src/modules/companies/frontend/hooks/use-companies";

// ── System field target discriminated union ─────────────────────────────────

export type SystemFieldTarget =
  | { target: "product"; field: "code" }
  | { target: "product"; field: "name" }
  | { target: "product"; field: "vatType" }
  | { target: "department"; field: "name" }
  | { target: "movement"; field: "initialStock" }
  | { target: "movement"; field: "initialCost" }
  | { target: "movement"; field: "currentStock" }
  | { target: "movement"; field: "averageCost" }
  | { target: "movement"; field: "entradaQty" }
  | { target: "movement"; field: "entradaCost" }
  | { target: "movement"; field: "salidaQty" }
  | { target: "movement"; field: "salidaCost" }
  | { target: "movement"; field: "autoconsumoQty" }
  | { target: "currency"; field: "currency" }
  | { target: "currency"; field: "dollarRate" }
  | { target: "custom"; field: string };

// ── Column mapping ──────────────────────────────────────────────────────────

export interface ColumnMapping {
  sourceIndex: number;
  sourceHeader: string;
  target: SystemFieldTarget | null; // null = skip
  confidence: "auto" | "manual";
}

// ── Parse results ───────────────────────────────────────────────────────────

export interface ExcelParseResult {
  sheetNames: string[];
  headers: string[];
  suggestedMappings: ColumnMapping[];
  previewRows: Record<string, string>[]; // first 10 rows keyed by header
  totalRows: number;
  /** Present when a format profile was auto-detected for the uploaded file. */
  detectedProfile?: { id: string; label: string; confidence: number } | null;
  /** The full profile object when detected (for re-parsing on sheet change). */
  detectedProfileFull?: ImportFormatProfile | null;
  /** Sheet name selected by the detected profile (may differ from first sheet). */
  selectedSheet?: string;
}

export interface ExcelImportRow {
  product: { code: string; name: string; vatType: VatType };
  departmentName: string | null;
  initialStock: number;
  initialCost: number;
  entradaQty: number;
  entradaCost: number;
  salidaQty: number;
  salidaCost: number;
  autoconsumoQty: number;
  currentStock: number;
  averageCost: number;
  currency: "B" | "D" | null;
  dollarRate: number | null;
  customFields: Record<string, unknown>;
}

export interface ExcelImportResult {
  rows: ExcelImportRow[];
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  newCustomFields: CustomFieldDefinition[];
}

// ── Normalization helpers ───────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeHeader(raw: string): string {
  return stripAccents(raw).toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, " ");
}

// Generate a machine-safe key from a Spanish label.
function labelToKey(label: string): string {
  return stripAccents(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeVatType(raw: string | number): VatType {
  const s = String(raw).trim().toLowerCase();
  if (s === "e" || s === "exento" || s === "exenta" || s === "0" || s === "0%") return "exento";
  return "general";
}

export function normalizeCurrency(raw: string | number): "B" | "D" | null {
  const s = String(raw).trim().toUpperCase();
  if (s === "D" || s === "USD" || s === "$") return "D";
  if (s === "B" || s === "BS" || s === "BS." || s === "VES" || s === "BSD") return "B";
  return null;
}

export function parseNumeric(raw: unknown): number {
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  if (typeof raw !== "string") return 0;
  const cleaned = raw.replace(/[^0-9.,\-]/g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ── Auto-detection dictionary ───────────────────────────────────────────────
// Ordered by specificity: first match wins. Each entry is [regex, SystemFieldTarget].

const MAPPING_DICTIONARY: Array<[RegExp, SystemFieldTarget]> = [
  // Product code
  [/^codigo$/, { target: "product", field: "code" }],
  [/^cod$/, { target: "product", field: "code" }],
  [/^sku$/, { target: "product", field: "code" }],
  [/^code$/, { target: "product", field: "code" }],

  // Product name (order matters: "producto" before partial matches)
  [/^descripcion$/, { target: "product", field: "name" }],
  [/^producto$/, { target: "product", field: "name" }],
  [/^nombre$/, { target: "product", field: "name" }],
  [/^name$/, { target: "product", field: "name" }],

  // Department
  [/^departamento$/, { target: "department", field: "name" }],
  [/^depto$/, { target: "department", field: "name" }],
  [/^lineas?$/, { target: "department", field: "name" }],
  [/^categorias?$/, { target: "department", field: "name" }],

  // Initial stock and cost (must come before generic "existencia")
  [/^existencia inicial$/, { target: "movement", field: "initialStock" }],
  [/^inventario inicial$/, { target: "movement", field: "initialStock" }],
  [/^stock inicial$/, { target: "movement", field: "initialStock" }],
  [/^costo inicial$/, { target: "movement", field: "initialCost" }],

  // Current stock
  [/^existencia actual$/, { target: "movement", field: "currentStock" }],
  [/^inventario actual$/, { target: "movement", field: "currentStock" }],
  [/^stock$/, { target: "movement", field: "currentStock" }],
  [/^existencia$/, { target: "movement", field: "currentStock" }],

  // Average cost
  [/^costo promedio/, { target: "movement", field: "averageCost" }],
  [/^costo actual/, { target: "movement", field: "averageCost" }],

  // Entry cost (before generic "entradas")
  [/^costo de? entradas/, { target: "movement", field: "entradaCost" }],
  [/^costo entradas/, { target: "movement", field: "entradaCost" }],

  // Exit cost (before generic "salidas")
  [/^total salidas/, { target: "movement", field: "salidaCost" }],
  [/^costo de? salidas/, { target: "movement", field: "salidaCost" }],
  [/^costo salidas/, { target: "movement", field: "salidaCost" }],

  // Entry/exit quantities
  [/^entradas?$/, { target: "movement", field: "entradaQty" }],
  [/^salidas?$/, { target: "movement", field: "salidaQty" }],

  // Self-consumption
  [/^auto ?consumo$/, { target: "movement", field: "autoconsumoQty" }],
  [/^costo de? autoconsumo$/, { target: "movement", field: "autoconsumoQty" }],

  // VAT
  [/^iva( tipo)?$/, { target: "product", field: "vatType" }],
  [/^iva ?%$/, { target: "product", field: "vatType" }],

  // Currency
  [/^moneda$/, { target: "currency", field: "currency" }],

  // Exchange rate
  [/^tasa( sistema bancario)?$/, { target: "currency", field: "dollarRate" }],
  [/^tasa dolar$/, { target: "currency", field: "dollarRate" }],

  // Common custom fields (recognized as custom, not skipped)
  [/^proveedor$/, { target: "custom", field: "proveedor" }],
  [/^ultimo ?prov/, { target: "custom", field: "ultimo_proveedor" }],
  [/^fecha ?ult\.? ?compra/, { target: "custom", field: "fecha_ult_compra" }],
  [/^fecha ?ult\.? ?venta/, { target: "custom", field: "fecha_ult_venta" }],
  [/^marca$/, { target: "custom", field: "marca" }],
];

// ── Core functions ──────────────────────────────────────────────────────────

// Run the auto-detection dictionary against a list of headers.
export function autoDetectMappings(headers: string[]): ColumnMapping[] {
  const usedTargets = new Set<string>();

  return headers.map((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return { sourceIndex: index, sourceHeader: header, target: null, confidence: "auto" as const };

    for (const [regex, field] of MAPPING_DICTIONARY) {
      const targetKey = `${field.target}.${field.field}`;
      if (regex.test(normalized) && !usedTargets.has(targetKey)) {
        usedTargets.add(targetKey);
        return { sourceIndex: index, sourceHeader: header, target: field, confidence: "auto" as const };
      }
    }

    // Unmapped: offer as custom field
    const key = labelToKey(header);
    if (key) {
      return {
        sourceIndex: index,
        sourceHeader: header,
        target: { target: "custom", field: key } as SystemFieldTarget,
        confidence: "auto" as const,
      };
    }

    return { sourceIndex: index, sourceHeader: header, target: null, confidence: "auto" as const };
  });
}

// Read an Excel file and return sheet names, headers, preview, and auto-detected mappings.
export async function parseExcelFile(file: File): Promise<ExcelParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", dense: true });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    return { sheetNames: [], headers: [], suggestedMappings: [], previewRows: [], totalRows: 0 };
  }

  return parseExcelSheet(workbook, sheetNames[0]);
}

/** Options for controlling how a sheet is parsed. */
export interface ParseSheetOptions {
  /** Fixed header row index (0-based). Skips auto-detection when provided. */
  headerRowIndex?: number;
  /** Custom mapping function (e.g. from a detected format profile). */
  mapHeaders?: (headers: string[]) => ColumnMapping[];
}

// Extract headers, preview, and mappings from a specific sheet.
export function parseExcelSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  options?: ParseSheetOptions,
): ExcelParseResult {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { sheetNames: workbook.SheetNames, headers: [], suggestedMappings: [], previewRows: [], totalRows: 0 };
  }

  // Convert sheet to array-of-arrays for uniform processing
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length === 0) {
    return { sheetNames: workbook.SheetNames, headers: [], suggestedMappings: [], previewRows: [], totalRows: 0 };
  }

  // Find header row: use fixed index when provided, otherwise auto-detect
  let headerRowIndex = options?.headerRowIndex ?? -1;
  if (headerRowIndex < 0) {
    headerRowIndex = 0;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      const stringCells = row.filter(cell => typeof cell === "string" && cell.trim().length > 0);
      if (stringCells.length >= 3) {
        headerRowIndex = i;
        break;
      }
    }
  }

  const headers = (rows[headerRowIndex] as unknown[]).map(cell => String(cell ?? "").trim());
  const suggestedMappings = options?.mapHeaders ? options.mapHeaders(headers) : autoDetectMappings(headers);

  // Preview: first 10 data rows after header
  const dataStart = headerRowIndex + 1;
  const previewRows: Record<string, string>[] = [];
  for (let i = dataStart; i < Math.min(dataStart + 10, rows.length); i++) {
    const row = rows[i];
    if (!row || row.every(cell => cell === "" || cell == null)) continue;
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) record[h] = String(row[idx] ?? "");
    });
    previewRows.push(record);
  }

  const totalRows = rows.length - dataStart;

  return { sheetNames: workbook.SheetNames, headers, suggestedMappings, previewRows, totalRows };
}

// Apply confirmed mappings to all rows and produce typed import data.
export function applyMappings(
  workbook: XLSX.WorkBook,
  sheetName: string,
  mappings: ColumnMapping[],
): ExcelImportResult {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { rows: [], errors: [], warnings: [], newCustomFields: [] };

  const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (allRows.length === 0) return { rows: [], errors: [], warnings: [], newCustomFields: [] };

  // Find header row again
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    const row = allRows[i];
    const stringCells = row.filter(cell => typeof cell === "string" && cell.trim().length > 0);
    if (stringCells.length >= 3) { headerRowIndex = i; break; }
  }

  // Build field-to-index lookups from mappings
  const fieldMap = new Map<string, number>();
  const customMappings: Array<{ index: number; key: string; header: string }> = [];

  for (const mapping of mappings) {
    if (!mapping.target) continue;
    const key = `${mapping.target.target}.${mapping.target.field}`;
    if (mapping.target.target === "custom") {
      customMappings.push({ index: mapping.sourceIndex, key: mapping.target.field, header: mapping.sourceHeader });
    } else {
      fieldMap.set(key, mapping.sourceIndex);
    }
  }

  // Helper to get cell value by system field key
  const getVal = (row: unknown[], key: string): unknown => {
    const idx = fieldMap.get(key);
    return idx !== undefined ? row[idx] : undefined;
  };

  const rows: ExcelImportRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];
  const dataStart = headerRowIndex + 1;

  for (let i = dataStart; i < allRows.length; i++) {
    const raw = allRows[i];
    if (!raw || raw.every(cell => cell === "" || cell == null)) continue;

    const rowNum = i + 1; // 1-based for user display

    // Extract product fields
    const code = String(getVal(raw, "product.code") ?? "").trim();
    const name = String(getVal(raw, "product.name") ?? "").trim();

    if (!name && !code) {
      // Skip truly empty rows silently
      continue;
    }
    if (!name) {
      errors.push({ row: rowNum, message: `Fila sin nombre de producto (código: "${code}")` });
      continue;
    }

    const rawVat = getVal(raw, "product.vatType");
    const vatType = rawVat !== undefined ? normalizeVatType(rawVat as string | number) : "general";

    // Department
    const deptRaw = getVal(raw, "department.name");
    const departmentName = deptRaw ? String(deptRaw).trim() : null;

    // Movement fields
    const initialStock = parseNumeric(getVal(raw, "movement.initialStock"));
    const initialCost = parseNumeric(getVal(raw, "movement.initialCost"));
    const entradaQty = parseNumeric(getVal(raw, "movement.entradaQty"));
    const entradaCost = parseNumeric(getVal(raw, "movement.entradaCost"));
    const salidaQty = parseNumeric(getVal(raw, "movement.salidaQty"));
    const salidaCost = parseNumeric(getVal(raw, "movement.salidaCost"));
    const autoconsumoQty = parseNumeric(getVal(raw, "movement.autoconsumoQty"));
    const currentStock = parseNumeric(getVal(raw, "movement.currentStock"));
    const averageCost = parseNumeric(getVal(raw, "movement.averageCost"));

    // Currency
    const rawCurrency = getVal(raw, "currency.currency");
    const currency = rawCurrency !== undefined ? normalizeCurrency(rawCurrency as string | number) : null;
    const dollarRate = parseNumeric(getVal(raw, "currency.dollarRate")) || null;

    // Custom fields
    const customFields: Record<string, unknown> = {};
    for (const cm of customMappings) {
      const val = raw[cm.index];
      if (val !== undefined && val !== null && val !== "") {
        customFields[cm.key] = val;
      }
    }

    // Reconciliation warning
    if (initialStock > 0 && currentStock > 0) {
      const expected = initialStock + entradaQty - salidaQty - autoconsumoQty;
      if (Math.abs(expected - currentStock) > 0.01) {
        warnings.push({
          row: rowNum,
          message: `Existencia no cuadra: inicial(${initialStock}) + entradas(${entradaQty}) - salidas(${salidaQty}) - autoconsumo(${autoconsumoQty}) = ${expected}, pero existencia actual = ${currentStock}`,
        });
      }
    }

    rows.push({
      product: { code, name, vatType },
      departmentName,
      initialStock, initialCost,
      entradaQty, entradaCost,
      salidaQty, salidaCost,
      autoconsumoQty,
      currentStock, averageCost,
      currency, dollarRate,
      customFields,
    });
  }

  // Build CustomFieldDefinition[] for any new custom fields detected
  const newCustomFields: CustomFieldDefinition[] = customMappings.map(cm => ({
    key: cm.key,
    label: cm.header,
    type: "text" as const, // default to text; user can change later
  }));

  return { rows, errors, warnings, newCustomFields };
}

// ── Profile-aware file parsing ──────────────────────────────────────────────

import {
  detectFormatProfile,
  applyProfileMappings,
  selectSheet,
  type ImportFormatProfile,
} from "./import-format-profiles";

/**
 * Parse an Excel workbook with automatic format profile detection.
 * If a registered profile matches, its sheet strategy, header row, and column
 * mappings are used. Otherwise falls back to generic auto-detection.
 */
export function parseExcelFileWithProfiles(
  workbook: XLSX.WorkBook,
  fileName: string,
): ExcelParseResult {
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    return { sheetNames: [], headers: [], suggestedMappings: [], previewRows: [], totalRows: 0 };
  }

  // Try to detect a profile using headers from multiple sheets
  let detection = tryDetectFromSheet(workbook, sheetNames[0], sheetNames, fileName);

  // If no detection on first sheet, try each sheet until we get a match
  if (!detection && sheetNames.length > 1) {
    for (const name of sheetNames.slice(1)) {
      detection = tryDetectFromSheet(workbook, name, sheetNames, fileName);
      if (detection) break;
    }
  }

  if (detection) {
    const profile = detection.profile;
    const targetSheet = selectSheet(sheetNames, profile.sheet, workbook);
    const options: ParseSheetOptions = {
      headerRowIndex: profile.headerRowIndex ?? undefined,
      mapHeaders: (headers) => applyProfileMappings(headers, profile),
    };

    const result = parseExcelSheet(workbook, targetSheet, options);
    return {
      ...result,
      detectedProfile: {
        id: profile.id,
        label: profile.label,
        confidence: detection.confidence,
      },
      detectedProfileFull: profile,
      selectedSheet: targetSheet,
    };
  }

  // No profile matched — generic fallback
  return parseExcelSheet(workbook, sheetNames[0]);
}

/** Try to detect a format profile using headers extracted from a specific sheet. */
function tryDetectFromSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  sheetNames: string[],
  fileName: string,
) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length === 0) return null;

  // Scan first 15 rows for potential header rows
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    const stringCells = row.filter(cell => typeof cell === "string" && cell.trim().length > 0);
    if (stringCells.length >= 3) {
      const headers = row.map(cell => String(cell ?? "").trim());
      const result = detectFormatProfile(sheetNames, headers, fileName);
      if (result) return result;
    }
  }
  return null;
}

// ── Available system field options for the mapping UI dropdown ───────────────

export const SYSTEM_FIELD_OPTIONS: Array<{ label: string; value: string; target: SystemFieldTarget }> = [
  { label: "Código del producto", value: "product.code", target: { target: "product", field: "code" } },
  { label: "Nombre del producto", value: "product.name", target: { target: "product", field: "name" } },
  { label: "IVA (tipo)", value: "product.vatType", target: { target: "product", field: "vatType" } },
  { label: "Departamento", value: "department.name", target: { target: "department", field: "name" } },
  { label: "Existencia inicial", value: "movement.initialStock", target: { target: "movement", field: "initialStock" } },
  { label: "Costo inicial", value: "movement.initialCost", target: { target: "movement", field: "initialCost" } },
  { label: "Existencia actual", value: "movement.currentStock", target: { target: "movement", field: "currentStock" } },
  { label: "Costo promedio", value: "movement.averageCost", target: { target: "movement", field: "averageCost" } },
  { label: "Entradas (cantidad)", value: "movement.entradaQty", target: { target: "movement", field: "entradaQty" } },
  { label: "Costo de entradas", value: "movement.entradaCost", target: { target: "movement", field: "entradaCost" } },
  { label: "Salidas (cantidad)", value: "movement.salidaQty", target: { target: "movement", field: "salidaQty" } },
  { label: "Costo de salidas", value: "movement.salidaCost", target: { target: "movement", field: "salidaCost" } },
  { label: "Auto consumo", value: "movement.autoconsumoQty", target: { target: "movement", field: "autoconsumoQty" } },
  { label: "Moneda (B/D)", value: "currency.currency", target: { target: "currency", field: "currency" } },
  { label: "Tasa de cambio", value: "currency.dollarRate", target: { target: "currency", field: "dollarRate" } },
];

// import-format-profiles.ts — Declarative format profiles for client-specific Excel imports.
// Architectural role: configuration registry that describes how to parse different Excel
// file formats. Adding a new client format = adding a new profile object to PROFILES.
// No side effects — pure data and scoring functions.

import type { SystemFieldTarget, ColumnMapping } from "./inventory-excel";
import { normalizeHeader } from "./inventory-excel";

// ── Profile type ───────────────────────────────────────────────────────────

/** Strategy for selecting which sheet to parse in a multi-sheet workbook. */
export type SheetStrategy =
  | { strategy: "first" }
  | { strategy: "byName"; name: string }
  | { strategy: "largest" };

/** Declarative description of a client's Excel file format. */
export interface ImportFormatProfile {
  /** Unique machine identifier, e.g. "pharmacy_pos". */
  id: string;
  /** Human-readable label shown in the wizard (Spanish). */
  label: string;
  /** Short description of the format origin. */
  description: string;

  /** How to pick the right sheet in multi-sheet workbooks. */
  sheet: SheetStrategy;

  /**
   * Fixed header row index (0-based). When null the existing heuristic
   * (first row with 3+ non-empty string cells) is used.
   */
  headerRowIndex: number | null;

  /**
   * Explicit column-to-field mappings keyed by normalized header.
   * A null value means "skip this column intentionally".
   */
  columnMap: Record<string, SystemFieldTarget | null>;

  /**
   * Disambiguation for headers that appear more than once (e.g. two "iva" columns).
   * Key = normalized header, value = ordered array of targets by occurrence index.
   */
  duplicateColumns?: Record<string, Array<SystemFieldTarget | null>>;

  /** Heuristics used to score how well a file matches this profile. */
  detect: {
    /** Normalized headers that MUST all be present. Score = 0 if any is missing. */
    requiredHeaders: string[];
    /** Normalized headers that boost the score when present. */
    bonusHeaders?: string[];
    /** Sheet names that boost the score when found in the workbook. */
    sheetNameHints?: string[];
    /** Regex tested against the uploaded filename for an extra score boost. */
    filenamePattern?: RegExp;
  };
}

// ── Concrete profiles ──────────────────────────────────────────────────────

const PHARMACY_POS_PROFILE: ImportFormatProfile = {
  id: "pharmacy_pos",
  label: "Farmacia POS (inventario general)",
  description: "Exportación de inventario desde sistema POS de farmacia. Snapshot sin movimientos de entradas/salidas.",

  sheet: { strategy: "first" },
  headerRowIndex: null,

  columnMap: {
    "codigo": { target: "product", field: "code" },
    "descripcion": { target: "product", field: "name" },
    "lineas": { target: "department", field: "name" },
    "existencia": { target: "movement", field: "currentStock" },
    "costo": { target: "movement", field: "averageCost" },
    "iva": { target: "product", field: "vatType" },
    "moneda": { target: "currency", field: "currency" },

    // Custom fields — pharmacy-specific
    "marcas": { target: "custom", field: "marca" },
    "barcode": { target: "custom", field: "barcode" },
    "ultimo prov": { target: "custom", field: "ultimo_proveedor" },
    "fecha ult compra": { target: "custom", field: "fecha_ult_compra" },
    "fecha ult venta": { target: "custom", field: "fecha_ult_venta" },
    "lote": { target: "custom", field: "lote" },
    "fecha vence": { target: "custom", field: "fecha_vence" },
    "accion terapeutica": { target: "custom", field: "accion_terapeutica" },
    "presentacion": { target: "custom", field: "presentacion" },
    "controlados": { target: "custom", field: "controlados" },
    "deposito": { target: "custom", field: "deposito" },
    "precio1": { target: "custom", field: "precio1" },
    "precio2": { target: "custom", field: "precio2" },
    "precio deta": { target: "custom", field: "precio_detalle" },
    "precio divisa": { target: "custom", field: "precio_divisa" },
    "costo divisa": { target: "custom", field: "costo_divisa" },
    "embalaje": { target: "custom", field: "embalaje" },
    "empaque": { target: "custom", field: "empaque" },
    "vmd acum": { target: "custom", field: "vmd_acumulado" },
    "vmd real": { target: "custom", field: "vmd_real" },
    "dias stock": { target: "custom", field: "dias_stock" },
    "cant max": { target: "custom", field: "cantidad_maxima" },
    "cant min": { target: "custom", field: "cantidad_minima" },
    "registro": { target: "custom", field: "registro" },
    "activo": { target: "custom", field: "activo" },
    "activo compras": { target: "custom", field: "activo_compras" },
    "homologos": { target: "custom", field: "homologos" },
    "equivalentes": { target: "custom", field: "equivalentes" },
    "modelos": { target: "custom", field: "modelos" },
    "ubicaciones": { target: "custom", field: "ubicaciones" },

    // Skip calculated/redundant columns
    "descripcion1": null,
    "robot": null,
    "existencia deta": null,
    "total costo": null,
    "total precio1": null,
    "total precio2": null,
    "total precio1d": null,
    "total divisa": null,
    "precios grup": null,
  },

  detect: {
    requiredHeaders: ["codigo", "existencia", "costo", "descripcion", "lineas"],
    bonusHeaders: ["lote", "fecha vence", "accion terapeutica", "barcode", "controlados", "marcas", "deposito"],
    filenamePattern: /inventario.*\d{2}[-/]\d{2}[-/]\d{2,4}/i,
  },
};

const SUPERMARKET_ENTRIES_PROFILE: ImportFormatProfile = {
  id: "supermarket_entries",
  label: "Supermercado (Entradas y Salidas)",
  description: "Reporte mensual de entradas y salidas de inventario de supermercado.",

  sheet: { strategy: "largest" },
  headerRowIndex: 6,

  columnMap: {
    "codigo": { target: "product", field: "code" },
    "producto": { target: "product", field: "name" },
    "departamento": { target: "department", field: "name" },
    "proveedor": { target: "custom", field: "proveedor" },
    "inventario inicial": { target: "movement", field: "initialStock" },
    "tasa sistema bancario": { target: "currency", field: "dollarRate" },
    "moneda": { target: "currency", field: "currency" },
    "costo promedio bs": { target: "movement", field: "averageCost" },
    "entradas": { target: "movement", field: "entradaQty" },
    "salidas": { target: "movement", field: "salidaQty" },
    "existencia actual": { target: "movement", field: "currentStock" },
    "costo entradas bs": { target: "movement", field: "entradaCost" },
    "costo salidas bs": { target: "movement", field: "salidaCost" },
    "costo de autoconsumo": { target: "movement", field: "autoconsumoQty" },
    "costo actual bs": { target: "custom", field: "costo_actual_bs" },

    // Skip calculated/redundant columns
    "costo factura": null,
    "costototal bs": null,
    "total salidas siva bs": null,
    "total iva bs": null,
    "total civa bs": null,
  },

  duplicateColumns: {
    "iva": [
      { target: "product", field: "vatType" },
      null, // second IVA column is the percentage — skip
    ],
  },

  detect: {
    requiredHeaders: ["codigo", "producto", "departamento", "entradas", "salidas", "existencia actual"],
    bonusHeaders: ["costo factura", "costototal bs", "tasa sistema bancario", "costo promedio bs"],
    sheetNameHints: ["SALDO"],
    filenamePattern: /inventario.*full.market/i,
  },
};

// ── Profile registry ───────────────────────────────────────────────────────
// To add a new client format, define a profile above and add it here.

const PROFILES: ImportFormatProfile[] = [
  PHARMACY_POS_PROFILE,
  SUPERMARKET_ENTRIES_PROFILE,
];

// ── Detection ──────────────────────────────────────────────────────────────

/** Result of profile detection with confidence score (0–1). */
export interface ProfileDetectionResult {
  profile: ImportFormatProfile;
  confidence: number;
}

/**
 * Score each registered profile against the file metadata and return
 * the best match above the confidence threshold, or null for generic fallback.
 */
export function detectFormatProfile(
  sheetNames: string[],
  rawHeaders: string[],
  fileName: string,
): ProfileDetectionResult | null {
  const normalizedHeaders = rawHeaders.map(h => normalizeHeader(h));
  const headerSet = new Set(normalizedHeaders.filter(Boolean));
  const sheetNameSet = new Set(sheetNames.map(s => s.toUpperCase()));

  let bestResult: ProfileDetectionResult | null = null;

  for (const profile of PROFILES) {
    // Gate: all required headers must be present
    const allRequired = profile.detect.requiredHeaders.every(rh => headerSet.has(rh));
    if (!allRequired) continue;

    // Base score for passing required headers (0.6)
    let score = 0.6;
    let earnedBonus = 0;

    // Bonus headers (up to 0.15)
    const bonusHeaders = profile.detect.bonusHeaders ?? [];
    if (bonusHeaders.length > 0) {
      const bonusFound = bonusHeaders.filter(bh => headerSet.has(bh)).length;
      earnedBonus += (bonusFound / bonusHeaders.length) * 0.15;
    }

    // Sheet name hints (up to 0.10)
    const sheetHints = profile.detect.sheetNameHints ?? [];
    if (sheetHints.length > 0) {
      const hintsFound = sheetHints.filter(h => sheetNameSet.has(h.toUpperCase())).length;
      earnedBonus += (hintsFound / sheetHints.length) * 0.10;
    }

    // Filename pattern (up to 0.15)
    if (profile.detect.filenamePattern?.test(fileName)) {
      earnedBonus += 0.15;
    }

    score += earnedBonus;

    if (!bestResult || score > bestResult.confidence) {
      bestResult = { profile, confidence: Math.min(score, 1) };
    }
  }

  // Threshold: only return if confidence is meaningful
  if (bestResult && bestResult.confidence >= 0.5) {
    return bestResult;
  }
  return null;
}

// ── Profile-aware mapping ──────────────────────────────────────────────────

/**
 * Build column mappings using a profile's explicit columnMap and
 * duplicateColumns, falling through to custom-field treatment for
 * any columns not explicitly mapped.
 */
export function applyProfileMappings(
  headers: string[],
  profile: ImportFormatProfile,
): ColumnMapping[] {
  const usedTargets = new Set<string>();
  const headerOccurrences = new Map<string, number>();

  return headers.map((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) {
      return { sourceIndex: index, sourceHeader: header, target: null, confidence: "auto" as const };
    }

    // Track how many times we've seen this normalized header
    const occurrence = headerOccurrences.get(normalized) ?? 0;
    headerOccurrences.set(normalized, occurrence + 1);

    // Check duplicate column strategy first
    if (profile.duplicateColumns?.[normalized]) {
      const targets = profile.duplicateColumns[normalized];
      const target = occurrence < targets.length ? targets[occurrence] : null;
      if (target) {
        const targetKey = `${target.target}.${target.field}`;
        if (!usedTargets.has(targetKey)) {
          usedTargets.add(targetKey);
          return { sourceIndex: index, sourceHeader: header, target, confidence: "auto" as const };
        }
      }
      return { sourceIndex: index, sourceHeader: header, target: null, confidence: "auto" as const };
    }

    // Check explicit columnMap
    if (normalized in profile.columnMap) {
      const target = profile.columnMap[normalized];
      if (target === null) {
        // Explicitly skipped
        return { sourceIndex: index, sourceHeader: header, target: null, confidence: "auto" as const };
      }
      const targetKey = `${target.target}.${target.field}`;
      if (!usedTargets.has(targetKey)) {
        usedTargets.add(targetKey);
        return { sourceIndex: index, sourceHeader: header, target, confidence: "auto" as const };
      }
      return { sourceIndex: index, sourceHeader: header, target: null, confidence: "auto" as const };
    }

    // Fallback: treat as custom field
    const key = normalized.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
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

// ── Sheet selection ────────────────────────────────────────────────────────

/**
 * Pick the best sheet name for a profile's sheet strategy.
 * Returns the chosen sheet name, or the first sheet as fallback.
 */
export function selectSheet(
  sheetNames: string[],
  strategy: SheetStrategy,
  workbook?: { Sheets: Record<string, unknown> },
): string {
  if (sheetNames.length === 0) return "";

  switch (strategy.strategy) {
    case "first":
      return sheetNames[0];

    case "byName": {
      const match = sheetNames.find(s => s.toLowerCase() === strategy.name.toLowerCase());
      return match ?? sheetNames[0];
    }

    case "largest": {
      if (!workbook) return sheetNames[0];
      // Estimate sheet size by checking the ref range
      let largestSheet = sheetNames[0];
      let largestSize = 0;
      for (const name of sheetNames) {
        const sheet = workbook.Sheets[name] as { "!ref"?: string } | undefined;
        if (!sheet?.["!ref"]) continue;
        // Parse ref like "A1:W1026111" to get row count
        const refMatch = sheet["!ref"].match(/:.*?(\d+)$/);
        const rowCount = refMatch ? parseInt(refMatch[1], 10) : 0;
        if (rowCount > largestSize) {
          largestSize = rowCount;
          largestSheet = name;
        }
      }
      return largestSheet;
    }
  }
}

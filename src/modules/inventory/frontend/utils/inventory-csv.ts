// CSV import/export utilities for the inventory module.
// Architectural role: pure data transformation helpers — no side effects except downloadCsv.
// CSV column headers are kept in Spanish for backward compatibility with user-facing data contracts.
// All TypeScript identifiers use English domain types.

import type { Product, ProductType, MeasureUnit, ValuationMethod, VatType, SalePricing } from "@/src/modules/inventory/backend/domain/product";
import type { Department } from "@/src/modules/inventory/backend/domain/department";
import type { Supplier } from "@/src/modules/purchases/backend/domain/supplier";

// ── shared helpers ─────────────────────────────────────────────────────────────

function csvCell(value: string | number | boolean | null | undefined): string {
    const s = String(value ?? "");
    return `"${s.replace(/"/g, '""')}"`;
}

export function downloadCsv(content: string, filename: string) {
    const bom  = "\uFEFF";
    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function normalizeRaw(raw: string): string[] {
    return raw
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
}

function splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
            result.push(current); current = "";
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function cleanCols(cols: string[]): string[] {
    return cols.map((c) => c.trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim());
}

function parseHeader(line: string): string[] {
    return splitCsvLine(line).map((h) =>
        h.toLowerCase().replace(/\s/g, "").replace(/^"|"$/g, "").replace(/""/g, "")
    );
}

// ── Departments ────────────────────────────────────────────────────────────────

// Spanish column names kept for user-facing CSV backward compatibility.
const DEPT_HEADERS = ["nombre", "descripcion", "activo"] as const;

export function departmentsToCsv(departments: Department[]): string {
    const header = DEPT_HEADERS.map(csvCell).join(",");
    const rows   = departments.map((d) =>
        [csvCell(d.name), csvCell(d.description ?? ""), csvCell(d.active)].join(",")
    );
    return [header, ...rows].join("\r\n");
}

export interface DepartmentCsvResult {
    departments: Omit<Department, "id" | "companyId" | "createdAt">[];
    errors:      string[];
}

export function parseDepartmentsCsv(raw: string): DepartmentCsvResult {
    const lines = normalizeRaw(raw);
    const errors: string[] = [];
    const departments: DepartmentCsvResult["departments"] = [];

    if (lines.length < 2) return { departments: [], errors: ["El CSV está vacío o no tiene datos."] };

    const header = parseHeader(lines[0]).join(",");
    if (header !== DEPT_HEADERS.join(",")) {
        return { departments: [], errors: [`Encabezado inválido. Se esperaba: ${DEPT_HEADERS.join(",")}`] };
    }

    for (let i = 1; i < lines.length; i++) {
        const clean = cleanCols(splitCsvLine(lines[i]));
        const [name, description, activeRaw] = clean;

        if (!name) { errors.push(`Línea ${i + 1}: nombre vacío.`); continue; }

        const active = activeRaw?.toLowerCase() !== "false";

        departments.push({ name: name.toUpperCase(), description: description ?? "", active });
    }

    return { departments, errors };
}

// ── Suppliers ──────────────────────────────────────────────────────────────────

// Spanish column names kept for user-facing CSV backward compatibility.
const PROV_HEADERS = ["rif", "nombre", "contacto", "telefono", "email", "direccion", "notas", "activo"] as const;

/** Identifies the layout used by a supplier import file. */
export type SupplierCsvFormat = "canonical" | "legacy";

/**
 * Decodes an uploaded supplier file, accepting UTF-8 only when its byte sequence is valid.
 *
 * @param bytes - Raw bytes read from the selected file.
 * @returns The decoded file contents and the encoding that was required.
 */
export function decodeSuppliersCsvBytes(bytes: ArrayBuffer): { text: string; encoding: "utf-8" | "windows-1252" } {
    try {
        return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
    } catch {
        return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
    }
}

export function suppliersToCsv(suppliers: Supplier[]): string {
    const header = PROV_HEADERS.map(csvCell).join(",");
    const rows   = suppliers.map((s) =>
        [
            csvCell(s.rif),
            csvCell(s.name),
            csvCell(s.contact),
            csvCell(s.phone),
            csvCell(s.email),
            csvCell(s.address),
            csvCell(s.notes),
            csvCell(s.active),
        ].join(",")
    );
    return [header, ...rows].join("\r\n");
}

/** Parsed supplier rows together with their source layout and validation messages. */
export interface SupplierCsvResult {
    suppliers: Omit<Supplier, "id" | "companyId" | "createdAt" | "updatedAt">[];
    errors:    string[];
    format:    SupplierCsvFormat;
    /** Physical source line for each supplier, aligned by array index. */
    sourceLines: number[];
}

function normalizedSupplierHeader(header: string): string {
    return header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function legacySupplierNotes(account: string, bank: string): string {
    return [account && `Cuenta: ${account}`, bank && `Banco: ${bank}`].filter(Boolean).join(" · ");
}

/**
 * Parses either the canonical comma-separated supplier export or the legacy tab-separated PROVEEDORES file.
 *
 * @param raw - Decoded CSV content.
 * @returns Valid supplier rows, detected format, and row-level validation messages.
 */
export function parseSuppliersCsv(raw: string): SupplierCsvResult {
    const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
        .split("\n").map((text, index) => ({ text: text.trim(), sourceLine: index + 1 })).filter((line) => line.text);
    const errors: string[] = [];
    const suppliers: SupplierCsvResult["suppliers"] = [];
    const sourceLines: number[] = [];

    if (lines.length < 2) return { suppliers: [], errors: ["El CSV está vacío o no tiene datos."], format: "canonical", sourceLines: [] };

    const header = parseHeader(lines[0].text).join(",");
    if (header === PROV_HEADERS.join(",")) {
        for (let i = 1; i < lines.length; i++) {
            const clean = cleanCols(splitCsvLine(lines[i].text));
            const [rif, name, contact, phone, email, address, notes, activeRaw] = clean;

            if (!name) { errors.push(`Línea ${lines[i].sourceLine}: nombre vacío.`); continue; }

            suppliers.push({
                rif: rif ?? "", name, contact: contact ?? "", phone: phone ?? "", email: email ?? "",
                address: address ?? "", notes: notes ?? "", active: activeRaw?.toLowerCase() !== "false",
            });
            sourceLines.push(lines[i].sourceLine);
        }
        return { suppliers, errors, format: "canonical", sourceLines };
    }

    const headerIndex = lines.findIndex((line) => {
        const headers = line.text.split("\t").map(normalizedSupplierHeader);
        return headers.includes("rif") && (headers.includes("proveedor") || headers.includes("nombredeempresa") || headers.includes("nombredeempresaproveedor"));
    });
    if (headerIndex < 0) {
        return { suppliers: [], errors: [`Encabezado inválido. Se esperaba: ${PROV_HEADERS.join(",")} o el formato legado PROVEEDORES.`], format: "legacy", sourceLines: [] };
    }
    const legacyHeaders = lines[headerIndex].text.split("\t").map(normalizedSupplierHeader);
    const column = (names: string[]) => legacyHeaders.findIndex((headerName) => names.includes(headerName));
    const rifIndex = column(["rif"]);
    const nameIndex = column(["nombredeempresa", "proveedor", "nombredeempresaproveedor"]);
    const phoneIndex = column(["telefono"]);
    const emailIndex = column(["email", "correo", "correoelectronico"]);
    const addressIndex = column(["direccion"]);
    const accountIndex = column(["cuenta"]);
    const bankIndex = column(["banco"]);

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const clean = lines[i].text.split("\t").map((value) => value.trim());
        const value = (index: number) => index >= 0 ? clean[index] ?? "" : "";
        const name = value(nameIndex);

        if (!name) { errors.push(`Línea ${lines[i].sourceLine}: nombre vacío.`); continue; }

        suppliers.push({
            rif:     value(rifIndex),
            name,
            contact: "",
            phone:   value(phoneIndex),
            email:   value(emailIndex),
            address: value(addressIndex),
            notes:   legacySupplierNotes(value(accountIndex), value(bankIndex)),
            active:  true,
        });
        sourceLines.push(lines[i].sourceLine);
    }

    return { suppliers, errors, format: "legacy", sourceLines };
}

/**
 * Normalizes a RIF for case- and punctuation-insensitive identity matching.
 *
 * @param rif - The supplier tax identifier as entered or imported.
 * @returns Uppercase alphanumeric RIF identity key, or an empty string when no identifier exists.
 */
export function normalizeSupplierRif(rif: string): string {
    return rif.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** A single supplier persistence operation prepared by an import reconciliation. */
export interface SupplierImportOperation {
    supplier: Supplier;
    action: "create" | "update";
}

/** Safe import operations and source rows excluded from automatic persistence. */
export interface SupplierImportPlan {
    operations: SupplierImportOperation[];
    omitted: string[];
}

function appendDistinctNote(existing: string, imported: string): string {
    if (!imported || existing.includes(imported)) return existing;
    return existing ? `${existing}\n${imported}` : imported;
}

/**
 * Reconciles parsed supplier rows with the loaded catalog without performing persistence.
 * Legacy rows only fill non-empty imported fields and preserve active status; canonical rows replace fields authoritatively.
 *
 * @param result - Parsed import rows and their source format.
 * @param existing - Suppliers currently scoped to the selected company.
 * @param companyId - Company that owns created suppliers.
 * @returns Create/update operations and rows safely omitted due to duplicate identities.
 */
export function planSupplierImport(result: SupplierCsvResult, existing: Supplier[], companyId: string): SupplierImportPlan {
    const operations: SupplierImportOperation[] = [];
    const omitted: string[] = [];
    const sourceRifs = new Set<string>();
    const existingByRif = new Map<string, Supplier[]>();
    for (const supplier of existing) {
        const key = normalizeSupplierRif(supplier.rif);
        if (key) existingByRif.set(key, [...(existingByRif.get(key) ?? []), supplier]);
    }
    for (const [index, imported] of result.suppliers.entries()) {
        const key = normalizeSupplierRif(imported.rif);
        const sourceLine = result.sourceLines[index] ?? index + 2;
        if (key && sourceRifs.has(key)) { omitted.push(`Fila ${sourceLine}: RIF duplicado en el archivo (${imported.rif}). Se conserva la primera ocurrencia.`); continue; }
        if (key) sourceRifs.add(key);
        const matches = key ? existingByRif.get(key) ?? [] : [];
        if (matches.length > 1) { omitted.push(`Fila ${sourceLine}: existen múltiples proveedores con RIF ${imported.rif}; se omitió para evitar una actualización ambigua.`); continue; }
        if (matches.length === 0) {
            operations.push({ supplier: { ...imported, companyId, active: result.format === "legacy" ? true : imported.active }, action: "create" });
            continue;
        }
        const current = matches[0];
        const supplier = result.format === "canonical"
            ? { ...imported, companyId, id: current.id }
            : {
                ...current,
                rif: imported.rif || current.rif, name: imported.name || current.name, phone: imported.phone || current.phone,
                email: imported.email || current.email, address: imported.address || current.address,
                notes: appendDistinctNote(current.notes, imported.notes), companyId,
            };
        operations.push({ supplier, action: "update" });
    }
    return { operations, omitted };
}

// ── Products ───────────────────────────────────────────────────────────────────

// Spanish column names kept for user-facing CSV backward compatibility.
const PROD_HEADERS = [
    "codigo", "nombre", "descripcion", "tipo", "unidad_medida",
    "metodo_valuacion",
    "iva_tipo", "activo", "departamento_nombre",
    "precio_venta_modo", "precio_venta_valor", "precio_venta_moneda",
    "codigo_barras",
] as const;
const LEGACY_PROD_HEADERS = PROD_HEADERS.slice(0, 9);
const PRE_BARCODE_PROD_HEADERS = PROD_HEADERS.slice(0, 12);

const VALID_TYPES: ProductType[]          = ["mercancia"];
const VALID_UNITS: MeasureUnit[]          = ["unidad", "kg", "g", "m", "m2", "m3", "litro", "galon", "caja", "rollo", "paquete"];
const VALID_METHODS: ValuationMethod[]    = ["promedio_ponderado", "peps"];
const VALID_VAT_TYPES: VatType[]          = ["exento", "general"];

export function productsToCsv(products: Product[]): string {
    const header = PROD_HEADERS.map(csvCell).join(",");
    const rows   = products.map((p) =>
        [
            csvCell(p.code),
            csvCell(p.name),
            csvCell(p.description),
            csvCell(p.type),
            csvCell(p.measureUnit),
            csvCell(p.valuationMethod),
            csvCell(p.vatType),
            csvCell(p.active),
            csvCell(p.departmentName ?? ""),
            csvCell(p.salePricing?.mode === "fixed" ? "fijo" : p.salePricing?.mode === "markup" ? "porcentaje" : ""),
            csvCell(p.salePricing ? (p.salePricing.mode === "fixed" ? p.salePricing.amount : p.salePricing.percentage) : ""),
            csvCell(p.salePricing?.currency ?? ""),
            csvCell(p.barcode ?? ""),
        ].join(",")
    );
    return [header, ...rows].join("\r\n");
}

export interface ProductCsvRow {
    code:            string;
    barcode?:        string;
    name:            string;
    description:     string;
    type:            ProductType;
    measureUnit:     MeasureUnit;
    valuationMethod: ValuationMethod;
    vatType:         VatType;
    active:          boolean;
    departmentId?:   string;
    salePricing?:     SalePricing;
}

export interface ProductCsvResult {
    products: ProductCsvRow[];
    errors:   string[];
}

export function parseProductsCsv(raw: string, departments: Department[]): ProductCsvResult {
    const lines = normalizeRaw(raw);
    const errors: string[] = [];
    const products: ProductCsvRow[] = [];

    if (lines.length < 2) return { products: [], errors: ["El CSV está vacío o no tiene datos."] };

    const parsedHeaders = parseHeader(lines[0]);
    const header = parsedHeaders.join(",");
    const isLegacy = header === LEGACY_PROD_HEADERS.join(",");
    const isPreBarcode = header === PRE_BARCODE_PROD_HEADERS.join(",");
    if (!isLegacy && !isPreBarcode && header !== PROD_HEADERS.join(",")) {
        return { products: [], errors: [`Encabezado inválido. Se esperaba: ${PROD_HEADERS.join(",")}`] };
    }

    // Build lookup map using the English `name` property from Department.
    const deptMap = new Map(departments.map((d) => [d.name.toUpperCase(), d.id]));

    for (let i = 1; i < lines.length; i++) {
        const clean = cleanCols(splitCsvLine(lines[i]));
        const [
            code, name, description, typeRaw, unitRaw,
            methodRaw,
            vatRaw, activeRaw, deptName, saleModeRaw, saleValueRaw, saleCurrencyRaw, barcode,
        ] = clean;

        if (!name) { errors.push(`Línea ${i + 1}: nombre vacío.`); continue; }

        const type = (typeRaw ?? "").toLowerCase() as ProductType;
        if (!VALID_TYPES.includes(type)) {
            errors.push(`Línea ${i + 1}: tipo inválido "${typeRaw}". Usa: ${VALID_TYPES.join(", ")}.`); continue;
        }

        const measureUnit = (unitRaw ?? "").toLowerCase() as MeasureUnit;
        if (!VALID_UNITS.includes(measureUnit)) {
            errors.push(`Línea ${i + 1}: unidad_medida inválida "${unitRaw}". Usa: ${VALID_UNITS.join(", ")}.`); continue;
        }

        const valuationMethod = (methodRaw ?? "").toLowerCase() as ValuationMethod;
        if (!VALID_METHODS.includes(valuationMethod)) {
            errors.push(`Línea ${i + 1}: metodo_valuacion inválido "${methodRaw}". Usa: ${VALID_METHODS.join(", ")}.`); continue;
        }

        const vatType = (vatRaw ?? "general").toLowerCase() as VatType;
        if (!VALID_VAT_TYPES.includes(vatType)) {
            errors.push(`Línea ${i + 1}: iva_tipo inválido "${vatRaw}". Usa: exento o general.`); continue;
        }

        const active = activeRaw?.toLowerCase() !== "false";

        let departmentId: string | undefined;
        if (deptName?.trim()) {
            const found = deptMap.get(deptName.trim().toUpperCase());
            if (!found) {
                errors.push(`Línea ${i + 1}: departamento "${deptName}" no encontrado.`); continue;
            }
            departmentId = found;
        }

        let salePricing: SalePricing | undefined;
        const saleMode = (saleModeRaw ?? "").toLowerCase();
        if (saleMode) {
            const value = Number(String(saleValueRaw ?? "").replace(",", "."));
            const currency = (saleCurrencyRaw ?? "").toUpperCase();
            if (!Number.isFinite(value) || value < 0 || (saleMode === "fijo" && value === 0)) {
                errors.push(`Línea ${i + 1}: precio_venta_valor inválido.`); continue;
            }
            if (currency !== "B" && currency !== "D") {
                errors.push(`Línea ${i + 1}: precio_venta_moneda debe ser B o D.`); continue;
            }
            if (saleMode === "fijo") salePricing = { mode: "fixed", amount: value, currency };
            else if (saleMode === "porcentaje") salePricing = { mode: "markup", percentage: value, currency };
            else { errors.push(`Línea ${i + 1}: precio_venta_modo debe ser fijo o porcentaje.`); continue; }
        }

        products.push({
            code:            code ?? "",
            barcode:         barcode?.trim() || undefined,
            name,
            description:     description ?? "",
            type,
            measureUnit,
            valuationMethod,
            vatType,
            active,
            departmentId,
            salePricing,
        });
    }

    return { products, errors };
}

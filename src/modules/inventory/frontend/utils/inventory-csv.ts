// CSV import/export utilities for the inventory module.
// Architectural role: pure data transformation helpers — no side effects except downloadCsv.
// CSV column headers are kept in Spanish for backward compatibility with user-facing data contracts.
// All TypeScript identifiers use English domain types.

import type { Product, ProductType, MeasureUnit, ValuationMethod, VatType } from "@/src/modules/inventory/backend/domain/product";
import type { Department } from "@/src/modules/inventory/backend/domain/department";
import type { Supplier } from "@/src/modules/inventory/backend/domain/supplier";

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

export interface SupplierCsvResult {
    suppliers: Omit<Supplier, "id" | "companyId" | "createdAt" | "updatedAt">[];
    errors:    string[];
}

export function parseSuppliersCsv(raw: string): SupplierCsvResult {
    const lines = normalizeRaw(raw);
    const errors: string[] = [];
    const suppliers: SupplierCsvResult["suppliers"] = [];

    if (lines.length < 2) return { suppliers: [], errors: ["El CSV está vacío o no tiene datos."] };

    const header = parseHeader(lines[0]).join(",");
    if (header !== PROV_HEADERS.join(",")) {
        return { suppliers: [], errors: [`Encabezado inválido. Se esperaba: ${PROV_HEADERS.join(",")}`] };
    }

    for (let i = 1; i < lines.length; i++) {
        const clean = cleanCols(splitCsvLine(lines[i]));
        const [rif, name, contact, phone, email, address, notes, activeRaw] = clean;

        if (!name) { errors.push(`Línea ${i + 1}: nombre vacío.`); continue; }

        const active = activeRaw?.toLowerCase() !== "false";

        suppliers.push({
            rif:     rif ?? "",
            name,
            contact: contact ?? "",
            phone:   phone ?? "",
            email:   email ?? "",
            address: address ?? "",
            notes:   notes ?? "",
            active,
        });
    }

    return { suppliers, errors };
}

// ── Products ───────────────────────────────────────────────────────────────────

// Spanish column names kept for user-facing CSV backward compatibility.
const PROD_HEADERS = [
    "codigo", "nombre", "descripcion", "tipo", "unidad_medida",
    "metodo_valuacion",
    "iva_tipo", "activo", "departamento_nombre",
] as const;

const VALID_TYPES: ProductType[]          = ["mercancia"];
const VALID_UNITS: MeasureUnit[]          = ["unidad", "kg", "g", "m", "m2", "m3", "litro", "caja", "rollo", "paquete"];
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
        ].join(",")
    );
    return [header, ...rows].join("\r\n");
}

export interface ProductCsvRow {
    code:            string;
    name:            string;
    description:     string;
    type:            ProductType;
    measureUnit:     MeasureUnit;
    valuationMethod: ValuationMethod;
    vatType:         VatType;
    active:          boolean;
    departmentId?:   string;
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

    const header = parseHeader(lines[0]).join(",");
    if (header !== PROD_HEADERS.join(",")) {
        return { products: [], errors: [`Encabezado inválido. Se esperaba: ${PROD_HEADERS.join(",")}`] };
    }

    // Build lookup map using the English `name` property from Department.
    const deptMap = new Map(departments.map((d) => [d.name.toUpperCase(), d.id]));

    for (let i = 1; i < lines.length; i++) {
        const clean = cleanCols(splitCsvLine(lines[i]));
        const [
            code, name, description, typeRaw, unitRaw,
            methodRaw,
            vatRaw, activeRaw, deptName,
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

        products.push({
            code:            code ?? "",
            name,
            description:     description ?? "",
            type,
            measureUnit,
            valuationMethod,
            vatType,
            active,
            departmentId,
        });
    }

    return { products, errors };
}

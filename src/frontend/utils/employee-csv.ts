// src/frontend/utils/employee-csv.ts

import { Employee } from "@/src/backend/employees/domain/employee";

const HEADERS = ["cedula", "nombre", "cargo", "salario_mensual_usd", "estado"] as const;

// ── RFC 4180 CSV cell quoting ─────────────────────────────────────────────────
// Always quote every field to avoid Excel/Numbers re-interpretation issues
// (e.g. "V-12983113" being read as a formula, wrapping the whole row)

function csvCell(value: string | number): string {
    const s = String(value);
    // Always wrap in quotes, escape inner quotes as ""
    return `"${s.replace(/"/g, '""')}"`;
}

// ── Export ────────────────────────────────────────────────────────────────────

export function employeesToCsv(employees: Employee[]): string {
    const header = HEADERS.map(csvCell).join(",");
    const rows = employees.map((e) =>
        [
            csvCell(e.cedula),
            csvCell(e.nombre),
            csvCell(e.cargo),
            csvCell(e.salarioMensual),
            csvCell(e.estado),
        ].join(",")
    );
    // Use \r\n (CRLF) — standard RFC 4180, Excel-friendly
    return [header, ...rows].join("\r\n");
}

export function downloadCsv(content: string, filename: string) {
    // BOM for Excel UTF-8 detection
    const bom = "\uFEFF";
    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────────

export interface CsvParseResult {
    employees: Omit<Employee, "id" | "companyId">[];
    errors: string[];
}

export function parseCsv(raw: string): CsvParseResult {
    // Strip BOM if present, normalize line endings
    const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
    const errors: string[] = [];
    const employees: Omit<Employee, "id" | "companyId">[] = [];

    if (lines.length < 2) {
        return { employees: [], errors: ["El CSV está vacío o no tiene datos."] };
    }

    // Validate header — strip quotes, lowercase, no spaces
    const headerCols = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s/g, "").replace(/^"|"$/g, "").replace(/""/g, ""));
    const expectedHeader = HEADERS.join(",");
    if (headerCols.join(",") !== expectedHeader) {
        errors.push(`Encabezado inválido. Se esperaba: ${expectedHeader}`);
        return { employees: [], errors };
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        let cols = splitCsvLine(line);

        // ── Edge case: Excel wraps the entire row in one quoted cell ──────────
        // Symptom: cols.length === 1 and the single value contains commas
        // This happens when Excel re-saves a CSV after reading V-XXXXXXX as formula
        if (cols.length === 1) {
            const inner = cols[0].replace(/^"|"$/g, "").replace(/""/g, '"');
            const retry = splitCsvLine(inner);
            if (retry.length === HEADERS.length) {
                cols = retry;
            }
        }

        if (cols.length !== HEADERS.length) {
            errors.push(`Línea ${i + 1}: se esperaban ${HEADERS.length} columnas, se encontraron ${cols.length}.`);
            continue;
        }

        // Strip surrounding quotes and unescape "" -> "
        const clean = cols.map((c) =>
            c.trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim()
        );

        const [cedula, nombre, cargo, salarioRaw, estadoRaw] = clean;

        if (!cedula) { errors.push(`Línea ${i + 1}: cédula vacía.`); continue; }
        if (!nombre) { errors.push(`Línea ${i + 1}: nombre vacío.`); continue; }

        const salario = parseFloat(salarioRaw);
        if (isNaN(salario) || salario <= 0) {
            errors.push(`Línea ${i + 1}: salario inválido "${salarioRaw}".`);
            continue;
        }

        const estado = estadoRaw.toLowerCase();
        if (!["activo", "inactivo", "vacacion"].includes(estado)) {
            errors.push(`Línea ${i + 1}: estado inválido "${estado}". Usa activo, inactivo o vacacion.`);
            continue;
        }

        employees.push({
            cedula,
            nombre: nombre.toUpperCase(),
            cargo: cargo.toUpperCase(),
            salarioMensual: salario,
            estado: estado as Employee["estado"],
        });
    }

    return { employees, errors };
}

// ── RFC 4180 line splitter ────────────────────────────────────────────────────

function splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote inside quoted field
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === "," && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}
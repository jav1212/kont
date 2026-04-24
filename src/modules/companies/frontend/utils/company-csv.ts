// src/modules/companies/frontend/utils/company-csv.ts
import type { TaxpayerType } from "@/src/modules/companies/backend/domain/company";

const HEADERS = ["rif", "nombre", "tipo_contribuyente"] as const;
const REQUIRED_HEADERS = ["rif", "nombre"] as const;

function csvCell(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

export interface CompanyRow {
    rif: string;
    nombre: string;
    tipoContribuyente?: TaxpayerType;
}

export interface CompanyCsvParseResult {
    companies: CompanyRow[];
    errors: string[];
}

// ── Export ────────────────────────────────────────────────────────────────────

export function companiesToCsv(
    companies: { id: string; name: string; taxpayerType?: TaxpayerType }[],
): string {
    const header = HEADERS.join(",");
    const rows = companies.map((c) =>
        [csvCell(c.id), csvCell(c.name), csvCell(c.taxpayerType ?? "ordinario")].join(","),
    );
    return [header, ...rows].join("\r\n");
}

export function downloadCsv(content: string, filename: string) {
    const bom = "﻿";
    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────────

export function parseCompaniesCsv(raw: string): CompanyCsvParseResult {
    const normalized = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
    const errors: string[] = [];
    const companies: CompanyRow[] = [];

    if (lines.length < 2) {
        return { companies: [], errors: ["El CSV está vacío o no tiene datos."] };
    }

    const headerCols = splitCsvLine(lines[0]).map((h) =>
        h.toLowerCase().replace(/\s/g, "").replace(/^"|"$/g, "").replace(/""/g, "")
    );

    // Required headers must be present in order; the 3rd column (tipo_contribuyente) is optional.
    const hasRif    = headerCols[0] === REQUIRED_HEADERS[0];
    const hasNombre = headerCols[1] === REQUIRED_HEADERS[1];
    if (!hasRif || !hasNombre) {
        errors.push(`Encabezado inválido. Se esperaba al menos: ${REQUIRED_HEADERS.join(",")} (opcional: tipo_contribuyente)`);
        return { companies: [], errors };
    }
    const hasTaxpayerCol = headerCols[2] === "tipo_contribuyente";
    const expectedCols = hasTaxpayerCol ? 3 : 2;

    for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]);
        if (cols.length !== expectedCols) {
            errors.push(`Línea ${i + 1}: se esperaban ${expectedCols} columnas, se encontraron ${cols.length}.`);
            continue;
        }
        const clean = cols.map((c) => c.trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim());
        const [rif, nombre, tipoRaw] = clean;

        if (!rif)    { errors.push(`Línea ${i + 1}: RIF vacío.`);    continue; }
        if (!nombre) { errors.push(`Línea ${i + 1}: nombre vacío.`); continue; }

        let tipoContribuyente: TaxpayerType | undefined = undefined;
        if (hasTaxpayerCol && tipoRaw) {
            const lower = tipoRaw.toLowerCase();
            if (lower === "ordinario" || lower === "especial") {
                tipoContribuyente = lower;
            } else {
                errors.push(`Línea ${i + 1}: tipo_contribuyente inválido ("${tipoRaw}"). Use "ordinario" o "especial".`);
                continue;
            }
        }

        companies.push({ rif: rif.toUpperCase(), nombre, tipoContribuyente });
    }

    return { companies, errors };
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

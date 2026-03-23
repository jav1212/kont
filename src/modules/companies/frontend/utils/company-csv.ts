// src/modules/companies/frontend/utils/company-csv.ts

const HEADERS = ["rif", "nombre"] as const;

function csvCell(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

export interface CompanyRow {
    rif: string;
    nombre: string;
}

export interface CompanyCsvParseResult {
    companies: CompanyRow[];
    errors: string[];
}

// ── Export ────────────────────────────────────────────────────────────────────

export function companiesToCsv(companies: { id: string; name: string }[]): string {
    const header = HEADERS.join(",");
    const rows = companies.map((c) => [csvCell(c.id), csvCell(c.name)].join(","));
    return [header, ...rows].join("\r\n");
}

export function downloadCsv(content: string, filename: string) {
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

export function parseCompaniesCsv(raw: string): CompanyCsvParseResult {
    const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
    const errors: string[] = [];
    const companies: CompanyRow[] = [];

    if (lines.length < 2) {
        return { companies: [], errors: ["El CSV está vacío o no tiene datos."] };
    }

    const headerCols = splitCsvLine(lines[0]).map((h) =>
        h.toLowerCase().replace(/\s/g, "").replace(/^"|"$/g, "").replace(/""/g, "")
    );
    if (headerCols.join(",") !== HEADERS.join(",")) {
        errors.push(`Encabezado inválido. Se esperaba: ${HEADERS.join(",")}`);
        return { companies: [], errors };
    }

    for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]);
        if (cols.length !== HEADERS.length) {
            errors.push(`Línea ${i + 1}: se esperaban ${HEADERS.length} columnas, se encontraron ${cols.length}.`);
            continue;
        }
        const clean = cols.map((c) => c.trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim());
        const [rif, nombre] = clean;

        if (!rif)    { errors.push(`Línea ${i + 1}: RIF vacío.`);    continue; }
        if (!nombre) { errors.push(`Línea ${i + 1}: nombre vacío.`); continue; }

        companies.push({ rif: rif.toUpperCase(), nombre });
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

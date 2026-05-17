// src/modules/companies/frontend/utils/company-csv.ts
import {
    BUSINESS_SECTORS,
    type BusinessSector,
    type TaxpayerType,
} from "@/src/modules/companies/backend/domain/company";

// Canonical column order used when exporting. Import is header-driven and accepts
// any subset as long as `rif` and `nombre` are present.
const HEADERS = [
    "rif",
    "nombre",
    "tipo_contribuyente",
    "telefono",
    "correo",
    "direccion",
    "sector",
    "logo_url",
] as const;

type HeaderKey = typeof HEADERS[number];
const KNOWN_HEADERS = new Set<string>(HEADERS);

function csvCell(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

export interface CompanyRow {
    rif: string;
    nombre: string;
    tipoContribuyente?: TaxpayerType;
    telefono?: string;
    correo?: string;
    direccion?: string;
    sector?: BusinessSector;
    logoUrl?: string;
}

export interface CompanyCsvParseResult {
    companies: CompanyRow[];
    errors: string[];
}

// Shape we accept when exporting — a subset of Company that covers what the CSV emits.
export interface CompanyCsvExportInput {
    id: string;
    name: string;
    taxpayerType?: TaxpayerType;
    phone?: string;
    contactEmail?: string;
    address?: string;
    sector?: BusinessSector;
    logoUrl?: string;
}

// ── Export ────────────────────────────────────────────────────────────────────

export function companiesToCsv(companies: CompanyCsvExportInput[]): string {
    const header = HEADERS.join(",");
    const rows = companies.map((c) =>
        [
            csvCell(c.id),
            csvCell(c.name),
            csvCell(c.taxpayerType ?? "ordinario"),
            csvCell(c.phone        ?? ""),
            csvCell(c.contactEmail ?? ""),
            csvCell(c.address      ?? ""),
            csvCell(c.sector       ?? ""),
            csvCell(c.logoUrl      ?? ""),
        ].join(","),
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

function normalizeHeader(raw: string): string {
    return raw.toLowerCase().trim().replace(/\s/g, "").replace(/^"|"$/g, "").replace(/""/g, "");
}

function cleanCell(raw: string | undefined): string {
    if (raw === undefined) return "";
    return raw.trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim();
}

export function parseCompaniesCsv(raw: string): CompanyCsvParseResult {
    const normalized = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
    const errors: string[] = [];
    const companies: CompanyRow[] = [];

    if (lines.length < 2) {
        return { companies: [], errors: ["El CSV está vacío o no tiene datos."] };
    }

    // Build header → column index map. Unknown headers are reported as a non-fatal warning.
    const headerCols = splitCsvLine(lines[0]).map(normalizeHeader);
    const colIndex: Partial<Record<HeaderKey, number>> = {};
    headerCols.forEach((h, i) => {
        if (KNOWN_HEADERS.has(h)) {
            colIndex[h as HeaderKey] = i;
        } else if (h.length > 0) {
            errors.push(`Encabezado desconocido ignorado: "${h}".`);
        }
    });

    if (colIndex.rif === undefined || colIndex.nombre === undefined) {
        return {
            companies: [],
            errors: [
                `Encabezado inválido. Se requiere al menos "rif" y "nombre". Columnas reconocidas: ${HEADERS.join(", ")}.`,
            ],
        };
    }

    const expectedCols = headerCols.length;

    for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]);
        if (cols.length !== expectedCols) {
            errors.push(`Línea ${i + 1}: se esperaban ${expectedCols} columnas, se encontraron ${cols.length}.`);
            continue;
        }

        const get = (key: HeaderKey): string => {
            const idx = colIndex[key];
            return idx === undefined ? "" : cleanCell(cols[idx]);
        };

        const rif    = get("rif");
        const nombre = get("nombre");

        if (!rif)    { errors.push(`Línea ${i + 1}: RIF vacío.`);    continue; }
        if (!nombre) { errors.push(`Línea ${i + 1}: nombre vacío.`); continue; }

        // Optional fields with enum validation.
        let tipoContribuyente: TaxpayerType | undefined;
        const tipoRaw = get("tipo_contribuyente");
        if (tipoRaw) {
            const lower = tipoRaw.toLowerCase();
            if (lower === "ordinario" || lower === "especial") {
                tipoContribuyente = lower;
            } else {
                errors.push(`Línea ${i + 1}: tipo_contribuyente inválido ("${tipoRaw}"). Use "ordinario" o "especial".`);
                continue;
            }
        }

        let sector: BusinessSector | undefined;
        const sectorRaw = get("sector");
        if (sectorRaw) {
            const lower = sectorRaw.toLowerCase();
            if ((BUSINESS_SECTORS as readonly string[]).includes(lower)) {
                sector = lower as BusinessSector;
            } else {
                errors.push(
                    `Línea ${i + 1}: sector inválido ("${sectorRaw}"). Valores permitidos: ${BUSINESS_SECTORS.join(", ")}.`,
                );
                continue;
            }
        }

        const telefono  = get("telefono")  || undefined;
        const correo    = get("correo")    || undefined;
        const direccion = get("direccion") || undefined;
        const logoUrl   = get("logo_url")  || undefined;

        companies.push({
            rif: rif.toUpperCase(),
            nombre,
            tipoContribuyente,
            telefono,
            correo,
            direccion,
            sector,
            logoUrl,
        });
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

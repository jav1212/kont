import { Employee } from "@/src/modules/payroll/backend/domain/employee";

const HEADERS = ["cedula", "nombre", "cargo", "salario_mensual", "moneda", "estado", "fecha_ingreso"] as const;

function csvCell(value: string | number | null | undefined): string {
    const s = String(value ?? "");
    return `"${s.replace(/"/g, '""')}"`;
}

// ── Export ────────────────────────────────────────────────────────────────────

export function employeesToCsv(employees: Employee[]): string {
    const header = HEADERS.map(csvCell).join(",");
    const rows   = employees.map((e) =>
        [
            csvCell(e.cedula),
            csvCell(e.nombre),
            csvCell(e.cargo),
            csvCell(e.salarioMensual),
            csvCell(e.moneda ?? "VES"),
            csvCell(e.estado),
            csvCell(e.fechaIngreso ?? ""),
        ].join(",")
    );
    return [header, ...rows].join("\r\n");
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

// ── Import ────────────────────────────────────────────────────────────────────

export interface CsvParseResult {
    employees: Omit<Employee, "id" | "companyId">[];
    errors:    string[];
}

export function parseCsv(raw: string): CsvParseResult {
    const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines      = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
    const errors: string[]                                    = [];
    const employees: Omit<Employee, "id" | "companyId">[]    = [];

    if (lines.length < 2) return { employees: [], errors: ["El CSV está vacío o no tiene datos."] };

    // Accept both old format (5 cols) and new format (7 cols)
    const headerCols   = splitCsvLine(lines[0]).map((h) =>
        h.toLowerCase().replace(/\s/g, "").replace(/^"|"$/g, "").replace(/""/g, "")
    );
    const isNewFormat  = headerCols.includes("moneda");
    const isOldFormat  = headerCols.join(",") === "cedula,nombre,cargo,salario_mensual_ves,estado";
    const isNewFull    = headerCols.join(",") === HEADERS.join(",");

    if (!isOldFormat && !isNewFull) {
        errors.push(`Encabezado inválido. Se esperaba: ${HEADERS.join(",")}`);
        return { employees: [], errors };
    }

    for (let i = 1; i < lines.length; i++) {
        let cols = splitCsvLine(lines[i]);
        if (cols.length === 1) {
            const inner = cols[0].replace(/^"|"$/g, "").replace(/""/g, '"');
            const retry = splitCsvLine(inner);
            if (retry.length >= 5) cols = retry;
        }

        const clean = cols.map((c) => c.trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim());

        let cedula: string, nombre: string, cargo: string, salarioRaw: string,
            monedaRaw: string, estadoRaw: string, fechaIngresoRaw: string;

        if (isOldFormat) {
            [cedula, nombre, cargo, salarioRaw, estadoRaw] = clean;
            monedaRaw = "VES"; fechaIngresoRaw = "";
        } else {
            [cedula, nombre, cargo, salarioRaw, monedaRaw, estadoRaw, fechaIngresoRaw] = clean;
        }

        if (!cedula) { errors.push(`Línea ${i + 1}: cédula vacía.`); continue; }
        if (!nombre) { errors.push(`Línea ${i + 1}: nombre vacío.`); continue; }

        const salario = parseFloat(salarioRaw!);
        if (isNaN(salario) || salario <= 0) {
            errors.push(`Línea ${i + 1}: salario inválido "${salarioRaw}".`); continue;
        }

        const moneda = (monedaRaw ?? "VES").toUpperCase();
        if (!["VES", "USD"].includes(moneda)) {
            errors.push(`Línea ${i + 1}: moneda inválida "${monedaRaw}". Usa VES o USD.`); continue;
        }

        const estado = (estadoRaw ?? "").toLowerCase();
        if (!["activo", "inactivo", "vacacion"].includes(estado)) {
            errors.push(`Línea ${i + 1}: estado inválido "${estadoRaw}". Usa activo, inactivo o vacacion.`); continue;
        }

        const fechaIngreso = fechaIngresoRaw?.trim()
            ? /^\d{4}-\d{2}-\d{2}$/.test(fechaIngresoRaw.trim())
                ? fechaIngresoRaw.trim()
                : null
            : null;

        employees.push({
            cedula,
            nombre:       nombre.toUpperCase(),
            cargo:        cargo.toUpperCase(),
            salarioMensual: salario,
            moneda:       moneda as "VES" | "USD",
            estado:       estado as Employee["estado"],
            fechaIngreso,
        });
    }

    return { employees, errors };
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

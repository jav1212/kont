// src/frontend/utils/employee-csv.ts
//
// Utilidad para exportar e importar empleados en formato CSV.
//
// Formato del CSV:
//   cedula,nombre,cargo,salario_mensual_usd,estado
//   12345678,Juan Pérez,AUXILIAR,130,activo

import { Employee } from "../employee/hooks/use-employee";



const HEADERS = ["cedula", "nombre", "cargo", "salario_mensual_usd", "estado"] as const;

// ── Export ────────────────────────────────────────────────────────────────────

export function employeesToCsv(employees: Employee[]): string {
    const rows = employees.map((e) =>
        [
            e.cedula,
            `"${e.nombre.replace(/"/g, '""')}"`,
            `"${e.cargo.replace(/"/g, '""')}"`,
            e.salarioMensual,
            e.estado,
        ].join(",")
    );
    return [HEADERS.join(","), ...rows].join("\n");
}

export function downloadCsv(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
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
    const lines  = raw.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    const errors: string[] = [];
    const employees: Omit<Employee, "id" | "companyId">[] = [];

    if (lines.length < 2) {
        return { employees: [], errors: ["El CSV está vacío o no tiene datos."] };
    }

    // Validate header
    const header = lines[0].toLowerCase().replace(/\s/g, "");
    const expectedHeader = HEADERS.join(",");
    if (header !== expectedHeader) {
        errors.push(`Encabezado inválido. Se esperaba: ${expectedHeader}`);
        return { employees: [], errors };
    }

    for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]);

        if (cols.length !== HEADERS.length) {
            errors.push(`Línea ${i + 1}: se esperaban ${HEADERS.length} columnas, se encontraron ${cols.length}.`);
            continue;
        }

        const [cedula, nombre, cargo, salarioRaw, estadoRaw] = cols.map((c) => c.trim().replace(/^"|"$/g, ""));

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
            nombre:         nombre.toUpperCase(),
            cargo:          cargo.toUpperCase(),
            salarioMensual: salario,
            estado:         estado as Employee["estado"],
        });
    }

    return { employees, errors };
}

// Handles quoted fields with commas inside
function splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
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
import * as XLSX from "xlsx";

export interface PurchaseBookRow {
    sourceRow: number;
    operation: string;
    date: string;
    supplierRif: string;
    supplierName: string;
    documentNumber: string;
    controlNumber: string;
    total: number;
    exempt: number;
    taxableBase: number;
    vatRate: number;
    vatAmount: number;
    retention: number;
    documentType: "factura" | "nota_credito" | "nota_debito";
    period: string;
    warnings: string[];
}

export interface PurchaseBookParseResult {
    fileName: string;
    companyRif: string;
    period: string;
    rows: PurchaseBookRow[];
    errors: string[];
}

const numberValue = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? "").trim();
    if (!raw) return 0;
    const normalized = raw.includes(",") && raw.includes(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const textValue = (value: unknown): string => String(value ?? "").trim();

function excelDate(value: unknown): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, "0");
        const d = String(value.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
    const raw = textValue(value);
    const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    if (/^\d+(\.\d+)?$/.test(raw)) {
        const date = XLSX.SSF.parse_date_code(Number(raw));
        if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
    return raw;
}

function parsePeriod(value: string): string {
    const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})\s+al\s+(\d{2})\/(\d{2})\/(\d{4})/);
    return match ? `${match[6]}-${match[5]}` : "";
}

function documentType(value: string): PurchaseBookRow["documentType"] {
    const normalized = value.toLowerCase();
    if (normalized.includes("crï¿½dito") || normalized.includes("credito")) return "nota_credito";
    if (normalized.includes("dï¿½bito") || normalized.includes("debito")) return "nota_debito";
    return "factura";
}

export async function parsePurchaseBookExcel(file: File): Promise<PurchaseBookParseResult> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true, dense: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { fileName: file.name, companyRif: "", period: "", rows: [], errors: ["El archivo no contiene hojas."] };

    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const metadata = matrix.slice(0, 8).flat().map(textValue).join(" ");
    const companyRif = (metadata.match(/RIF\s*([JGVEP]-?\s*\d{8,12})/i)?.[1] ?? "").replace(/\s/g, "");
    const period = parsePeriod(metadata);
    const rows: PurchaseBookRow[] = [];
    const errors: string[] = [];

    // SENIAT XLS export: row 8 is the header, rows 9+ are operations.
    for (let index = 8; index < matrix.length; index += 1) {
        const row = matrix[index] ?? [];
        const operation = textValue(row[0]);
        if (!operation || !/^\d+$/.test(operation)) continue;

        const date = excelDate(row[1]);
        const total = numberValue(row[22]);
        const exempt = numberValue(row[24]) + numberValue(row[25]);
        const taxableBase = numberValue(row[27]);
        const vatAmount = numberValue(row[29]);
        const currentPeriod = date.slice(0, 7);
        const warnings: string[] = [];
        if (!date) warnings.push("Fecha faltante");
        if (!textValue(row[11]) && !textValue(row[12])) warnings.push("N\u00FAmero de documento o control faltante");
        if (!textValue(row[2])) warnings.push("RIF del proveedor faltante");
        if (Math.abs(total - (exempt + taxableBase + vatAmount)) > 0.02) warnings.push("El total no cuadra con exentas + base + IVA");

        rows.push({
            sourceRow: index + 1,
            operation,
            date,
            supplierRif: textValue(row[2]),
            supplierName: textValue(row[3]),
            documentNumber: textValue(row[11]),
            controlNumber: textValue(row[12]),
            total,
            exempt,
            taxableBase,
            vatRate: taxableBase !== 0 ? Math.round(Math.abs(vatAmount / taxableBase) * 10000) / 100 : 0,
            vatAmount,
            retention: numberValue(row[30]),
            documentType: total < 0 ? "nota_credito" : documentType(textValue(row[15])),
            period: period || currentPeriod,
            warnings,
        });
    }

    if (rows.length === 0) errors.push("No se encontraron operaciones debajo de la fila de encabezados.");
    if (!companyRif) errors.push("No se pudo detectar el RIF de la empresa en el encabezado.");
    return { fileName: file.name, companyRif, period, rows, errors };
}

export function normalizeRif(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

import {
    addDecimal, compareDecimal, divideDecimal, exactDecimal, multiplyDecimal,
    quantizeDecimal, subtractDecimal,
} from "@kontave/monetary";
import type { MeasureUnit, SalePricing, ValuationMethod, VatType } from "@/src/modules/inventory/backend/domain/product";
import type { VatRate } from "./purchase-invoice";

/** Selected source columns; monetary values are exact decimal text in canonical notation. */
export interface PurchaseCsvHeader {
    sourceRow: number;
    date: string;
    supplierName: string;
    supplierRif: string;
    documentNumber: string;
    controlNumber: string;
    reference: string;
    supplierExternalId: string;
    currency: string;
    totalBs: string;
    documentType: string;
    exchangeRate: string;
}

/** Source values stay independent from catalog values and posted stock. */
export interface PurchaseCsvItem {
    sourceRow: number;
    quantity: string;
    code: string;
    description: string;
    unitCostBs: string;
    subtotalBs: string;
    fullCostBs: string;
    currencyCost: string;
    currencySubtotal: string;
    currencyFullCost: string;
    salePrice: string;
    markupPercent: string;
    currency: string;
    exchangeRate: string;
    purchaseVatCode: string;
    date: string;
    documentNumber: string;
    supplierExternalId: string;
    sourceStock: string;
    saleVatCode: string;
}

export interface PurchaseCsvConfig {
    costsIncludeVat: boolean;
    vatMappings: Record<string, VatRate>;
    reviewed: boolean;
}

export interface PurchaseCsvProductResolution {
    productId?: string;
    create?: {
        name: string;
        measureUnit: MeasureUnit;
        valuationMethod: ValuationMethod;
        vatType: VatType;
        salePricing?: SalePricing;
    };
}

export interface PurchaseCsvImportRow {
    header: PurchaseCsvHeader;
    items: PurchaseCsvItem[];
    selected: boolean;
    supplierId?: string;
    productResolutions: Record<string, PurchaseCsvProductResolution>;
    acceptDifference: boolean;
    /** Read-only execution metadata returned by persistence, never trusted on input. */
    invoiceId?: string;
    invoiceStatus?: "borrador" | "confirmada";
    importLineId?: string;
}

export interface PurchaseCsvCalculatedItem {
    source: PurchaseCsvItem;
    quantity: string;
    unitCost: string;
    totalCost: string;
    vatRate: VatRate;
    currency: string;
    currencyCost: string;
    exchangeRate: string;
}

export interface PurchaseCsvCalculation {
    items: PurchaseCsvCalculatedItem[];
    subtotal: string;
    vatAmount: string;
    total: string;
    /** Calculated total minus the original header total, in Bs. */
    difference: string;
    errors: string[];
    warnings: string[];
    complete: boolean;
}

export interface PurchaseCsvParseResult<T> {
    companyRif: string;
    rows: T[];
    errors: string[];
}

const HEADER_COLUMNS = ["Fecha", "Proveedor", "RIF", "Documento", "Control", "Referencia", "ID Pro", "Moneda", "Total Bs.", "Tipo Doc", "Tasa Cambio Bs."];
const ITEM_COLUMNS = ["Cantidad", "Codigo", "Detalle", "Costo Bs.", "Sub Total Bs.", "Costo Full Bs.", "Costo *", "Sub Total *", "Costo Full *", "Precio 1", "Porc 1 %", "Moneda", "Cambio", "IVA Compra", "Fecha", "Factura", "ID Proveedor", "Existencia", "IVA Venta"];
const ZERO = exactDecimal("0");
const VAT: Record<VatRate, string> = { exenta: "0", reducida_8: "8", general_16: "16" };
const normalizeColumn = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toLowerCase();
const sameDecimal = (a: string, b: string) => compareDecimal(exactDecimal(a), exactDecimal(b)) === 0;

/**
 * Applies the importer's standard equivalences to recognized source labels.
 * @param code - Purchase or sale tax label, with optional surrounding whitespace.
 * @returns 16% for IVA and numbered IVA labels, zero for EXENTO, or undefined for other labels.
 */
export function getPurchaseCsvVatDefault(code: string): VatRate | undefined {
    if (/^IVA\d*$/i.test(code.trim())) return "general_16";
    if (/^EXENTO$/i.test(code.trim())) return "exenta";
    return undefined;
}

/**
 * Resolves standard tax labels without a separate review acknowledgement.
 * @param config - Saved cost interpretation and manually assigned nonstandard tax labels.
 * @param items - Source details whose purchase and sale labels must be resolved.
 * @returns A new configuration; unknown labels still require an explicit valid mapping.
 */
export function normalizePurchaseCsvConfig(config: PurchaseCsvConfig, items: readonly PurchaseCsvItem[]): PurchaseCsvConfig {
    const vatMappings = { ...config.vatMappings };
    const codes = items.flatMap(item => [item.purchaseVatCode, item.saleVatCode]);
    for (const code of new Set([...Object.keys(vatMappings), ...codes])) {
        const mapping = getPurchaseCsvVatDefault(code);
        if (mapping) vatMappings[code] = mapping;
    }
    return { ...config, vatMappings, reviewed: codes.every(code => Object.prototype.hasOwnProperty.call(VAT, vatMappings[code] ?? "")) };
}

/**
 * Refreshes staged defaults and automatically accepts the calculated total for pending purchases.
 * @param config - Previously stored or submitted import configuration.
 * @param rows - Staged purchases, including server-provided execution metadata when loading.
 * @returns Normalized configuration and rows whose pending calculated totals are accepted; confirmed audit rows are retained unchanged.
 */
export function normalizePurchaseCsvImport(config: PurchaseCsvConfig, rows: PurchaseCsvImportRow[]): { config: PurchaseCsvConfig; rows: PurchaseCsvImportRow[] } {
    const normalized = normalizePurchaseCsvConfig(config, rows.flatMap(row => row.items));
    return {
        config: normalized,
        rows: rows.map(row => row.invoiceStatus === "confirmada" ? row : { ...row, acceptDifference: true }),
    };
}

/**
 * Normalizes a company or supplier RIF for identity comparisons only.
 * @param value - RIF in compact or punctuated notation.
 * @returns Uppercase alphanumeric identity; the displayed source value is retained separately.
 */
export function normalizePurchaseRif(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Parses a Venezuelan numeric cell without floating-point conversion.
 * @param value - Number using comma decimals and optional dot thousands grouping.
 * @returns Canonical exact decimal text.
 * @throws {Error} When the cell is blank, malformed or exceeds supported numeric bounds.
 */
export function parsePurchaseDecimal(value: string): string {
    const trimmed = value.trim();
    if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(trimmed)) {
        throw new Error(`Número venezolano inválido: ${value || "(vacío)"}`);
    }
    return boundedDecimal(trimmed.replace(/\./g, "").replace(",", "."));
}

function boundedDecimal(value: string): string {
    if (typeof value !== "string" || !/^[+-]?\d{1,12}(?:\.\d{1,12})?$/.test(value)) {
        throw new Error("Importe inválido o fuera de los límites admitidos (12 enteros y 12 decimales)");
    }
    return exactDecimal(value);
}

function dateCell(value: string): string {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    if (!match) throw new Error(`Fecha inválida: ${value}`);
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    if (!validDate(iso)) throw new Error(`Fecha inválida: ${value}`);
    return iso;
}

function validDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function currencyCell(value: string): string {
    const code = value.trim().toUpperCase();
    if (["BS.", "BS", "VES", "B"].includes(code)) return "VES";
    if (["USD", "D"].includes(code)) return "USD";
    if (!/^[A-Z]{3}$/.test(code)) throw new Error(`Moneda inválida: ${value}`);
    return code;
}

// A bounded CSV tokenizer handles quoted delimiters/newlines and escaped quotes.
// Positional column selection avoids duplicate irrelevant headers overwriting data.
function tokenize(text: string): { cells: string[]; line: number }[] {
    if (text.length > 5_000_000) throw new Error("El archivo supera el límite de 5 MB");
    const input = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const rows: { cells: string[]; line: number }[] = [];
    let cells: string[] = [], value = "", quoted = false, closed = false, line = 1, startLine = 1;
    const pushCell = () => { cells.push(value); value = ""; closed = false; };
    for (let i = 0; i < input.length; i++) {
        const c = input[i];
        if (quoted) {
            if (c === '"' && input[i + 1] === '"') { value += '"'; i++; }
            else if (c === '"') { quoted = false; closed = true; }
            else { value += c; if (c === "\n") line++; }
        } else if (c === ";") pushCell();
        else if (c === "\n") {
            pushCell(); rows.push({ cells, line: startLine }); cells = []; line++; startLine = line;
            if (rows.length > 10_000) throw new Error("El archivo supera el límite de 10.000 filas");
        } else if (c === '"') {
            if (value.trim() || closed) throw new Error(`Comillas inválidas en fila ${line}`);
            value = ""; quoted = true;
        } else {
            if (closed && c.trim()) throw new Error(`Contenido fuera de comillas en fila ${line}`);
            value += c;
        }
    }
    if (quoted) throw new Error("El archivo contiene comillas sin cerrar");
    if (value || cells.length) { pushCell(); rows.push({ cells, line: startLine }); }
    return rows;
}

function parseReport<T>(text: string, columns: string[], read: (cell: (name: string) => string, line: number) => T): PurchaseCsvParseResult<T> {
    const result: PurchaseCsvParseResult<T> = { companyRif: "", rows: [], errors: [] };
    try {
        const records = tokenize(text);
        const index = records.findIndex(({ cells }) => normalizeColumn(cells[0] ?? "") === normalizeColumn(columns[0]) && cells.some(c => normalizeColumn(c) === normalizeColumn(columns[1])));
        if (index < 0) throw new Error(`No se encontró la cabecera ${columns[0]};${columns[1]}`);
        const headings = records[index].cells.map(normalizeColumn);
        const positions = columns.map(column => {
            const positions = headings.flatMap((heading, i) => heading === normalizeColumn(column) ? [i] : []);
            if (positions.length !== 1) throw new Error(`Columna requerida ausente o repetida: ${column}`);
            return positions[0];
        });
        for (const record of records.slice(0, index)) {
            const first = record.cells[0]?.trim() ?? "";
            if (/^[VEJPGvejpg]-?\d{8}-?\d$/.test(first)) result.companyRif = first;
        }
        for (const record of records.slice(index + 1)) {
            if (record.cells.every(cell => !cell.trim())) continue;
            if (/^totales(?:\s|$)/i.test(record.cells[0]?.trim() ?? "")) continue;
            try {
                const values = new Map(columns.map((column, i) => [column, (record.cells[positions[i]] ?? "").trim()]));
                result.rows.push(read(name => values.get(name) ?? "", record.line));
            } catch (error) {
                result.errors.push(`Fila ${record.line}: ${error instanceof Error ? error.message : "Datos inválidos"}`);
            }
        }
        if (!result.rows.length && !result.errors.length) result.errors.push("El archivo no contiene registros");
    } catch (error) { result.errors.push(error instanceof Error ? error.message : "No se pudo leer el CSV"); }
    return result;
}

/**
 * Reads the selected purchase header columns, ignoring report decorations and totals.
 * @param text - UTF-8 decoded semicolon report, optionally with BOM.
 * @returns Headers with exact amounts, source row numbers and actionable parse errors.
 */
export function parsePurchaseHeaders(text: string): PurchaseCsvParseResult<PurchaseCsvHeader> {
    return parseReport(text, HEADER_COLUMNS, (c, sourceRow) => ({
        sourceRow, date: dateCell(c("Fecha")), supplierName: c("Proveedor"), supplierRif: c("RIF"),
        documentNumber: c("Documento"), controlNumber: c("Control"), reference: c("Referencia"),
        supplierExternalId: c("ID Pro"), currency: currencyCell(c("Moneda")), totalBs: parsePurchaseDecimal(c("Total Bs.")),
        documentType: c("Tipo Doc"), exchangeRate: parsePurchaseDecimal(c("Tasa Cambio Bs.")),
    }));
}

/**
 * Reads only the selected product-detail columns without changing the catalog.
 * @param text - UTF-8 decoded semicolon report, optionally with BOM.
 * @returns Source items and errors; malformed rows must not be silently imported.
 */
export function parsePurchaseItems(text: string): PurchaseCsvParseResult<PurchaseCsvItem> {
    return parseReport(text, ITEM_COLUMNS, (c, sourceRow) => ({
        sourceRow, quantity: parsePurchaseDecimal(c("Cantidad")), code: c("Codigo"), description: c("Detalle"),
        unitCostBs: parsePurchaseDecimal(c("Costo Bs.")), subtotalBs: parsePurchaseDecimal(c("Sub Total Bs.")),
        fullCostBs: parsePurchaseDecimal(c("Costo Full Bs.")), currencyCost: parsePurchaseDecimal(c("Costo *")),
        currencySubtotal: parsePurchaseDecimal(c("Sub Total *")), currencyFullCost: parsePurchaseDecimal(c("Costo Full *")),
        salePrice: parsePurchaseDecimal(c("Precio 1")), markupPercent: parsePurchaseDecimal(c("Porc 1 %")),
        currency: currencyCell(c("Moneda")), exchangeRate: parsePurchaseDecimal(c("Cambio")), purchaseVatCode: c("IVA Compra").toUpperCase(),
        date: dateCell(c("Fecha")), documentNumber: c("Factura"), supplierExternalId: c("ID Proveedor"),
        sourceStock: parsePurchaseDecimal(c("Existencia")), saleVatCode: c("IVA Venta").toUpperCase(),
    }));
}

/**
 * Associates details using all three source identifiers, never by filename or document alone.
 * @param headers - Purchase headers from the active batch.
 * @param items - Details from one or more files belonging to the same company.
 * @returns Assignments keyed by header source row and errors for ambiguous/unmatched items.
 */
export function associatePurchaseItems(headers: PurchaseCsvHeader[], items: PurchaseCsvItem[]): { assignments: Record<number, PurchaseCsvItem[]>; errors: string[] } {
    const assignments: Record<number, PurchaseCsvItem[]> = {};
    const errors: string[] = [];
    for (const item of items) {
        const matches = headers.filter(h => matchesHeader(h, item));
        if (matches.length !== 1) errors.push(`Fila ${item.sourceRow}, factura ${item.documentNumber}: ${matches.length ? "asociación ambigua" : "no corresponde a ninguna compra"}`);
        else (assignments[matches[0].sourceRow] ??= []).push(item);
    }
    return { assignments, errors };
}

function matchesHeader(header: PurchaseCsvHeader, item: PurchaseCsvItem): boolean {
    return !!header.documentNumber && !!header.supplierExternalId && header.documentNumber === item.documentNumber && header.supplierExternalId === item.supplierExternalId && header.date === item.date;
}

/**
 * Revalidates source amounts and computes the same canonical Bs bases used for posting.
 * @param row - Header, source details and reviewed catalog resolutions.
 * @param config - Cost interpretation and nonstandard tax mappings; IVA and EXENTO use standard import defaults.
 * @returns Exact serialized fiscal totals, blocking issues and informational differences.
 * @remarks Costs are quantized to 4 decimal places for PostgreSQL persistence, subtotal is
 * rounded to cents, and aggregate IVA is truncated to cents to match the existing purchase book.
 * Differences from the original total remain visible as reference for the automatically accepted calculated total.
 */
export function calculatePurchaseCsvRow(row: PurchaseCsvImportRow, config: PurchaseCsvConfig): PurchaseCsvCalculation {
    const result: PurchaseCsvCalculation = { items: [], subtotal: "0", vatAmount: "0", total: "0", difference: "0", errors: [], warnings: [], complete: false };
    try {
        config = normalizePurchaseCsvConfig(config, row.items);
        const header = row.header;
        if (!validDate(header.date)) result.errors.push("Fecha de compra inválida");
        if (!header.supplierName.trim() || !/^[VEJPG]\d{9}$/.test(normalizePurchaseRif(header.supplierRif))) result.errors.push("Proveedor o RIF inválido");
        if (!header.documentNumber.trim() || !header.supplierExternalId.trim()) result.errors.push("Documento e ID del proveedor son requeridos");
        if (normalizeColumn(header.documentType) !== "factura") result.errors.push("Solo se admite Tipo Doc Factura en este formato");
        const expected = exactDecimal(boundedDecimal(header.totalBs));
        if (compareDecimal(expected, ZERO) < 0) result.errors.push("El total de compra no puede ser negativo");
        const headerRate = exactDecimal(boundedDecimal(header.exchangeRate));
        if ((headerRate.split(".")[1]?.length ?? 0) > 4 || compareDecimal(headerRate, exactDecimal("99999999.9999")) > 0) result.errors.push("La tasa de cabecera admite 8 enteros y 4 decimales");
        currencyCell(header.currency);
        if (header.currency !== "VES" && compareDecimal(headerRate, ZERO) <= 0) result.errors.push("La tasa de cambio debe ser positiva");
        let subtotal = ZERO, vat = ZERO;
        for (const source of row.items) {
            try {
                if (!matchesHeader(header, source)) throw new Error("El detalle no corresponde a documento, proveedor y fecha de esta compra");
                if (!source.code.trim() || !source.description.trim()) throw new Error("Código y detalle son requeridos");
                const qty = exactDecimal(boundedDecimal(source.quantity));
                const cost = exactDecimal(boundedDecimal(source.unitCostBs));
                const declaredSubtotal = exactDecimal(boundedDecimal(source.subtotalBs));
                const rate = exactDecimal(boundedDecimal(source.exchangeRate));
                for (const value of [source.fullCostBs, source.currencyCost, source.currencySubtotal, source.currencyFullCost, source.salePrice, source.markupPercent, source.sourceStock]) boundedDecimal(value);
                if (compareDecimal(qty, ZERO) <= 0 || compareDecimal(cost, ZERO) < 0) throw new Error("Cantidad debe ser positiva y costo no negativo");
                if (!sameDecimal(quantizeDecimal(multiplyDecimal(qty, cost), { scale: 2, mode: "half_up" }), quantizeDecimal(declaredSubtotal, { scale: 2, mode: "half_up" }))) throw new Error("Cantidad × Costo Bs. no coincide con Sub Total Bs.; revisa el archivo");
                const currency = currencyCell(source.currency);
                if (currency !== "VES" && compareDecimal(rate, ZERO) <= 0) throw new Error("La tasa de cambio debe ser positiva");
                const vatRate = config.vatMappings[source.purchaseVatCode];
                if (!Object.prototype.hasOwnProperty.call(VAT, vatRate ?? "")) throw new Error(`Asigna IVA Compra ${source.purchaseVatCode}`);
                if (!Object.prototype.hasOwnProperty.call(VAT, config.vatMappings[source.saleVatCode] ?? "")) throw new Error(`Asigna IVA Venta ${source.saleVatCode}`);
                const resolution = row.productResolutions[source.code];
                if (!resolution || (!resolution.productId && !resolution.create)) throw new Error(`Resuelve el producto ${source.code}`);
                if (resolution.productId && resolution.create) throw new Error("Selecciona un producto existente o uno nuevo, no ambos");
                if (resolution.create && !resolution.create.name.trim()) throw new Error("El producto nuevo necesita nombre");
                if (resolution.create && config.vatMappings[source.saleVatCode] === "reducida_8") throw new Error("El catálogo actual no admite IVA de venta 8% para productos nuevos; vincula un producto existente antes de importar");
                const percent = exactDecimal(VAT[vatRate]);
                const divisor = addDecimal(exactDecimal("1"), divideDecimal(percent, exactDecimal("100")));
                if ((qty.split(".")[1]?.length ?? 0) > 4 || (rate.split(".")[1]?.length ?? 0) > 4) throw new Error("Cantidad y tasa admiten hasta 4 decimales");
                if (compareDecimal(qty, exactDecimal("9999999999.9999")) > 0 || compareDecimal(rate, exactDecimal("99999999.9999")) > 0) throw new Error("Cantidad o tasa fuera del límite admitido");
                const netCost = quantizeDecimal(config.costsIncludeVat ? divideDecimal(cost, divisor) : cost, { scale: 4, mode: "half_up" });
                if (compareDecimal(netCost, exactDecimal("9999999999.9999")) > 0) throw new Error("Costo fuera del límite admitido");
                const netTotal = multiplyDecimal(qty, netCost);
                const originalCost = exactDecimal(source.currencyCost);
                const currencyCost = quantizeDecimal(config.costsIncludeVat ? divideDecimal(originalCost, divisor) : originalCost, { scale: 4, mode: "half_up" });
                if (compareDecimal(currencyCost, ZERO) < 0 || compareDecimal(currencyCost, exactDecimal("99999999.9999")) > 0) throw new Error("Costo en moneda fuera del límite admitido");
                if (compareDecimal(netTotal, exactDecimal("999999999999.99")) > 0) throw new Error("Subtotal del renglón fuera del límite admitido");
                subtotal = addDecimal(subtotal, netTotal);
                vat = addDecimal(vat, divideDecimal(multiplyDecimal(netTotal, percent), exactDecimal("100")));
                result.items.push({ source, quantity: qty, unitCost: netCost, totalCost: netTotal, vatRate, currency, currencyCost, exchangeRate: rate });
            } catch (error) { result.errors.push(`${source.code || "Producto"} (fila ${source.sourceRow}): ${error instanceof Error ? error.message : "Datos inválidos"}`); }
        }
        result.subtotal = quantizeDecimal(subtotal, { scale: 2, mode: "half_up" });
        result.vatAmount = quantizeDecimal(vat, { scale: 2, mode: "down" });
        result.total = addDecimal(exactDecimal(result.subtotal), exactDecimal(result.vatAmount));
        if (compareDecimal(exactDecimal(result.total), exactDecimal("999999999999.99")) > 0) result.errors.push("Total fuera del límite admitido");
        result.difference = subtractDecimal(exactDecimal(result.total), expected);
        if (row.items.length && result.difference !== "0") result.warnings.push(`El total calculado difiere del original en Bs. ${result.difference}`);
        if (!row.items.length) result.warnings.push("Pendiente de archivo de productos; se guardará como borrador");
        result.complete = row.items.length > 0 && result.items.length === row.items.length && result.errors.length === 0;
    } catch (error) { result.errors.push(error instanceof Error ? error.message : "Datos de compra inválidos"); }
    return result;
}

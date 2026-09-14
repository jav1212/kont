import assert from "node:assert/strict";
import test from "node:test";
import {
    associatePurchaseItems, calculatePurchaseCsvRow, normalizePurchaseCsvImport, normalizePurchaseRif,
    normalizePurchaseSupplierName, parseCompletePurchaseCsv, parsePurchaseDecimal, parsePurchaseHeaders, parsePurchaseItems,
    type PurchaseCsvConfig, type PurchaseCsvImportRow, type PurchaseCsvItem,
} from "./purchase-csv-import";

const headerColumns = "Fecha;Proveedor;RIF;Documento;Control;Referencia;ID Pro;Moneda;Total Bs.;Tipo Doc;Tasa Cambio Bs.;Ignorada";
const itemColumns = "Cantidad;Codigo;Detalle;Costo Bs.;Sub Total Bs.;Costo Full Bs.;Costo *;Sub Total *;Costo Full *;Precio 1 ;Porc 1 % ;Moneda;Cambio;IVA Compra;Fecha;Factura;ID Proveedor;Existencia;IVA Venta;Desc %+;Desc %+";
const report = `\uFEFF"Empresa de prueba"\nJ123456789\n\n${headerColumns}\n05/09/2026;Proveedor;J987654321;038501;00-044774;153;151;USD;134.335,02;Factura;804,81;no guardar\nTotales\t134.335,02\n`;
const config: PurchaseCsvConfig = { costsIncludeVat: false, reviewed: true, vatMappings: { IVA1: "general_16", EXENTO: "exenta" } };

function source(overrides: Partial<PurchaseCsvItem> = {}): PurchaseCsvItem {
    return {
        sourceRow: 9, quantity: "3", code: "001", description: "Producto prueba",
        unitCostBs: "1665.96", subtotalBs: "4997.88", fullCostBs: "1665.96",
        currencyCost: "2.07", currencySubtotal: "6.21", currencyFullCost: "2.07",
        salePrice: "3.84", markupPercent: "60", currency: "USD", exchangeRate: "804.81",
        purchaseVatCode: "IVA1", date: "2026-09-05", documentNumber: "038501",
        supplierExternalId: "151", sourceStock: "3", saleVatCode: "IVA1", ...overrides,
    };
}

function row(items: PurchaseCsvItem[] = [source()]): PurchaseCsvImportRow {
    return { header: parsePurchaseHeaders(report).rows[0], items, selected: true, acceptDifference: false,
        productResolutions: Object.fromEntries(items.map(item => [item.code, { productId: `product-${item.code}` }])) };
}

test("report headers preserve identifiers, four-decimal rates and only selected columns", () => {
    const parsed = parsePurchaseHeaders(report.replace("804,81", "801,1752"));
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].documentNumber, "038501");
    assert.equal(parsed.rows[0].totalBs, "134335.02");
    assert.equal(parsed.rows[0].exchangeRate, "801.1752");
    assert.equal(Object.keys(parsed.rows[0]).length, 12);
    assert.equal(normalizePurchaseRif("J-12345678-9"), parsed.companyRif);
});

test("quoted details, duplicate irrelevant columns and trimmed headings parse correctly", () => {
    const csv = `${itemColumns}\n3;0001;"Producto; con ""comillas""\ny salto";1.665,96;4.997,88;1.665,96;2,07;6,21;2,07;3,84;60,00;USD;804,81;IVA1;05/09/2026;038501;151;3;IVA1;ignorar;ignorar\n`;
    const parsed = parsePurchaseItems(csv);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.rows[0].code, "0001");
    assert.equal(parsed.rows[0].description, 'Producto; con "comillas"\ny salto');
    assert.equal(Object.keys(parsed.rows[0]).length, 20);
});

test("complete purchase reports group lines and retain declared VES subtotals despite unit rounding", () => {
    const csv = `Empresa\nJ003634352\n\nDepartamento;Fecha Aplicación;Tipo Documento;Cantidad;Codigo;Detalle;Desc %;IVA Compra;Costo Bs.;Sub Total Bs.;Costo Full Bs.;Fecha;Documento;Proveedor;Unid. Derivadas;Tasa Cambio Bs.;S. Total Otra Moneda;% Costo Ind;% Costo Dir.;\nA;09/09/2026;Factura;12;0007;Producto;0;IVA1;1.358,50;16.301,95;1.361,37;08/09/2026;00123;Proveedor, C.A.;1;820,1018;19,92;0,00;0,00;\nA;09/09/2026;Factura;1;0008;Otro;0;IVA1;2,00;2,00;2,00;08/09/2026;00123;Proveedor C.A.;1;820,1018;0;0,00;0,00;\n`;
    const parsed = parseCompletePurchaseCsv(csv);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.companyRif, "J003634352");
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].header.sourceFormat, "complete");
    assert.equal(parsed.rows[0].header.documentNumber, "00123");
    assert.equal(parsed.rows[0].items[0].code, "0007");
    assert.equal(parsed.rows[0].header.totalBs, "16303.95");
    const result = calculatePurchaseCsvRow({ ...parsed.rows[0], productResolutions: { "0007": { productId: "p1" }, "0008": { productId: "p2" } } }, config);
    assert.equal(result.errors.length, 0);
    assert.equal(result.subtotal, "16303.95");
    assert.equal(normalizePurchaseSupplierName("Proveedor, C.A."), normalizePurchaseSupplierName("PROVEEDOR C A"));
    assert.notEqual(normalizePurchaseSupplierName("AB C"), normalizePurchaseSupplierName("A BC"));
});

test("complete reports reject conflicting invoice fields and negative authoritative subtotals", () => {
    const headings = "Departamento;Fecha Aplicación;Tipo Documento;Cantidad;Codigo;Detalle;IVA Compra;Costo Bs.;Sub Total Bs.;Costo Full Bs.;Fecha;Documento;Proveedor;Tasa Cambio Bs.;S. Total Otra Moneda;";
    const line = (date: string, type = "Factura", rate = "1", subtotal = "10") => `A;09/09/2026;${type};1;001;Producto;EXENTO;10;${subtotal};10;${date};001;Proveedor;${rate};0;`;
    assert.match(parseCompletePurchaseCsv(`${headings}\n${line("08/09/2026")}\n${line("09/09/2026")}`).errors.join(), /Fecha no coincide/);
    assert.match(parseCompletePurchaseCsv(`${headings}\n${line("08/09/2026")}\n${line("08/09/2026", "Nota de crédito")}`).errors.join(), /Tipo Documento no coincide/);
    assert.match(parseCompletePurchaseCsv(`${headings}\n${line("08/09/2026")}\n${line("08/09/2026", "Factura", "2")}`).errors.join(), /Tasa Cambio Bs. no coincide/);
    const negative = parseCompletePurchaseCsv(`${headings}\n${line("08/09/2026", "Factura", "1", "-10")}`).rows[0];
    const calculation = calculatePurchaseCsvRow({ ...negative, productResolutions: { "001": { productId: "product" } } }, config);
    assert.match(calculation.errors.join(), /Sub Total Bs. no puede ser negativo/);
});

test("malformed CSV, duplicated selected headers, impossible dates and missing cells are visible", () => {
    assert.match(parsePurchaseHeaders(`${report}\n"unfinished`).errors.join(), /comillas/);
    assert.match(parsePurchaseHeaders(report.replace("Ignorada", "Documento")).errors.join(), /repetida/);
    assert.match(parsePurchaseHeaders(report.replace("05/09/2026", "31/02/2026")).errors.join(), /Fecha inválida/);
    assert.match(parsePurchaseHeaders(report.replace("134.335,02", "")).errors.join(), /vacío/);
    for (const bad of ["1,234.56", "1.23", "1e3", "", "NaN"]) assert.throws(() => parsePurchaseDecimal(bad));
    assert.equal(parsePurchaseDecimal("1.234,56"), "1234.56");
});

test("association requires document, supplier external ID and date and rejects ambiguity", () => {
    const headers = parsePurchaseHeaders(report).rows;
    assert.equal(associatePurchaseItems(headers, [source()]).assignments[headers[0].sourceRow].length, 1);
    for (const item of [source({ supplierExternalId: "152" }), source({ date: "2026-09-06" }), source({ documentNumber: "38501" })]) {
        assert.equal(associatePurchaseItems(headers, [item]).errors.length, 1);
    }
    assert.match(associatePurchaseItems([...headers, { ...headers[0], sourceRow: 10 }], [source()]).errors[0], /ambigua/);
});

test("sample arithmetic uses Bs despite mixed currencies and rounded USD references", () => {
    const items = [source(), source({ code: "002", quantity: "6", unitCostBs: "5022.01", subtotalBs: "30132.06", purchaseVatCode: "EXENTO" }),
        source({ code: "003", quantity: "12", unitCostBs: "2663.92", subtotalBs: "31967.04", currency: "VES", purchaseVatCode: "EXENTO" }),
        source({ code: "004", quantity: "3", unitCostBs: "941.63", subtotalBs: "2824.89" }),
        source({ code: "005", quantity: "24", unitCostBs: "1722.29", subtotalBs: "41334.96", purchaseVatCode: "EXENTO" }),
        source({ code: "006", quantity: "12", unitCostBs: "1818.87", subtotalBs: "21826.44", purchaseVatCode: "EXENTO" })];
    const result = calculatePurchaseCsvRow(row(items), config);
    assert.deepEqual(result.errors, []);
    assert.equal(result.subtotal, "133083.27");
    assert.equal(result.vatAmount, "1251.64");
    assert.equal(result.total, "134334.91");
    assert.equal(result.difference, "-0.11");
    assert.equal(result.complete, true);
    assert.equal(result.items[0].unitCost, "1665.96");
});

test("IVA included costs round to DB precision before totals and preserve source", () => {
    const input = row([source({ quantity: "2", unitCostBs: "116", subtotalBs: "232", currencyCost: "1.16" })]);
    const result = calculatePurchaseCsvRow(input, { ...config, costsIncludeVat: true });
    assert.equal(result.items[0].unitCost, "100");
    assert.equal(result.items[0].currencyCost, "1");
    assert.equal(result.total, "232");
    assert.equal(result.items[0].source.unitCostBs, "116");
    const fractional = calculatePurchaseCsvRow(row([source({ quantity: "1", unitCostBs: "1", subtotalBs: "1" })]), { ...config, costsIncludeVat: true });
    assert.equal(fractional.items[0].unitCost, "0.8621");
    assert.equal(fractional.vatAmount, "0.13");
});

test("complete IVA-included lines aggregate at persisted four-decimal tax-base precision", () => {
    const input = row([
        source({ quantity: "11.4", unitCostBs: "4991.25", subtotalBs: "56900.25" }),
        source({ code: "002", quantity: "11.4", unitCostBs: "5487.9", subtotalBs: "62562.06" }),
    ]);
    input.header.sourceFormat = "complete";
    const result = calculatePurchaseCsvRow(input, { ...config, costsIncludeVat: true });
    assert.deepEqual(result.errors, []);
    assert.equal(result.items[0].totalCost, "49051.9397");
    assert.equal(result.items[1].totalCost, "53932.8103");
    assert.equal(result.subtotal, "102984.75");
    assert.equal(result.vatAmount, "16477.56");
    assert.equal(result.total, "119462.31");
});

test("all-USD imports still calculate from source Bs and truncate aggregate VAT exactly", () => {
    const input = row([source({ quantity: "1", unitCostBs: "0.29", subtotalBs: "0.29", currencyCost: "999" }), source({ code: "002", quantity: "1", unitCostBs: "0.29", subtotalBs: "0.29", currencyCost: "999" })]);
    const result = calculatePurchaseCsvRow(input, config);
    assert.equal(result.subtotal, "0.58");
    assert.equal(result.vatAmount, "0.09");
    assert.equal(result.total, "0.67");
    assert.equal(result.complete, true);
});

test("standard IVA and EXENTO calculate without mapping or a review acknowledgement", () => {
    for (const code of ["IVA", "IVA1", " iva2 "]) {
        const result = calculatePurchaseCsvRow(row([source({ purchaseVatCode: code, saleVatCode: " exento " })]), { ...config, reviewed: false, vatMappings: {} });
        assert.equal(result.complete, true);
        assert.equal(result.vatAmount, "799.66");
        assert.equal(result.items[0].vatRate, "general_16");
    }
    const result = calculatePurchaseCsvRow(row([source({ purchaseVatCode: "EXENTO" })]), { ...config, reviewed: false, vatMappings: {} });
    assert.equal(result.complete, true);
    assert.equal(result.vatAmount, "0");
});

test("pending imports accept calculated totals by default while confirmed audit rows stay unchanged", () => {
    const pending = { ...row(), acceptDifference: false };
    const confirmed = { ...row(), acceptDifference: false, invoiceStatus: "confirmada" as const };
    const oldConfig: PurchaseCsvConfig = { ...config, reviewed: false, vatMappings: { IVA1: "reducida_8", EXENTO: "exenta" } };
    const normalized = normalizePurchaseCsvImport(oldConfig, [pending, confirmed]);
    assert.equal(normalized.config.vatMappings.IVA1, "general_16");
    assert.equal(normalized.config.reviewed, true);
    assert.equal(normalized.rows[0].acceptDifference, true);
    assert.equal(normalized.rows[1].acceptDifference, false);
    assert.equal(normalized.rows[1], confirmed);
    assert.equal(pending.acceptDifference, false);
    assert.equal(oldConfig.vatMappings.IVA1, "reducida_8");
    assert.equal(normalizePurchaseCsvImport({ ...config, reviewed: false }, [pending]).rows[0].acceptDifference, true);
    assert.equal(normalized.rows[0].header.totalBs, "134335.02");
    assert.equal(pending.header.totalBs, "134335.02");
});

test("unknown tax codes still need a manual mapping, but no separate review acknowledgement", () => {
    const input = row([source({ purchaseVatCode: "IMPUESTO_X" })]);
    assert.match(calculatePurchaseCsvRow(input, config).errors.join(), /Asigna IVA Compra/);
    const mapped = calculatePurchaseCsvRow(input, { ...config, reviewed: false, vatMappings: { ...config.vatMappings, IMPUESTO_X: "reducida_8" } });
    assert.equal(mapped.complete, true);
    assert.equal(mapped.vatAmount, "399.83");
    assert.match(calculatePurchaseCsvRow(row([source({ saleVatCode: "DESCONOCIDO" })]), config).errors.join(), /Asigna IVA Venta/);
});

test("legacy items still require an IVA Venta mapping when their source cell is blank", () => {
    assert.match(calculatePurchaseCsvRow(row([source({ saleVatCode: "" })]), config).errors.join(), /Asigna IVA Venta/);
});

test("missing products and inconsistent source cannot confirm despite automatic tax defaults", () => {
    assert.match(calculatePurchaseCsvRow({ ...row(), productResolutions: {} }, config).errors.join(), /Resuelve/);
    assert.match(calculatePurchaseCsvRow(row([source({ subtotalBs: "5" })]), config).errors.join(), /no coincide/);
    assert.match(calculatePurchaseCsvRow(row([source({ exchangeRate: "0" })]), config).errors.join(), /positiva/);
    assert.match(calculatePurchaseCsvRow(row([source({ quantity: "1.00001", subtotalBs: "1665.98" })]), config).errors.join(), /4 decimales/);
});

test("header-only purchases remain pending without inventing tax bases", () => {
    const result = calculatePurchaseCsvRow(row([]), { ...config, reviewed: false });
    assert.deepEqual(result.errors, []);
    assert.equal(result.complete, false);
    assert.equal(result.items.length, 0);
    assert.match(result.warnings.join(), /borrador/);
});

test("unsupported document kinds and invalid header rates are blocked", () => {
    const input = row();
    input.header.documentType = "Nota de crédito";
    input.header.exchangeRate = "804.12345";
    const result = calculatePurchaseCsvRow(input, config);
    assert.equal(result.complete, false);
    assert.match(result.errors.join(), /Tipo Doc Factura/);
    assert.match(result.errors.join(), /4 decimales/);
});

test("new catalog products cannot silently lose a reduced sale VAT assignment", () => {
    const input = row([source({ saleVatCode: "VENTA8" })]);
    input.productResolutions["001"] = { create: { name: "Producto", measureUnit: "unidad", valuationMethod: "promedio_ponderado", vatType: "general" } };
    const result = calculatePurchaseCsvRow(input, { ...config, vatMappings: { ...config.vatMappings, VENTA8: "reducida_8" } });
    assert.equal(result.complete, false);
    assert.match(result.errors.join(), /IVA de venta 8%/);
});

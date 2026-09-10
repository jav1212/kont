import assert from "node:assert/strict";
import test from "node:test";
import {
    associatePurchaseItems, calculatePurchaseCsvRow, normalizePurchaseRif,
    parsePurchaseDecimal, parsePurchaseHeaders, parsePurchaseItems,
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

test("all-USD imports still calculate from source Bs and truncate aggregate VAT exactly", () => {
    const input = row([source({ quantity: "1", unitCostBs: "0.29", subtotalBs: "0.29", currencyCost: "999" }), source({ code: "002", quantity: "1", unitCostBs: "0.29", subtotalBs: "0.29", currencyCost: "999" })]);
    const result = calculatePurchaseCsvRow(input, config);
    assert.equal(result.subtotal, "0.58");
    assert.equal(result.vatAmount, "0.09");
    assert.equal(result.total, "0.67");
    assert.equal(result.complete, true);
});

test("unknown IVA, unreviewed settings, missing products and inconsistent source cannot confirm", () => {
    assert.equal(calculatePurchaseCsvRow(row(), { ...config, reviewed: false }).complete, false);
    assert.match(calculatePurchaseCsvRow(row([source({ purchaseVatCode: "IVA99" })]), config).errors.join(), /Asigna IVA Compra/);
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

import assert from "node:assert/strict";
import { resolveProductSalePrice } from "../src/modules/inventory/frontend/utils/product-sale-price";
import { computeInvoiceTotals, emptyHeaderAdjustments, emptyLineAdjustments } from "../src/modules/inventory/shared/totals";
import test from "node:test";
import {
  applyMappings,
  classifySourceIdentifier,
  parseExcelFileWithProfiles,
  parseNumeric,
  parseSemicolonCsvWorkbook,
  type ColumnMapping,
} from "../src/modules/inventory/frontend/utils/inventory-excel";
import { parseCompositeProductsCsv, validateCompositeImport } from "../src/modules/inventory/frontend/utils/composite-import";
import { resolveCatalogImportCompositeState } from "../src/modules/inventory/frontend/utils/catalog-import-composite-policy";

test("una importación de catálogo conserva compuestos existentes y no aporta recetas", () => {
  const existingReady = {
    compositionKind: "composite" as const,
    compositionStatus: "ready" as const,
    customFields: { tipo_origen: "Compuesto", fuente: "catálogo anterior" },
    components: [{ productId: "pan", quantity: 2 }],
  };
  const ready = resolveCatalogImportCompositeState({
    existing: existingReady,
    incomingCustomFields: { tipo_origen: "Producto", lote: "nuevo" },
  });
  assert.deepEqual(ready, {
    compositionKind: "composite", compositionStatus: "ready",
    customFields: { tipo_origen: "Compuesto", fuente: "catálogo anterior", lote: "nuevo" },
  });
  assert.deepEqual(existingReady.components, [{ productId: "pan", quantity: 2 }]);
  assert.equal("components" in ready, false, "La importación de catálogo no transporta ni modifica recetas");

  for (const [incomingCompositionKind, tipo_origen] of [
    [undefined, undefined],
    ["simple", "Producto"],
    ["simple", "Contorno"],
  ] as const) {
    for (const compositionStatus of ["pending", "ready"] as const) {
      const preserved = resolveCatalogImportCompositeState({
        existing: { compositionKind: "composite", compositionStatus, customFields: { tipo_origen: "Compuesto" } },
        incomingCompositionKind,
        incomingCustomFields: tipo_origen ? { tipo_origen } : {},
      });
      assert.equal(preserved.compositionKind, "composite");
      assert.equal(preserved.compositionStatus, compositionStatus);
      assert.equal(preserved.customFields.tipo_origen, "Compuesto");
    }
  }
});

test("solo una clasificación explícita crea compuestos nuevos", () => {
  const workbook = parseSemicolonCsvWorkbook("codigo;nombre;tipo de origen\n0782;COMBO 1;Producto");
  const mapped = applyMappings(workbook, "Inventario", [
    { sourceIndex: 0, sourceHeader: "codigo", target: { target: "product", field: "code" }, confidence: "manual" },
    { sourceIndex: 1, sourceHeader: "nombre", target: { target: "product", field: "name" }, confidence: "manual" },
    { sourceIndex: 2, sourceHeader: "tipo de origen", target: { target: "product", field: "sourceType" }, confidence: "manual" },
  ]);
  const namedCombo = resolveCatalogImportCompositeState({
    incomingCompositionKind: mapped.rows[0].product.compositionKind,
    incomingCustomFields: mapped.rows[0].customFields,
  });
  assert.equal(namedCombo.compositionKind, "simple", "El nombre COMBO no clasifica productos");

  const explicitComposite = resolveCatalogImportCompositeState({
    incomingCompositionKind: "composite",
    incomingCustomFields: { tipo_origen: "Compuesto" },
  });
  assert.equal(explicitComposite.compositionKind, "composite");
  assert.equal(explicitComposite.compositionStatus, "pending");
  assert.equal(explicitComposite.customFields.tipo_origen, "Compuesto");
});

test("clasifica barcode e identificadores internos sin perder el texto", () => {
  assert.deepEqual(classifySourceIdentifier(" 850241000402 "), {
    code: "850241000402", barcode: "850241000402", classification: "barcode",
  });
  assert.deepEqual(classifySourceIdentifier("JS3794"), {
    code: "JS3794", classification: "internal_code",
  });
  assert.equal(classifySourceIdentifier("PAN HOJALDRE").classification, "invalid");
});

test("interpreta números venezolanos sin reducir su magnitud", () => {
  assert.equal(parseNumeric("2.534,85"), 2534.85);
  assert.equal(parseNumeric("-1.240,5"), -1240.5);
  assert.equal(parseNumeric("2,05"), 2.05);
});

test("detecta INVENTARIO3 sin encabezado y produce un producto escaneable", () => {
  const preamble = ["EMPRESA;;;;;;;;;;;;;;;;;;;;;;;;", "RIF;;;;;;;;;;;;;;;;;;;;;;;;", ";", ";", "Lista;;;;;;;;;;;;;;;;;;;;;;;;", ";", ";"];
  const product = "9977;PANQUE;;-5;3.874,15;0;0;0;IVA1;UNI;;0;0;0;0;0;0;0;0;0;0;Producto;2,00;;USD";
  const workbook = parseSemicolonCsvWorkbook([...preamble, product].join("\r\n"));
  const parsed = parseExcelFileWithProfiles(workbook, "INVENTARIO3.csv");
  const result = applyMappings(workbook, parsed.selectedSheet!, parsed.suggestedMappings, {
    syntheticHeaders: parsed.detectedProfileFull?.syntheticHeaders,
    dataStartRowIndex: parsed.detectedProfileFull?.dataStartRowIndex, salePriceCurrency: "VES",
  });
  assert.equal(parsed.detectedProfile?.id, "portal_inventory_v3");
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows[0].product.salePricing, { mode: "fixed", amount: 3874.15, currency: "VES" });
  assert.equal(result.rows[0].customFields.moneda_costo, "USD");
  assert.equal(result.rows[0].initialStock, -5);
});

test("detecta el layout de El Portal con cualquier nombre y conserva separada la moneda del costo", () => {
  const preamble = Array.from({ length: 7 }, () => ";");
  const product = "9977;PANQUE;;-5;4,60;0;0;0;IVA1;UNI;;0;0;0;0;0;0;0;0;0;0;Producto;2,00;;EUR";
  const workbook = parseSemicolonCsvWorkbook([...preamble, product].join("\n"));
  const parsed = parseExcelFileWithProfiles(workbook, "productos correccion.csv");
  const result = applyMappings(workbook, parsed.selectedSheet!, parsed.suggestedMappings, {
    syntheticHeaders: parsed.detectedProfileFull?.syntheticHeaders,
    dataStartRowIndex: parsed.detectedProfileFull?.dataStartRowIndex,
    salePriceCurrency: "USD",
    salePriceIncludesVat: true,
  });
  assert.equal(parsed.detectedProfile?.id, "portal_inventory_v3");
  assert.deepEqual(result.rows[0].product.salePricing, { mode: "fixed", amount: 3.9655, currency: "USD" });
  assert.equal(result.rows[0].customFields.costo_referencia, "2,00");
  assert.equal(result.rows[0].customFields.moneda_costo, "EUR");
  assert.deepEqual(result.rows[0].customFields.importacion_precio_venta, {
    amount: 4.6, currency: "USD", includesVat: true, netAmount: 3.9655,
  });
  const resolved = resolveProductSalePrice({
    ...result.rows[0].product,
    companyId: "test-company", description: "", type: "mercancia", valuationMethod: "promedio_ponderado",
    currentStock: 1, averageCost: 999, active: true,
  }, 100);
  assert.ok(resolved);
  const invoice = computeInvoiceTotals([{
    quantity: 1, unitCost: resolved.unitPriceBs, currency: "VES", currencyCost: null,
    vatRate: "general_16", adjustments: emptyLineAdjustments(),
  }], emptyHeaderAdjustments(), 2, 0, [], 1, "VES");
  assert.equal(invoice.total, 460, "IVA must reconstruct USD 4.60 at the test exchange rate, without another markup");
});

test("un precio final exento no cambia y un precio explícitamente neto no se normaliza dos veces", () => {
  const preamble = Array.from({ length: 7 }, () => ";");
  const exempt = "P-EX;EXENTO;;0;4,60;0;0;0;EXENTO;UNI;;0;0;0;0;0;0;0;0;0;0;Producto;2,00;;USD";
  const exemptWorkbook = parseSemicolonCsvWorkbook([...preamble, exempt].join("\n"));
  const exemptParsed = parseExcelFileWithProfiles(exemptWorkbook, "exento.csv");
  const exemptResult = applyMappings(exemptWorkbook, exemptParsed.selectedSheet!, exemptParsed.suggestedMappings, {
    syntheticHeaders: exemptParsed.detectedProfileFull?.syntheticHeaders,
    dataStartRowIndex: exemptParsed.detectedProfileFull?.dataStartRowIndex,
    salePriceCurrency: "USD", salePriceIncludesVat: true,
  });
  assert.deepEqual(exemptResult.rows[0].product.salePricing, { mode: "fixed", amount: 4.6, currency: "USD" });

  const net = "P-NET;NETO;;0;3,9655;0;0;0;IVA1;UNI;;0;0;0;0;0;0;0;0;0;0;Producto;2,00;;USD";
  const netWorkbook = parseSemicolonCsvWorkbook([...preamble, net].join("\n"));
  const netParsed = parseExcelFileWithProfiles(netWorkbook, "neto.csv");
  const options = {
    syntheticHeaders: netParsed.detectedProfileFull?.syntheticHeaders,
    dataStartRowIndex: netParsed.detectedProfileFull?.dataStartRowIndex,
    salePriceCurrency: "USD" as const, salePriceIncludesVat: false,
  };
  const firstImport = applyMappings(netWorkbook, netParsed.selectedSheet!, netParsed.suggestedMappings, options);
  const secondImport = applyMappings(netWorkbook, netParsed.selectedSheet!, netParsed.suggestedMappings, options);
  assert.deepEqual(firstImport.rows[0].product.salePricing, { mode: "fixed", amount: 3.9655, currency: "USD" });
  assert.deepEqual(secondImport.rows[0].product.salePricing, firstImport.rows[0].product.salePricing);
  assert.deepEqual(firstImport.rows[0].customFields.importacion_precio_venta, {
    amount: 3.9655, currency: "USD", includesVat: false, netAmount: 3.9655,
  });
});

test("conserva la moneda de venta por fila para formatos genéricos", () => {
  const workbook = parseSemicolonCsvWorkbook("codigo;nombre;precio;moneda de venta\nP-1;PRODUCTO;4,60;USD");
  const mappings: ColumnMapping[] = [
    { sourceIndex: 0, sourceHeader: "codigo", target: { target: "product", field: "code" }, confidence: "manual" },
    { sourceIndex: 1, sourceHeader: "nombre", target: { target: "product", field: "name" }, confidence: "manual" },
    { sourceIndex: 2, sourceHeader: "precio", target: { target: "product", field: "salePrice" }, confidence: "manual" },
    { sourceIndex: 3, sourceHeader: "moneda de venta", target: { target: "product", field: "saleCurrency" }, confidence: "manual" },
  ];
  const result = applyMappings(workbook, "Inventario", mappings);
  assert.deepEqual(result.rows[0].product.salePricing, { mode: "fixed", amount: 4.6, currency: "USD" });
});

test("un precio de venta cero no reemplaza el precio existente", () => {
  const preamble = Array.from({ length: 7 }, () => ";");
  const product = "9977;PANQUE;;0;0,00;0;0;0;IVA1;UNI;;0;0;0;0;0;0;0;0;0;0;Producto;2,00;;USD";
  const workbook = parseSemicolonCsvWorkbook([...preamble, product].join("\n"));
  const parsed = parseExcelFileWithProfiles(workbook, "correccion.csv");
  const result = applyMappings(workbook, parsed.selectedSheet!, parsed.suggestedMappings, {
    syntheticHeaders: parsed.detectedProfileFull?.syntheticHeaders,
    dataStartRowIndex: parsed.detectedProfileFull?.dataStartRowIndex,
    salePriceCurrency: "USD",
    salePriceIncludesVat: true,
  });
  assert.equal(result.rows[0].product.salePricing, undefined);
  assert.equal(result.rows[0].customFields.importacion_precio_venta, undefined);
});

test("acepta existencia negativa y la presenta como advertencia", () => {
  const preamble = Array.from({ length: 7 }, () => ";");
  const product = "850241000402;DESODORANTE;;-1;2.534,85;0;0;0;IVA1;UNI;;0;0;0;0;0;0;0;0;0;0;Producto;2,05;;USD $";
  const workbook = parseSemicolonCsvWorkbook([...preamble, product].join("\n"));
  const parsed = parseExcelFileWithProfiles(workbook, "INVENTARIO3.csv");
  const result = applyMappings(workbook, parsed.selectedSheet!, parsed.suggestedMappings, {
    syntheticHeaders: parsed.detectedProfileFull?.syntheticHeaders,
    dataStartRowIndex: parsed.detectedProfileFull?.dataStartRowIndex,
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].initialStock, -1);
  assert.equal(result.errors.length, 0);
  assert.match(result.warnings[0].message, /Existencia negativa/);
});

test("acepta GAL y los tipos Compuesto y Contorno conservando el tipo de origen", () => {
  for (const sourceType of ["Compuesto", "Contorno"]) {
    const preamble = Array.from({ length: 7 }, () => ";");
    const product = `JS${sourceType};PRODUCTO;;1;100;0;0;0;IVA1;GAL;;0;0;0;0;0;0;0;0;0;0;${sourceType};0;;VES`;
    const workbook = parseSemicolonCsvWorkbook([...preamble, product].join("\n"));
    const parsed = parseExcelFileWithProfiles(workbook, "INVENTARIO3.csv");
    const result = applyMappings(workbook, parsed.selectedSheet!, parsed.suggestedMappings, {
      syntheticHeaders: parsed.detectedProfileFull?.syntheticHeaders,
      dataStartRowIndex: parsed.detectedProfileFull?.dataStartRowIndex,
    });
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows[0].product.measureUnit, "galon");
    assert.equal(result.rows[0].customFields.tipo_origen, sourceType);
    assert.equal(result.rows[0].product.compositionKind, sourceType === "Compuesto" ? "composite" : "simple");
  }
});

test("agrupa un reporte de compuestos no contiguo y conserva ceros y decimales", () => {
  const report = [
    "empresa",
    "Codigo/Compuesto;Producto/Compuesto;Departamento/Compuesto;Codigo/Componente;Producto/Componente;Departamento/Componente;Tipo/Unidad;Cantidad;",
    "0782;COMBO 1;D;0041;CACHITO;D;UNI;2;",
    "0783;COMBO 2;D;0050;PASTELITO;D;UNI;1;",
    "0782;COMBO 1;D;0005;PAN;D;KG;0,25;",
  ].join("\n");
  const result = parseCompositeProductsCsv(report);
  assert.equal(result.errors.length, 0);
  assert.equal(result.recipes.length, 2);
  assert.deepEqual(result.recipes[0].lines.map((line) => [line.componentCode, line.quantity]), [["0041", 2], ["0005", 0.25]]);
});

test("bloquea composiciones con producto ausente, unidad incompatible o componentes compuestos", () => {
  const parsed = parseCompositeProductsCsv("Codigo/Compuesto;Producto/Compuesto;D;Codigo/Componente;Producto/Componente;D;Tipo/Unidad;Cantidad\n0782;COMBO;D;0041;PAN;D;UNI;1");
  const result = validateCompositeImport(parsed, [
    { id: "combo", companyId: "c", code: "0782", name: "COMBO", description: "", type: "mercancia", measureUnit: "unidad", valuationMethod: "promedio_ponderado", currentStock: 0, averageCost: 0, active: true, vatType: "general", compositionKind: "composite" },
    { id: "pan", companyId: "c", code: "0041", name: "PAN", description: "", type: "mercancia", measureUnit: "kg", valuationMethod: "promedio_ponderado", currentStock: 0, averageCost: 0, active: true, vatType: "general" },
  ]);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /no coincide/);
});

test("un reporte malformado no deja recetas parcialmente válidas para guardar", () => {
  const parsed = parseCompositeProductsCsv([
    "Codigo/Compuesto;Producto/Compuesto;D;Codigo/Componente;Producto/Componente;D;Tipo/Unidad;Cantidad",
    "0782;COMBO;D;0041;PAN;D;UNI;1",
    "0782;COMBO;D;;BEBIDA;D;UNI;1",
  ].join("\n"));
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.recipes[0].lines.length, 1);
  assert.ok(parsed.errors.length > 0, "el llamador debe bloquear todas las escrituras al haber errores");
});

test("una fila corta se informa y un formato genérico no reclasifica productos existentes", () => {
  const malformed = parseCompositeProductsCsv("Codigo/Compuesto;Producto/Compuesto;D;Codigo/Componente;Producto/Componente;D;Tipo/Unidad;Cantidad\n0782;COMBO");
  assert.equal(malformed.errors.length, 1);
  const workbook = parseSemicolonCsvWorkbook("codigo;nombre\n0782;COMBO");
  const generic = applyMappings(workbook, "Inventario", [
    { sourceIndex: 0, sourceHeader: "codigo", target: { target: "product", field: "code" }, confidence: "manual" },
    { sourceIndex: 1, sourceHeader: "nombre", target: { target: "product", field: "name" }, confidence: "manual" },
  ]);
  assert.equal(generic.rows[0].product.compositionKind, undefined);
});

test("separa filas conflictivas sin descartar los productos válidos", () => {
  const preamble = Array.from({ length: 7 }, () => ";");
  const valid = "850241000402;VALIDO;;1;100;0;0;0;IVA1;UNI;;0;0;0;0;0;0;0;0;0;0;Producto;0;;VES";
  const invalid = "CODIGO CON ESPACIOS;INVALIDO;;1;100;0;0;0;IVA1;UNI;;0;0;0;0;0;0;0;0;0;0;Producto;0;;VES";
  const workbook = parseSemicolonCsvWorkbook([...preamble, valid, invalid].join("\n"));
  const parsed = parseExcelFileWithProfiles(workbook, "INVENTARIO3.csv");
  const result = applyMappings(workbook, parsed.selectedSheet!, parsed.suggestedMappings, {
    syntheticHeaders: parsed.detectedProfileFull?.syntheticHeaders,
    dataStartRowIndex: parsed.detectedProfileFull?.dataStartRowIndex,
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].product.name, "VALIDO");
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Código inválido/);
});

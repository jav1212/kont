import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMappings,
  classifySourceIdentifier,
  parseExcelFileWithProfiles,
  parseNumeric,
  parseSemicolonCsvWorkbook,
} from "../src/modules/inventory/frontend/utils/inventory-excel";

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
  const product = "850241000402;DESODORANTE;;1;2.534,85;0;0;0;IVA1;UNI;;0;0;0;0;0;0;0;0;0;0;Producto;2,05;;USD $";
  const workbook = parseSemicolonCsvWorkbook([...preamble, product].join("\r\n"));
  const parsed = parseExcelFileWithProfiles(workbook, "INVENTARIO3.csv");
  const result = applyMappings(workbook, parsed.selectedSheet!, parsed.suggestedMappings, {
    syntheticHeaders: parsed.detectedProfileFull?.syntheticHeaders,
    dataStartRowIndex: parsed.detectedProfileFull?.dataStartRowIndex,
  });
  assert.equal(parsed.detectedProfile?.id, "portal_inventory_v3");
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].product.barcode, "850241000402");
  assert.deepEqual(result.rows[0].product.salePricing, { mode: "fixed", amount: 2534.85, currency: "VES" });
  assert.equal(result.rows[0].initialStock, 1);
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
  }
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

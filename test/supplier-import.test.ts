import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeSuppliersCsvBytes,
  parseSuppliersCsv,
  planSupplierImport,
} from "../src/modules/inventory/frontend/utils/inventory-csv";

test("decodifica bytes Windows-1252 y reconoce el archivo legado tabulado", () => {
  const latin1 = new Uint8Array([
    ...Buffer.from("Reporte de proveedores\r\nID\tNombre de Empresa\tRIF\tTeléfono\tDirección\tSaldo a Favor\tEmail\tCuenta\tBanco\r\n1\tCaf", "ascii"),
    0xe9,
    ...Buffer.from(" Central\tJ-12.345.678-9\t0212-123\tAv. Bol", "ascii"),
    0xed,
    ...Buffer.from("var\t0\tcompras@example.com\t0102\tBanco Nacional", "ascii"),
  ]).buffer;
  const decoded = decodeSuppliersCsvBytes(latin1);
  const parsed = parseSuppliersCsv(decoded.text);

  assert.equal(decoded.encoding, "windows-1252");
  assert.equal(parsed.format, "legacy");
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.suppliers[0], {
    rif: "J-12.345.678-9", name: "Café Central", contact: "", phone: "0212-123",
    email: "compras@example.com", address: "Av. Bolívar", notes: "Cuenta: 0102 · Banco: Banco Nacional", active: true,
  });
});

test("mantiene compatibilidad con la exportación canónica", () => {
  const parsed = parseSuppliersCsv('"rif","nombre","contacto","telefono","email","direccion","notas","activo"\n"J-1","Acme","Ana","0212","a@b.com","Av. 1","Preferido","false"');
  assert.equal(parsed.format, "canonical");
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.suppliers[0], {
    rif: "J-1", name: "Acme", contact: "Ana", phone: "0212", email: "a@b.com", address: "Av. 1", notes: "Preferido", active: false,
  });
});

test("reconoce el encabezado legado exacto y conserva líneas físicas del archivo", () => {
  const parsed = parseSuppliersCsv("Informe\n\nNombre de Empresa / Proveedor\tRIF\tTeléfono\nProveedor Uno\tJ-1\t0212\nProveedor Dos\tJ-1\t0213");
  const plan = planSupplierImport(parsed, [], "company-1");

  assert.equal(parsed.format, "legacy");
  assert.deepEqual(parsed.sourceLines, [4, 5]);
  assert.equal(plan.operations.length, 1);
  assert.match(plan.omitted[0], /Fila 5/);
});

test("concilia RIF normalizados, conserva la primera fila y fusiona legado sin borrar datos", () => {
  const parsed = parseSuppliersCsv("ID\tProveedor\tRIF\tTeléfono\tDirección\tEmail\tCuenta\tBanco\n1\tNuevo nombre\tj 123\t\tNueva dirección\t\t001\tBanco A\n2\tDuplicado\tJ-123\t0212\t\t\t\t");
  const plan = planSupplierImport(parsed, [{
    id: "supplier-1", companyId: "company-1", rif: "J-123", name: "Anterior", contact: "Contacto", phone: "0414", email: "old@example.com", address: "", notes: "Ya existe", active: false,
  }], "company-1");

  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].action, "update");
  assert.equal(plan.operations[0].supplier.active, false);
  assert.equal(plan.operations[0].supplier.phone, "0414");
  assert.equal(plan.operations[0].supplier.email, "old@example.com");
  assert.equal(plan.operations[0].supplier.address, "Nueva dirección");
  assert.equal(plan.operations[0].supplier.notes, "Ya existe\nCuenta: 001 · Banco: Banco A");
  assert.match(plan.omitted[0], /primera ocurrencia/);
});

test("omite actualizaciones ambiguas y no duplica notas legadas", () => {
  const parsed = parseSuppliersCsv("ID\tProveedor\tRIF\tCuenta\tBanco\n1\tAcme\tJ-123\t001\tBanco A");
  const existing = {
    id: "supplier-1", companyId: "company-1", rif: "J123", name: "Acme", contact: "", phone: "", email: "", address: "",
    notes: "Cuenta: 001 · Banco: Banco A", active: false,
  };

  const idempotent = planSupplierImport(parsed, [existing], "company-1");
  assert.equal(idempotent.operations[0].supplier.notes, existing.notes);

  const ambiguous = planSupplierImport(parsed, [existing, { ...existing, id: "supplier-2", rif: "J-123" }], "company-1");
  assert.equal(ambiguous.operations.length, 0);
  assert.match(ambiguous.omitted[0], /múltiples proveedores/);
});

test("el formato canónico reemplaza autoritativamente un proveedor por RIF", () => {
  const parsed = parseSuppliersCsv('"rif","nombre","contacto","telefono","email","direccion","notas","activo"\n"J-1","Nuevo","","","","","","false"');
  const plan = planSupplierImport(parsed, [{
    id: "supplier-1", companyId: "company-1", rif: "J1", name: "Anterior", contact: "Ana", phone: "0212",
    email: "old@example.com", address: "Anterior", notes: "Anterior", active: true,
  }], "company-1");

  assert.equal(plan.operations[0].action, "update");
  assert.deepEqual(plan.operations[0].supplier, {
    id: "supplier-1", companyId: "company-1", rif: "J-1", name: "Nuevo", contact: "", phone: "",
    email: "", address: "", notes: "", active: false,
  });
});

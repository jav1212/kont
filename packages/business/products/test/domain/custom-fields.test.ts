import assert from "node:assert/strict";
import test from "node:test";
import {
  ProductFailure,
  validateProductCustomFieldDefinitions,
  validateProductCustomFieldValues,
  type ProductCustomFieldDefinition,
} from "../../src/domain";

const definitions: readonly ProductCustomFieldDefinition[] = [
  { id: "batch-code", label: "Lote proveedor", type: "text", required: true, maxLength: 40 },
  { id: "reorder-point", label: "Punto de reposición", type: "number", required: false, minimum: 0, maximum: 10_000 },
  { id: "temperature-controlled", label: "Requiere frío", type: "boolean", required: true },
  { id: "expiry-date", label: "Vencimiento", type: "date", required: false },
  { id: "quality-grade", label: "Calidad", type: "select", required: true, options: ["A", "B", "C"] },
];

test("validates typed product fields and returns normalized immutable values", () => {
  const catalog = validateProductCustomFieldDefinitions(definitions);
  assert.equal(Object.isFrozen(catalog), true);
  const values = validateProductCustomFieldValues(catalog, {
    "batch-code": "  BATCH-9  ",
    "reorder-point": 120,
    "temperature-controlled": false,
    "expiry-date": "2027-02-28",
    "quality-grade": "A",
  });
  assert.deepEqual(values, {
    "batch-code": "BATCH-9",
    "reorder-point": 120,
    "temperature-controlled": false,
    "expiry-date": "2027-02-28",
    "quality-grade": "A",
  });
  assert.equal(Object.isFrozen(values), true);
});

test("rejects unregistered fields, missing required values, wrong types, and out-of-range values", () => {
  const invalidValues: Readonly<Record<string, unknown>>[] = [
    { "batch-code": "B-1", "temperature-controlled": true, "quality-grade": "A", unknown: "value" },
    { "temperature-controlled": true, "quality-grade": "A" },
    { "batch-code": "B-1", "temperature-controlled": "false", "quality-grade": "A" },
    { "batch-code": "B-1", "reorder-point": -1, "temperature-controlled": true, "quality-grade": "A" },
    { "batch-code": "B-1", "temperature-controlled": true, "expiry-date": "2027-02-29", "quality-grade": "A" },
    { "batch-code": "B-1", "temperature-controlled": true, "quality-grade": "D" },
  ];
  for (const values of invalidValues) {
    assert.throws(
      () => validateProductCustomFieldValues(definitions, values),
      (error: unknown) => error instanceof ProductFailure && error.code === "PRODUCT_CUSTOM_FIELDS_INVALID",
    );
  }
});

test("rejects malformed and duplicated field definitions", () => {
  const invalidCatalogs: readonly ProductCustomFieldDefinition[][] = [
    [{ id: "Bad ID", label: "Campo", type: "text", required: false, maxLength: 20 }],
    [
      { id: "same", label: "Primero", type: "boolean", required: false },
      { id: "same", label: "Segundo", type: "date", required: false },
    ],
    [{ id: "choices", label: "Opciones", type: "select", required: false, options: ["Uno", "Uno"] }],
    [{ id: "range", label: "Rango", type: "number", required: false, minimum: 10, maximum: 1 }],
    [{ id: "long", label: "Campo", type: "text", required: false, maxLength: 2_001 }],
  ];
  for (const catalog of invalidCatalogs) {
    assert.throws(
      () => validateProductCustomFieldDefinitions(catalog),
      (error: unknown) => error instanceof ProductFailure && error.code === "PRODUCT_CUSTOM_FIELDS_INVALID",
    );
  }
});

import { ProductFailure } from "./product-failure";

/** Supported additional product-field representations. */
export const ProductCustomFieldType = {
  Text: "text",
  Number: "number",
  Boolean: "boolean",
  Date: "date",
  Select: "select",
} as const;

/** Discriminated definition for an additional product field. */
export type ProductCustomFieldDefinition =
  | { readonly id: string; readonly label: string; readonly type: "text"; readonly required: boolean; readonly maxLength: number }
  | { readonly id: string; readonly label: string; readonly type: "number"; readonly required: boolean; readonly minimum: number | null; readonly maximum: number | null }
  | { readonly id: string; readonly label: string; readonly type: "boolean" | "date"; readonly required: boolean }
  | { readonly id: string; readonly label: string; readonly type: "select"; readonly required: boolean; readonly options: readonly string[] };

/** Scalar values accepted for additional product fields. */
export type ProductCustomFieldValue = string | number | boolean | null;

/** Immutable values validated against one company's registered field definitions. */
export type ProductCustomFieldValues = Readonly<Record<string, ProductCustomFieldValue>>;

/**
 * Validates and freezes a company-owned product-field catalog.
 * @param input - Proposed field definitions for one product catalog.
 * @returns Canonical definitions in their supplied display order.
 * @throws {ProductFailure} When identifiers, labels, constraints, or options are invalid.
 */
export function validateProductCustomFieldDefinitions(
  input: readonly ProductCustomFieldDefinition[],
): readonly ProductCustomFieldDefinition[] {
  if (!Array.isArray(input) || input.length > 100) throw customFieldsInvalid();
  const ids = new Set<string>();
  const definitions = input.map((definition) => {
    if (!definition || !/^[a-z][a-z0-9._-]{0,63}$/.test(definition.id) || ids.has(definition.id)
      || typeof definition.required !== "boolean") throw customFieldsInvalid();
    ids.add(definition.id);
    const label = requiredLabel(definition.label);
    switch (definition.type) {
      case "text":
        if (!Number.isSafeInteger(definition.maxLength) || definition.maxLength < 1 || definition.maxLength > 2_000) throw customFieldsInvalid();
        return Object.freeze({ ...definition, label });
      case "number":
        if ((definition.minimum !== null && !Number.isFinite(definition.minimum))
          || (definition.maximum !== null && !Number.isFinite(definition.maximum))
          || (definition.minimum !== null && definition.maximum !== null && definition.minimum > definition.maximum)) throw customFieldsInvalid();
        return Object.freeze({ ...definition, label });
      case "boolean":
      case "date":
        return Object.freeze({ ...definition, label });
      case "select": {
        if (!Array.isArray(definition.options) || definition.options.length < 1 || definition.options.length > 100) throw customFieldsInvalid();
        const options = definition.options.map((option: string) => requiredLabel(option, 100));
        if (new Set(options).size !== options.length) throw customFieldsInvalid();
        return Object.freeze({ ...definition, label, options: Object.freeze(options) });
      }
      default:
        throw customFieldsInvalid();
    }
  });
  return Object.freeze(definitions);
}

/**
 * Validates a complete sparse set of additional product values.
 * @param definitions - Authoritative company field definitions.
 * @param input - Untrusted field-ID-to-scalar mapping.
 * @returns Immutable normalized values with optional absent fields omitted.
 * @throws {ProductFailure} When a required value is absent or a value violates its registered type or constraints.
 */
export function validateProductCustomFieldValues(
  definitions: readonly ProductCustomFieldDefinition[],
  input: Readonly<Record<string, unknown>>,
): ProductCustomFieldValues {
  const catalog = validateProductCustomFieldDefinitions(definitions);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw customFieldsInvalid();
  const byId = new Map(catalog.map((definition) => [definition.id, definition]));
  const entries = Object.entries(input);
  if (entries.length > 100 || entries.some(([id]) => !byId.has(id))) throw customFieldsInvalid();
  const values: Record<string, ProductCustomFieldValue> = {};
  for (const definition of catalog) {
    const present = Object.hasOwn(input, definition.id);
    const raw = input[definition.id];
    if (!present || raw === null) {
      if (definition.required) throw customFieldsInvalid();
      if (present) values[definition.id] = null;
      continue;
    }
    values[definition.id] = validateValue(definition, raw);
  }
  return Object.freeze(values);
}

function validateValue(definition: ProductCustomFieldDefinition, value: unknown): ProductCustomFieldValue {
  switch (definition.type) {
    case "text": {
      if (typeof value !== "string" || hasControls(value)) throw customFieldsInvalid();
      const normalized = value.trim();
      if (!normalized && definition.required || normalized.length > definition.maxLength) throw customFieldsInvalid();
      return normalized;
    }
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)
        || definition.minimum !== null && value < definition.minimum
        || definition.maximum !== null && value > definition.maximum) throw customFieldsInvalid();
      return value;
    case "boolean":
      if (typeof value !== "boolean") throw customFieldsInvalid();
      return value;
    case "date":
      if (typeof value !== "string" || !isCalendarDate(value)) throw customFieldsInvalid();
      return value;
    case "select":
      if (typeof value !== "string" || !definition.options.includes(value)) throw customFieldsInvalid();
      return value;
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function requiredLabel(value: string, maximumLength = 60): string {
  if (typeof value !== "string" || hasControls(value)) throw customFieldsInvalid();
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) throw customFieldsInvalid();
  return normalized;
}

function hasControls(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function customFieldsInvalid(): ProductFailure {
  return new ProductFailure("PRODUCT_CUSTOM_FIELDS_INVALID", "Product custom fields are invalid.");
}

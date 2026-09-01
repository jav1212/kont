import type {
  ChangePasswordDto,
  CreateInventoryOperationDto,
  CreateProductCategoryDto,
  CreateProductDto,
  InventoryDashboardQuery,
  InventoryFlowQuery,
  ProductCategoryOverviewQuery,
  ProductListQuery,
  ProductMovementQuery,
  ProductUnitEconomicsQuery,
  PurchasingDashboardQuery,
  ReverseInventoryOperationDto,
  SalesDashboardQuery,
  UnitOfMeasure,
  UpdateCurrentUserDto,
  UpdateInventoryOperationDto,
  UpdateOperationalDefaultsDto,
  UpdateOrganizationDto,
  UpdateProductCategoryDto,
  UpdateProductDto,
  UpdateProductInventoryProfileDto,
  UpdateProductSalePricingDto,
  UpdateProductTaxationDto,
  UpdateUserPreferencesDto,
} from "../index";

/** Stable error used when an untrusted serialized client input is malformed. */
export class ClientInputValidationError extends Error {
  /**
   * Creates a safe validation error without retaining the rejected input.
   * @param message - Public message suitable for the calling client.
   */
  constructor(message = "La solicitud no es válida.") {
    super(message);
    this.name = "ClientInputValidationError";
  }
}

/**
 * Decodes a non-empty bounded identifier accepted at a client boundary.
 * @param value - Untrusted serialized identifier.
 * @returns Trimmed identifier suitable for a portable port call.
 * @throws {ClientInputValidationError} When the value is blank, non-string, or exceeds 128 characters.
 */
export function decodeClientIdentifier(value: unknown): string {
  return text(value, "El identificador no es válido.", 128);
}

/**
 * Decodes a strict settings profile update command.
 * @param value - Untrusted serialized command.
 * @returns Validated profile command with no unknown fields.
 * @throws {ClientInputValidationError} When the command violates its boundary contract.
 */
export function decodeUpdateCurrentUser(value: unknown): UpdateCurrentUserDto {
  const input = object(value, ["displayName", "expectedVersion"]);
  const result: { displayName?: string; expectedVersion: number } = {
    expectedVersion: positiveVersion(input.expectedVersion),
  };
  if (input.displayName !== undefined) result.displayName = text(input.displayName, "El nombre no es válido.", 120);
  if (result.displayName === undefined) invalid();
  return Object.freeze(result);
}

/**
 * Decodes a strict settings preference update command.
 * @param value - Untrusted serialized command.
 * @returns Validated preferences command.
 * @throws {ClientInputValidationError} When the command violates its boundary contract.
 */
export function decodeUpdateUserPreferences(value: unknown): UpdateUserPreferencesDto {
  const input = object(value, ["expectedVersion", "appearance", "regional"]);
  const result: { expectedVersion: number; appearance?: { colorScheme?: "light" | "dark" | "system"; density?: "comfortable" | "compact" }; regional?: { locale?: string; timeZone?: string } } = { expectedVersion: positiveVersion(input.expectedVersion) };
  if (input.appearance !== undefined) {
    const appearance = object(input.appearance, ["colorScheme", "density"]);
    const decoded: { colorScheme?: "light" | "dark" | "system"; density?: "comfortable" | "compact" } = {};
    if (appearance.colorScheme !== undefined) decoded.colorScheme = enumeration(appearance.colorScheme, ["light", "dark", "system"]);
    if (appearance.density !== undefined) decoded.density = enumeration(appearance.density, ["comfortable", "compact"]);
    if (!Object.keys(decoded).length) invalid();
    result.appearance = Object.freeze(decoded);
  }
  if (input.regional !== undefined) {
    const regional = object(input.regional, ["locale", "timeZone"]);
    const decoded: { locale?: string; timeZone?: string } = {};
    if (regional.locale !== undefined) decoded.locale = text(regional.locale, "La configuración regional no es válida.", 64);
    if (regional.timeZone !== undefined) decoded.timeZone = text(regional.timeZone, "La zona horaria no es válida.", 64);
    if (!Object.keys(decoded).length) invalid();
    result.regional = Object.freeze(decoded);
  }
  if (!result.appearance && !result.regional) invalid();
  return Object.freeze(result);
}

/**
 * Decodes a strict organization update command.
 * @param value - Untrusted serialized command.
 * @returns Validated organization command.
 * @throws {ClientInputValidationError} When the command violates its boundary contract.
 */
export function decodeUpdateOrganization(value: unknown): UpdateOrganizationDto {
  const input = object(value, ["name", "expectedVersion"]);
  const result: { name?: string; expectedVersion: number } = { expectedVersion: positiveVersion(input.expectedVersion) };
  if (input.name !== undefined) result.name = text(input.name, "El nombre no es válido.", 160);
  if (result.name === undefined) invalid();
  return Object.freeze(result);
}

/**
 * Decodes a strict password change command.
 * @param value - Untrusted serialized command.
 * @returns Validated password command.
 * @throws {ClientInputValidationError} When the command violates its boundary contract.
 */
export function decodeChangePassword(value: unknown): ChangePasswordDto {
  const input = object(value, ["newPassword", "revokeOtherSessions"]);
  const result: { newPassword: string; revokeOtherSessions?: boolean } = { newPassword: text(input.newPassword, "La contraseña no es válida.", 512) };
  if (result.newPassword.length < 8) invalid("La contraseña no es válida.");
  if (input.revokeOtherSessions !== undefined) result.revokeOtherSessions = boolean(input.revokeOtherSessions);
  return Object.freeze(result);
}

/**
 * Decodes a strict operational-defaults update command.
 * @param value - Untrusted serialized command.
 * @returns Validated command.
 * @throws {ClientInputValidationError} When the command violates its boundary contract.
 */
export function decodeUpdateOperationalDefaults(value: unknown): UpdateOperationalDefaultsDto {
  const input = object(value, ["expectedVersion", "effectiveDate", "presentationCurrency", "manualExchangeRate"]);
  // Operation-context persistence preserves legacy snapshots whose version is
  // zero, so this boundary intentionally accepts non-negative versions.
  const result: { expectedVersion: number; effectiveDate?: string; presentationCurrency?: string; manualExchangeRate?: { baseCurrency: string; value: string; reason: string } } = { expectedVersion: nonNegativeVersion(input.expectedVersion) };
  if (input.effectiveDate !== undefined) result.effectiveDate = date(input.effectiveDate);
  if (input.presentationCurrency !== undefined) result.presentationCurrency = currency(input.presentationCurrency);
  if (input.manualExchangeRate !== undefined) {
    const rate = object(input.manualExchangeRate, ["baseCurrency", "value", "reason"]);
    result.manualExchangeRate = Object.freeze({ baseCurrency: currency(rate.baseCurrency), value: positiveDecimal(rate.value), reason: text(rate.reason, "La razón no es válida.", 500) });
  }
  if (!result.effectiveDate && !result.presentationCurrency && !result.manualExchangeRate) invalid();
  return Object.freeze(result);
}

/** Decodes a strict product creation command. @param value - Untrusted serialized command. @returns Validated product command. @throws {ClientInputValidationError} When the command violates its boundary contract. */
export function decodeCreateProduct(value: unknown): CreateProductDto {
  const input = object(value, ["sku", "barcodes", "name", "description", "categoryId", "baseUnit"]);
  const result: { sku: string; barcodes?: readonly string[]; name: string; description?: string | null; categoryId?: string | null; baseUnit: UnitOfMeasure } = { sku: text(input.sku, "El SKU no es válido.", 128), name: text(input.name, "El producto no es válido.", 240), baseUnit: unit(input.baseUnit) };
  if (input.barcodes !== undefined) result.barcodes = texts(input.barcodes, 50, 128);
  if (input.description !== undefined) result.description = nullableText(input.description, 2_000);
  if (input.categoryId !== undefined) result.categoryId = nullableIdentifier(input.categoryId);
  return Object.freeze(result);
}

/** Decodes a strict product update command. @param value - Untrusted serialized command. @returns Validated product command. @throws {ClientInputValidationError} When the command violates its boundary contract. */
export function decodeUpdateProduct(value: unknown): UpdateProductDto {
  const input = object(value, ["sku", "barcodes", "name", "description", "categoryId", "baseUnit", "expectedVersion"]);
  const result: { expectedVersion: number; sku?: string; barcodes?: readonly string[]; name?: string; description?: string | null; categoryId?: string | null; baseUnit?: UnitOfMeasure } = { expectedVersion: positiveVersion(input.expectedVersion) };
  if (input.sku !== undefined) result.sku = text(input.sku, "El SKU no es válido.", 128);
  if (input.barcodes !== undefined) result.barcodes = texts(input.barcodes, 50, 128);
  if (input.name !== undefined) result.name = text(input.name, "El producto no es válido.", 240);
  if (input.description !== undefined) result.description = nullableText(input.description, 2_000);
  if (input.categoryId !== undefined) result.categoryId = nullableIdentifier(input.categoryId);
  if (input.baseUnit !== undefined) result.baseUnit = unit(input.baseUnit);
  if (Object.keys(result).length === 1) invalid();
  return Object.freeze(result);
}

/** Decodes a strict product inventory-profile command. @param value - Untrusted serialized command. @returns Validated command. @throws {ClientInputValidationError} When the command violates its boundary contract. */
export function decodeUpdateProductInventoryProfile(value: unknown): UpdateProductInventoryProfileDto {
  const input = object(value, ["minimumQuantity", "expectedVersion"]);
  return Object.freeze({ minimumQuantity: input.minimumQuantity === null ? null : nonNegativeDecimal(input.minimumQuantity), expectedVersion: positiveVersion(input.expectedVersion) });
}

/** Decodes a strict product sale-pricing command. @param value - Untrusted serialized command. @returns Validated command. @throws {ClientInputValidationError} When the command violates its boundary contract. */
export function decodeUpdateProductSalePricing(value: unknown): UpdateProductSalePricingDto {
  const input = object(value, ["policy", "expectedVersion"]);
  let policy: UpdateProductSalePricingDto["policy"] = null;
  if (input.policy !== null) {
    const raw = object(input.policy, ["mode", "amount", "percentage", "currency"]);
    const mode = enumeration(raw.mode, ["fixed", "markup"]);
    const code = currency(raw.currency);
    policy = mode === "fixed"
      ? Object.freeze({ mode, amount: positiveDecimal(raw.amount), currency: code })
      : Object.freeze({ mode, percentage: nonNegativeDecimal(raw.percentage), currency: code });
  }
  return Object.freeze({ policy, expectedVersion: positiveVersion(input.expectedVersion) });
}

/** Decodes a strict product taxation command. @param value - Untrusted serialized command. @returns Validated command. @throws {ClientInputValidationError} When the command violates its boundary contract. */
export function decodeUpdateProductTaxation(value: unknown): UpdateProductTaxationDto {
  const input = object(value, ["treatment", "effectiveFrom", "legalBasis", "expectedVersion"]);
  return Object.freeze({ treatment: enumeration(input.treatment, ["taxed", "exempt", "exonerated", "not_subject"]), effectiveFrom: date(input.effectiveFrom), legalBasis: text(input.legalBasis, "La base legal no es válida.", 1_000), expectedVersion: positiveVersion(input.expectedVersion) });
}

/** Decodes a strict product-category creation command. @param value - Untrusted serialized command. @returns Validated command. @throws {ClientInputValidationError} When the command violates its boundary contract. */
export function decodeCreateProductCategory(value: unknown): CreateProductCategoryDto {
  const input = object(value, ["name", "description"]);
  return Object.freeze({ name: text(input.name, "La categoría no es válida.", 160), ...(input.description === undefined ? {} : { description: nullableText(input.description, 2_000) }) });
}

/** Decodes a strict product-category update command. @param value - Untrusted serialized command. @returns Validated command. @throws {ClientInputValidationError} When the command violates its boundary contract. */
export function decodeUpdateProductCategory(value: unknown): UpdateProductCategoryDto {
  const input = object(value, ["name", "description", "expectedVersion"]);
  const result: { expectedVersion: number; name?: string; description?: string | null } = { expectedVersion: positiveVersion(input.expectedVersion) };
  if (input.name !== undefined) result.name = text(input.name, "La categoría no es válida.", 160);
  if (input.description !== undefined) result.description = nullableText(input.description, 2_000);
  if (Object.keys(result).length === 1) invalid();
  return Object.freeze(result);
}

/** Decodes a strict product-list query. @param value - Untrusted serialized query. @returns Validated list query. @throws {ClientInputValidationError} When the query violates its boundary contract. */
export function decodeProductListQuery(value: unknown): ProductListQuery {
  const input = object(value, ["search", "status", "categoryId", "stock", "sort", "direction", "cursor", "limit"]);
  const result: { search?: string; status?: "active" | "inactive" | "all"; categoryId?: string; stock?: "all" | "available" | "low" | "out"; sort?: "name" | "sku" | "stock" | "value" | "updatedAt"; direction?: "asc" | "desc"; cursor?: string; limit?: number } = {};
  if (input.search !== undefined) result.search = text(input.search, "La búsqueda no es válida.", 256);
  if (input.status !== undefined) result.status = enumeration(input.status, ["active", "inactive", "all"]);
  if (input.categoryId !== undefined) result.categoryId = decodeClientIdentifier(input.categoryId);
  if (input.stock !== undefined) result.stock = enumeration(input.stock, ["all", "available", "low", "out"]);
  if (input.sort !== undefined) result.sort = enumeration(input.sort, ["name", "sku", "stock", "value", "updatedAt"]);
  if (input.direction !== undefined) result.direction = enumeration(input.direction, ["asc", "desc"]);
  if (input.cursor !== undefined) result.cursor = text(input.cursor, "El cursor no es válido.", 512);
  if (input.limit !== undefined) result.limit = limit(input.limit);
  return Object.freeze(result);
}

/** Decodes a strict product-movement query. @param value - Untrusted serialized query. @returns Validated movement query. @throws {ClientInputValidationError} When the query violates its boundary contract. */
export function decodeProductMovementQuery(value: unknown): ProductMovementQuery {
  const input = object(value, ["cursor", "limit", "from", "to", "type"]);
  const result: { cursor?: string; limit?: number; from?: string; to?: string; type?: string } = {};
  if (input.cursor !== undefined) result.cursor = text(input.cursor, "El cursor no es válido.", 512);
  if (input.limit !== undefined) result.limit = limit(input.limit);
  if (input.from !== undefined || input.to !== undefined) {
    if (input.from === undefined || input.to === undefined) invalid("El período no es válido.");
    Object.assign(result, period(input));
  }
  if (input.type !== undefined) result.type = text(input.type, "El tipo no es válido.", 128);
  return Object.freeze(result);
}

/** Decodes a strict product-category overview query. @param value - Untrusted serialized query. @returns Validated overview query. @throws {ClientInputValidationError} When the query violates its boundary contract. */
export function decodeProductCategoryOverviewQuery(value: unknown): ProductCategoryOverviewQuery {
  const input = object(value, ["search", "status", "sort", "direction", "cursor", "limit"]);
  const result: { search?: string; status?: "active" | "inactive" | "all"; sort?: "name" | "products" | "updatedAt"; direction?: "asc" | "desc"; cursor?: string; limit?: number } = {};
  if (input.search !== undefined) result.search = text(input.search, "La búsqueda no es válida.", 256);
  if (input.status !== undefined) result.status = enumeration(input.status, ["active", "inactive", "all"]);
  if (input.sort !== undefined) result.sort = enumeration(input.sort, ["name", "products", "updatedAt"]);
  if (input.direction !== undefined) result.direction = enumeration(input.direction, ["asc", "desc"]);
  if (input.cursor !== undefined) result.cursor = text(input.cursor, "El cursor no es válido.", 512);
  if (input.limit !== undefined) result.limit = limit(input.limit);
  return Object.freeze(result);
}

/** Decodes a strict product unit-economics query. @param value - Untrusted serialized query. @returns Validated economics query. @throws {ClientInputValidationError} When the query violates its boundary contract. */
export function decodeProductUnitEconomicsQuery(value: unknown): ProductUnitEconomicsQuery {
  const input = object(value, ["from", "to", "granularity"]);
  return Object.freeze({ ...period(input), granularity: enumeration(input.granularity, ["day", "week", "month"]) });
}

/** Decodes a strict inventory-operation creation command. @param value - Untrusted serialized command. @returns Validated command. @throws {ClientInputValidationError} When the command violates its boundary contract. */
export function decodeCreateInventoryOperation(value: unknown): CreateInventoryOperationDto {
  const input = object(value, ["reason", "effectiveDate", "reference", "notes", "lines"]);
  const lines = array(input.lines, 1, 500).map((line) => {
    const item = object(line, ["productId", "direction", "quantity", "unit", "unitCost"]);
    return Object.freeze({ productId: decodeClientIdentifier(item.productId), direction: enumeration(item.direction, ["inbound", "outbound"]), quantity: positiveDecimal(item.quantity), unit: unit(item.unit), ...(item.unitCost === undefined ? {} : { unitCost: item.unitCost === null ? null : nonNegativeDecimal(item.unitCost) }) });
  });
  return Object.freeze({ reason: enumeration(input.reason, ["opening_balance", "stock_count_adjustment", "self_consumption"]), effectiveDate: date(input.effectiveDate), ...(input.reference === undefined ? {} : { reference: nullableText(input.reference, 256) }), ...(input.notes === undefined ? {} : { notes: nullableText(input.notes, 2_000) }), lines: Object.freeze(lines) });
}

/** Decodes a strict inventory-operation metadata update command. @param value - Untrusted serialized command. @returns Validated command. @throws {ClientInputValidationError} When the command violates its boundary contract. */
export function decodeUpdateInventoryOperation(value: unknown): UpdateInventoryOperationDto {
  const input = object(value, ["effectiveDate", "reference", "notes", "expectedVersion"]);
  const result: { expectedVersion: number; effectiveDate?: string; reference?: string | null; notes?: string | null } = { expectedVersion: positiveVersion(input.expectedVersion) };
  if (input.effectiveDate !== undefined) result.effectiveDate = date(input.effectiveDate);
  if (input.reference !== undefined) result.reference = nullableText(input.reference, 256);
  if (input.notes !== undefined) result.notes = nullableText(input.notes, 2_000);
  if (Object.keys(result).length === 1) invalid();
  return Object.freeze(result);
}

/** Decodes a strict inventory-operation reversal command. @param value - Untrusted serialized command. @returns Validated command. @throws {ClientInputValidationError} When the command violates its boundary contract. */
export function decodeReverseInventoryOperation(value: unknown): ReverseInventoryOperationDto {
  const input = object(value, ["effectiveDate", "reason", "expectedVersion"]);
  return Object.freeze({ effectiveDate: date(input.effectiveDate), reason: text(input.reason, "La razón no es válida.", 500), expectedVersion: positiveVersion(input.expectedVersion) });
}

/** Decodes a strict inventory flow query. @param value - Untrusted serialized query. @returns Validated query. @throws {ClientInputValidationError} When the query violates its boundary contract. */
export function decodeInventoryFlowQuery(value: unknown): InventoryFlowQuery {
  const input = object(value, ["from", "to", "reason", "sourceKind", "productId", "status", "search", "cursor", "limit"]);
  const result: { from: string; to: string; reason?: string; sourceKind?: string; productId?: string; status?: "draft" | "posted" | "reversed"; search?: string; cursor?: string; limit?: number } = period(input);
  if (input.reason !== undefined) result.reason = text(input.reason, "La razón no es válida.", 128);
  if (input.sourceKind !== undefined) result.sourceKind = text(input.sourceKind, "El origen no es válido.", 128);
  if (input.productId !== undefined) result.productId = decodeClientIdentifier(input.productId);
  if (input.status !== undefined) result.status = enumeration(input.status, ["draft", "posted", "reversed"]);
  if (input.search !== undefined) result.search = text(input.search, "La búsqueda no es válida.", 256);
  if (input.cursor !== undefined) result.cursor = text(input.cursor, "El cursor no es válido.", 512);
  if (input.limit !== undefined) result.limit = limit(input.limit);
  return Object.freeze(result);
}

/** Decodes a strict inventory dashboard query. @param value - Untrusted serialized query. @returns Validated dashboard query. @throws {ClientInputValidationError} When the query violates its boundary contract. */
export function decodeInventoryDashboardQuery(value: unknown): InventoryDashboardQuery { return dashboardQuery(value); }
/** Decodes a strict purchasing dashboard query. @param value - Untrusted serialized query. @returns Validated dashboard query. @throws {ClientInputValidationError} When the query violates its boundary contract. */
export function decodePurchasingDashboardQuery(value: unknown): PurchasingDashboardQuery { return dashboardQuery(value); }
/** Decodes a strict sales dashboard query. @param value - Untrusted serialized query. @returns Validated dashboard query. @throws {ClientInputValidationError} When the query violates its boundary contract. */
export function decodeSalesDashboardQuery(value: unknown): SalesDashboardQuery { return dashboardQuery(value); }

function dashboardQuery(value: unknown): { readonly from: string; readonly to: string; readonly granularity?: "day"; readonly limit?: number } {
  const input = object(value, ["from", "to", "granularity", "limit"]);
  const result: { from: string; to: string; granularity?: "day"; limit?: number } = period(input);
  if (input.granularity !== undefined) result.granularity = enumeration(input.granularity, ["day"]);
  if (input.limit !== undefined) result.limit = limit(input.limit);
  return Object.freeze(result);
}

function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !allowed.includes(key))) invalid();
  return candidate;
}
function array(value: unknown, minimum: number, maximum: number): readonly unknown[] { if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalid(); return value; }
function text(value: unknown, message: string, maximum: number): string { if (typeof value !== "string") invalid(message); const normalized = value.trim(); if (!normalized || normalized.length > maximum) invalid(message); return normalized; }
function nullableText(value: unknown, maximum: number): string | null { return value === null ? null : text(value, "El texto no es válido.", maximum); }
function nullableIdentifier(value: unknown): string | null { return value === null ? null : decodeClientIdentifier(value); }
function texts(value: unknown, maximumItems: number, maximumLength: number): readonly string[] { const decoded = array(value, 0, maximumItems).map((item) => text(item, "El código no es válido.", maximumLength)); if (new Set(decoded).size !== decoded.length) invalid(); return Object.freeze(decoded); }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") invalid(); return value; }
function positiveVersion(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) invalid("La versión no es válida."); return value as number; }
function nonNegativeVersion(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) invalid("La versión no es válida."); return value as number; }
function limit(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) invalid("El límite no es válido."); return value as number; }
function date(value: unknown): string { const parsed = text(value, "La fecha no es válida.", 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) invalid("La fecha no es válida."); const [year, month, day] = parsed.split("-").map(Number) as [number, number, number]; const instant = new Date(Date.UTC(year, month - 1, day)); if (instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1 || instant.getUTCDate() !== day) invalid("La fecha no es válida."); return parsed; }
function decimal(value: unknown): string { const parsed = text(value, "El importe no es válido.", 64); if (!/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(parsed)) invalid("El importe no es válido."); return parsed; }
function nonNegativeDecimal(value: unknown): string { const parsed = decimal(value); if (parsed.startsWith("-")) invalid("El importe no es válido."); return parsed; }
function positiveDecimal(value: unknown): string { const parsed = nonNegativeDecimal(value); if (/^0(?:\.0+)?$/.test(parsed)) invalid("El importe no es válido."); return parsed; }
function currency(value: unknown): string { const parsed = text(value, "La moneda no es válida.", 3).toUpperCase(); if (!/^[A-Z]{3}$/.test(parsed)) invalid("La moneda no es válida."); return parsed; }
function unit(value: unknown): UnitOfMeasure { return enumeration(value, ["each", "kilogram", "gram", "meter", "square_meter", "cubic_meter", "liter", "gallon", "box", "roll", "package"]); }
function enumeration<const T extends string>(
  value: unknown,
  values: readonly T[],
): T {
  if (typeof value !== "string" || !values.includes(value as T)) invalid();
  return value as T;
}
function period(input: Record<string, unknown>): { from: string; to: string } { const from = date(input.from); const to = date(input.to); if (from > to || daysBetween(from, to) > 365) invalid("El período no es válido."); return { from, to }; }
function daysBetween(from: string, to: string): number { return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000; }
function invalid(message?: string): never { throw new ClientInputValidationError(message); }

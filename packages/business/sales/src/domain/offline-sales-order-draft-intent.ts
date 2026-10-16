import { compareDecimal, exactDecimal } from "@kontave/monetary/domain";
import { SalesFailure } from "./sales-failure";
import type { OfflineDraftJson } from "./offline-sales-draft";

/** Version-one, server-validated intent for an offline merchandise sales-order draft. */
export interface OfflineSalesOrderDraftIntentV1 {
  readonly version: 1;
  readonly customerId: string;
  readonly customerUpdatedAt: string;
  readonly orderDate: string;
  readonly currencyCode: "VES" | "USD";
  readonly lines: readonly OfflineSalesOrderDraftLineV1[];
}

/** One priced merchandise line carried by a version-one offline order intent. */
export interface OfflineSalesOrderDraftLineV1 {
  readonly productId: string;
  readonly quantity: string;
  readonly expectedPricingVersion: number;
  readonly expectedUnitPrice: string;
}

/**
 * Parses an untrusted JSON payload as the fixed v1 offline sales-order intent.
 * @param value - Decrypted outbox JSON or a direct gateway input.
 * @returns Immutable typed intent whose decimal values remain exact serialized text.
 * @throws {SalesFailure} When the payload is not the supported v1 schema.
 */
export function offlineSalesOrderDraftIntentV1(value: OfflineDraftJson): OfflineSalesOrderDraftIntentV1 {
  if (!isRecord(value) || value.version !== 1 || !hasOnlyKeys(value, ["version", "customerId", "customerUpdatedAt", "orderDate", "currencyCode", "lines"])) {
    throw invalid();
  }
  const customerId = identifier(value.customerId);
  const customerUpdatedAt = instant(value.customerUpdatedAt);
  const orderDate = date(value.orderDate);
  const currencyCode = value.currencyCode === "VES" || value.currencyCode === "USD" ? value.currencyCode : undefined;
  if (!currencyCode || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 50) throw invalid();
  const productIds = new Set<string>();
  const lines = value.lines.map((candidate) => line(candidate, productIds));
  return Object.freeze({ version: 1, customerId, customerUpdatedAt, orderDate, currencyCode, lines: Object.freeze(lines) });
}

function line(value: OfflineDraftJson, productIds: Set<string>): OfflineSalesOrderDraftLineV1 {
  if (!isRecord(value) || !hasOnlyKeys(value, ["productId", "quantity", "expectedPricingVersion", "expectedUnitPrice"])) throw invalid();
  const productId = identifier(value.productId);
  if (productIds.has(productId)) throw invalid();
  productIds.add(productId);
  const expectedPricingVersion = value.expectedPricingVersion;
  if (typeof expectedPricingVersion !== "number" || !Number.isSafeInteger(expectedPricingVersion) || expectedPricingVersion < 1 || expectedPricingVersion > 2_147_483_647) throw invalid();
  return Object.freeze({
    productId,
    quantity: positiveDecimal(value.quantity),
    expectedPricingVersion,
    expectedUnitPrice: positiveDecimal(value.expectedUnitPrice),
  });
}

function identifier(value: OfflineDraftJson | undefined): string {
  if (typeof value !== "string") throw invalid();
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) throw invalid();
  return normalized;
}

function positiveDecimal(value: OfflineDraftJson | undefined): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(value)) throw invalid();
  try {
    const decimal = exactDecimal(value);
    if (compareDecimal(decimal, exactDecimal("0")) <= 0) throw invalid();
    return decimal;
  } catch (cause) {
    if (cause instanceof SalesFailure) throw cause;
    throw invalid();
  }
}

function instant(value: OfflineDraftJson | undefined): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !calendarDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) throw invalid();
  return value;
}

function date(value: OfflineDraftJson | undefined): string {
  if (typeof value !== "string" || !calendarDate(value)) throw invalid();
  return value;
}

function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isRecord(value: OfflineDraftJson): value is Readonly<Record<string, OfflineDraftJson>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Readonly<Record<string, OfflineDraftJson>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function invalid(): SalesFailure {
  return new SalesFailure("SALES_OFFLINE_DRAFT_VALIDATION_FAILED", "Offline sales-order draft intent is invalid.");
}

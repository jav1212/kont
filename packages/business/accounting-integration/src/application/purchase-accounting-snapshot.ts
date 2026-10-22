import { currency, moneyFromDecimal, type Money } from "@kontave/monetary/domain";
import { AccountingIntegrationFailure, type PurchaseInvoiceConfirmedAccountingEvent } from "../domain";

const VES = currency("VES", 2);

/** Trusted server-side scope used to read one confirmed purchase-invoice accounting snapshot. */
export interface PurchaseAccountingSnapshotQuery {
  readonly actorId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly purchaseInvoiceId: string;
}

/** PII-free accounting evidence emitted for a confirmed purchase invoice revision. */
export interface ConfirmedPurchaseAccountingSnapshot {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly invoiceId: string;
  readonly sourceVersion: number;
  readonly effectiveDate: string;
  readonly confirmedAt: string;
  readonly movementCount: number;
  /** Exact VES inventory cost recognized by the owning inventory source. */
  readonly recognizedInventoryCost: Money;
  /** Original document currency. It never authorizes an implicit accounting conversion. */
  readonly documentCurrency: "VES" | "USD";
}

/** Read boundary owned by the accounting-integration application. */
export interface PurchaseAccountingSnapshotReader {
  /**
   * Returns one confirmed purchase-invoice revision within the trusted scope.
   * @param query - Authenticated actor and complete tenant, organization, company, and invoice scope.
   * @returns PII-free evidence with a source-owned recognized VES cost.
   * @throws {AccountingIntegrationFailure} When access, confirmation state, or source availability rejects the read.
   */
  readConfirmed(query: PurchaseAccountingSnapshotQuery): Promise<ConfirmedPurchaseAccountingSnapshot>;
}

/** Reads and validates a confirmed purchase source before a journal plan is made. */
export class ReadConfirmedPurchaseAccountingSnapshot {
  /**
   * Creates the use case.
   * @param reader - Authorized persistence reader for confirmed purchase evidence.
   * @returns A query use case bound to its source reader.
   */
  public constructor(private readonly reader: PurchaseAccountingSnapshotReader) {}

  /**
   * Reads a source-owned inventory-cost snapshot.
   * @param query - Trusted server-side source scope.
   * @returns A validated immutable confirmed-purchase snapshot.
   * @throws {AccountingIntegrationFailure} When the query or returned source evidence is invalid.
   */
  public async execute(query: PurchaseAccountingSnapshotQuery): Promise<ConfirmedPurchaseAccountingSnapshot> {
    validateQuery(query);
    try {
      return validateConfirmedPurchaseAccountingSnapshot(await this.reader.readConfirmed(query), query);
    } catch (error) {
      if (error instanceof AccountingIntegrationFailure) throw error;
      throw new AccountingIntegrationFailure(
        "ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE",
        "Confirmed purchase accounting source is unavailable.",
        { cause: error },
      );
    }
  }
}

/**
 * Converts validated purchase evidence into the existing planner event without performing currency conversion.
 * @param snapshot - Confirmed purchase source evidence returned by this application boundary.
 * @returns An immutable planner event whose amount is the source-owned exact VES recognized cost.
 * @throws {AccountingIntegrationFailure} When the source evidence is malformed or foreign.
 */
export function purchaseAccountingSnapshotToConfirmedEvent(
  snapshot: ConfirmedPurchaseAccountingSnapshot,
): PurchaseInvoiceConfirmedAccountingEvent {
  const validated = validateConfirmedPurchaseAccountingSnapshot(snapshot, {
    actorId: "validated-snapshot",
    tenantId: snapshot.tenantId,
    organizationId: snapshot.organizationId,
    companyId: snapshot.companyId,
    purchaseInvoiceId: snapshot.invoiceId,
  });
  return Object.freeze({
    source: "purchasing.invoice_confirmed",
    tenantId: validated.tenantId,
    organizationId: validated.organizationId,
    companyId: validated.companyId,
    purchaseInvoiceId: validated.invoiceId,
    purchaseInvoiceVersion: validated.sourceVersion,
    effectiveDate: validated.effectiveDate,
    occurredAt: validated.confirmedAt,
    recognizedInventoryCost: validated.recognizedInventoryCost,
  });
}

/**
 * Validates and freezes purchase data returned by a source adapter.
 * @param snapshot - Untrusted source response.
 * @param query - Scope originally authorized by the server composition root.
 * @returns A normalized PII-free snapshot.
 * @throws {AccountingIntegrationFailure} When data is foreign, malformed, or has invalid money evidence.
 */
export function validateConfirmedPurchaseAccountingSnapshot(
  snapshot: ConfirmedPurchaseAccountingSnapshot,
  query: PurchaseAccountingSnapshotQuery,
): ConfirmedPurchaseAccountingSnapshot {
  validateQuery(query);
  if (!snapshot || typeof snapshot !== "object" ||
    snapshot.tenantId !== query.tenantId ||
    snapshot.organizationId !== query.organizationId ||
    snapshot.companyId !== query.companyId ||
    snapshot.invoiceId !== query.purchaseInvoiceId ||
    !Number.isSafeInteger(snapshot.sourceVersion) || snapshot.sourceVersion < 1 ||
    (snapshot.documentCurrency !== "VES" && snapshot.documentCurrency !== "USD")) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Purchase accounting source returned foreign or unsupported evidence.");
  }
  validateDate(snapshot.effectiveDate, "effective date");
  validateInstant(snapshot.confirmedAt, "confirmation time");
  if (!Number.isSafeInteger(snapshot.movementCount) || snapshot.movementCount < 1) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", "Purchase accounting source returned an invalid movement count.");
  }
  const recognizedInventoryCost = requireVesMoney(snapshot.recognizedInventoryCost, "recognized inventory cost");
  return Object.freeze({
    tenantId: snapshot.tenantId.trim(),
    organizationId: snapshot.organizationId.trim(),
    companyId: snapshot.companyId.trim(),
    invoiceId: snapshot.invoiceId.trim(),
    sourceVersion: snapshot.sourceVersion,
    effectiveDate: snapshot.effectiveDate,
    confirmedAt: snapshot.confirmedAt,
    movementCount: snapshot.movementCount,
    recognizedInventoryCost,
    documentCurrency: snapshot.documentCurrency,
  });
}

/**
 * Parses one exact VES(2) decimal sent by the native purchase RPC.
 * @param value - Decimal string from the RPC contract.
 * @param label - Safe field label for diagnostics.
 * @returns Exact non-negative VES money.
 * @throws {AccountingIntegrationFailure} When the value cannot be represented exactly.
 */
export function parsePurchaseAccountingVes(value: unknown, label: string): Money {
  if (typeof value !== "string" || !/^\d+\.\d{2}$/.test(value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} must be an exact non-negative VES decimal with two fractional digits.`);
  }
  try {
    return moneyFromDecimal(value, VES);
  } catch (cause) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} is not a valid exact VES amount.`, { cause });
  }
}

function validateQuery(query: PurchaseAccountingSnapshotQuery): void {
  if (!query || typeof query !== "object") throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Trusted purchase accounting scope is invalid.");
  for (const [label, value] of Object.entries({ actor: query.actorId, tenant: query.tenantId, organization: query.organizationId, company: query.companyId, purchaseInvoice: query.purchaseInvoiceId })) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 128) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", `Trusted ${label} scope is invalid.`);
    }
  }
}

function requireVesMoney(value: unknown, label: string): Money {
  if (!value || typeof value !== "object" || !("minorAmount" in value) || !("currency" in value)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} is invalid.`);
  }
  const money = value as Money;
  if (money.currency?.code !== "VES" || money.currency.minorUnit !== 2 || typeof money.minorAmount !== "bigint" || money.minorAmount < 0n) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} must be a non-negative VES amount with two decimal places.`);
  }
  return money;
}

function validateDate(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} is invalid.`);
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year!, month! - 1, day!));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month! - 1 || candidate.getUTCDate() !== day) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} is invalid.`);
}

function validateInstant(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_SOURCE_INVALID", `${label} is invalid.`);
}

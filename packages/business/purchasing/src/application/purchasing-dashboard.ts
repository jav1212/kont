import type { CompanyId } from "@kontave/companies/domain";
import type { FiscalDocumentType } from "@kontave/fiscal/domain";
import type { CurrencyCode, ExactDecimal } from "@kontave/monetary/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import type { PurchasingDocumentId, SupplierId } from "../domain";

export type PurchasingDashboardGranularity = "day";

export interface PurchasingDashboardQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly from: string;
  readonly to: string;
  readonly granularity: PurchasingDashboardGranularity;
  readonly recentLimit: number;
}

export interface PurchasingFunctionalAmount {
  readonly amount: ExactDecimal;
  readonly currency: "VES";
}

export interface PurchasingTransactionAmount {
  readonly amount: ExactDecimal;
  readonly currency: CurrencyCode;
}

export interface PurchasingDashboardSupplierReference {
  readonly id: SupplierId | null;
  readonly legalName: string;
  readonly taxIdentifier: string | null;
}

export type PurchasingDocumentStatus = "draft" | "confirmed";

export interface PurchasingDashboardSummary {
  readonly confirmedPurchaseTotal: PurchasingFunctionalAmount;
  readonly vatCreditTotal: PurchasingFunctionalAmount;
  readonly vatWithheldTotal: PurchasingFunctionalAmount;
  readonly confirmedDocumentCount: number;
  readonly draftDocumentCount: number;
}

export interface PurchasingDashboardDay {
  readonly date: string;
  readonly confirmedPurchaseTotal: PurchasingFunctionalAmount;
  readonly vatCreditTotal: PurchasingFunctionalAmount;
  readonly confirmedDocumentCount: number;
  readonly draftDocumentCount: number;
}

export interface PurchasingDashboardTopSupplier {
  readonly supplier: PurchasingDashboardSupplierReference;
  readonly confirmedPurchaseTotal: PurchasingFunctionalAmount;
  readonly confirmedDocumentCount: number;
}

export interface RecentPurchasingDocument {
  readonly id: PurchasingDocumentId;
  readonly documentType: FiscalDocumentType;
  readonly invoiceNumber: string;
  readonly controlNumber: string | null;
  readonly supplier: PurchasingDashboardSupplierReference;
  readonly fiscalDate: string;
  readonly status: PurchasingDocumentStatus;
  readonly functionalAmounts: {
    readonly subtotal: PurchasingFunctionalAmount;
    readonly vat: PurchasingFunctionalAmount;
    readonly vatWithheld: PurchasingFunctionalAmount;
    readonly total: PurchasingFunctionalAmount;
  };
  readonly transactionCurrency: CurrencyCode;
  readonly transactionAmounts: {
    readonly subtotal: PurchasingTransactionAmount | null;
    readonly vat: PurchasingTransactionAmount | null;
    readonly total: PurchasingTransactionAmount | null;
  };
}

export interface PurchasingDashboardSnapshot {
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly granularity: PurchasingDashboardGranularity;
  };
  readonly summary: PurchasingDashboardSummary;
  readonly daily: readonly PurchasingDashboardDay[];
  readonly topSuppliers: readonly PurchasingDashboardTopSupplier[];
  readonly recentDocuments: readonly RecentPurchasingDocument[];
  readonly generatedAt: string;
}

export interface PurchasingDashboardReader {
  /**
   * Reads an authorized purchasing dashboard snapshot.
   * @param query Validated dashboard scope and period.
   * @returns The dashboard snapshot.
   * @throws {PurchasingDashboardFailure} When access is denied or the data source is unavailable.
   */
  read(query: PurchasingDashboardQuery): Promise<PurchasingDashboardSnapshot>;
}

export type PurchasingDashboardFailureCode =
  | "PURCHASING_DASHBOARD_INVALID"
  | "PURCHASING_DASHBOARD_ACCESS_DENIED"
  | "PURCHASING_DASHBOARD_UNAVAILABLE";

/** Expected failure exposed by purchasing dashboard operations. */
export class PurchasingDashboardFailure extends Error {
  /**
   * Creates a typed purchasing dashboard failure.
   * @param code Stable failure code for callers.
   * @param message Human-readable diagnostic message.
   * @param options Optional error options, including the original cause.
   */
  constructor(
    readonly code: PurchasingDashboardFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PurchasingDashboardFailure";
  }
}

/** Validates a dashboard request and delegates it to the configured reader. */
export class GetPurchasingDashboard {
  /**
   * Creates the purchasing dashboard query service.
   * @param reader Port that supplies authorized dashboard snapshots.
   */
  constructor(private readonly reader: PurchasingDashboardReader) {}

  /**
   * Obtains a purchasing dashboard snapshot.
   * @param query Requested actor, company, period, and result limit.
   * @returns The requested dashboard snapshot.
   * @throws {PurchasingDashboardFailure} When the query is invalid, access is denied, or reading fails.
   */
  async execute(query: PurchasingDashboardQuery): Promise<PurchasingDashboardSnapshot> {
    const validated = validatePurchasingDashboardQuery(query);
    try {
      return await this.reader.read(validated);
    } catch (cause) {
      if (cause instanceof PurchasingDashboardFailure) throw cause;
      throw new PurchasingDashboardFailure(
        "PURCHASING_DASHBOARD_UNAVAILABLE",
        "Purchasing dashboard is unavailable.",
        { cause },
      );
    }
  }
}

/**
 * Validates and normalizes a purchasing dashboard query.
 * @param query Dashboard query supplied by a caller.
 * @returns An immutable query with validated calendar dates.
 * @throws {PurchasingDashboardFailure} When dates, range, granularity, or limit are invalid.
 */
export function validatePurchasingDashboardQuery(
  query: PurchasingDashboardQuery,
): PurchasingDashboardQuery {
  const from = validDate(query.from);
  const to = validDate(query.to);
  if (from > to) throw invalid("Dashboard start date must not be after its end date.");

  const days =
    Math.floor(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  if (days > 366) throw invalid("Dashboard periods cannot exceed 366 days.");
  if (query.granularity !== "day") {
    throw invalid("Only day granularity is currently supported.");
  }
  if (!Number.isSafeInteger(query.recentLimit) || query.recentLimit < 1 || query.recentLimit > 100) {
    throw invalid("Recent-document limit must be between 1 and 100.");
  }
  return Object.freeze({ ...query, from, to });
}

function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid("Dashboard dates must use YYYY-MM-DD format.");
  }
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw invalid("Dashboard date is invalid.");
  }
  return value;
}

function invalid(message: string): PurchasingDashboardFailure {
  return new PurchasingDashboardFailure("PURCHASING_DASHBOARD_INVALID", message);
}

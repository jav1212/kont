import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import type { ProductId, UnitOfMeasure } from "@kontave/products/domain";

export type UnitEconomicsGranularity = "day" | "week" | "month";

export interface ProductUnitEconomicsQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly from: string;
  readonly to: string;
  readonly granularity: UnitEconomicsGranularity;
}

export interface UnitValueObservation {
  readonly effectiveDate: string;
  readonly sourceUnitAmount: { readonly amount: string; readonly currency: string };
  readonly unitAmount: { readonly amount: string; readonly currency: "VES" };
  readonly exchangeRate: string | null;
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly reference: string | null;
  readonly documentId: string;
}

export interface UnitEconomicsAggregate {
  readonly weightedAverageUnitAmount: { readonly amount: string; readonly currency: "VES" };
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly observations: number;
}

export interface ProductUnitEconomics {
  readonly period: { readonly from: string; readonly to: string; readonly granularity: UnitEconomicsGranularity };
  readonly latestAcquisition: UnitValueObservation | null;
  readonly points: readonly {
    readonly bucketStart: string;
    readonly acquisition: UnitEconomicsAggregate | null;
    readonly realizedSale: UnitEconomicsAggregate | null;
  }[];
  readonly coverage: {
    readonly confirmedAcquisitions: number;
    readonly confirmedSales: number;
    readonly legacyRecordedOutboundPrices: number;
  };
  readonly generatedAt: string;
}

/** Expected unit-economics failure exposed to application consumers. */
export class UnitEconomicsFailure extends Error {
  /**
   * Creates a typed unit-economics failure.
   *
   * @param code - Stable failure classification.
   * @param message - Safe diagnostic message.
   * @param options - Optional original cause.
   */
  constructor(
    readonly code: "UNIT_ECONOMICS_INVALID" | "UNIT_ECONOMICS_NOT_FOUND" | "UNIT_ECONOMICS_ACCESS_DENIED" | "UNIT_ECONOMICS_UNAVAILABLE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "UnitEconomicsFailure";
  }
}

/** Reads product unit-economics projections from an application boundary. */
export interface UnitEconomicsReader {
  /**
   * Reads one validated product period.
   *
   * @param query - Scoped product, period and aggregation granularity.
   * @returns The product's unit-economics projection.
   * @throws {UnitEconomicsFailure} When the query cannot be served.
   */
  read(query: ProductUnitEconomicsQuery): Promise<ProductUnitEconomics>;
}

/** Validates and executes a product unit-economics query. */
export class GetProductUnitEconomics {
  /**
   * Creates the query use case.
   *
   * @param reader - Unit-economics read boundary.
   */
  constructor(private readonly reader: UnitEconomicsReader) {}

  /**
   * Reads unit economics for a bounded valid calendar period.
   *
   * @param query - Scoped product query covering at most 366 inclusive days.
   * @returns The unit-economics projection.
   * @throws {UnitEconomicsFailure} When validation or the reader fails.
   */
  execute(query: ProductUnitEconomicsQuery): Promise<ProductUnitEconomics> {
    const validated = validate(query);
    try {
      return this.reader.read(validated).catch((cause: unknown) => { throw readerFailure(cause); });
    } catch (cause: unknown) {
      throw readerFailure(cause);
    }
  }
}

function validate(query: ProductUnitEconomicsQuery): ProductUnitEconomicsQuery {
  date(query.from);
  date(query.to);
  if (query.from > query.to) invalid("Unit economics start date must not be after its end date.");
  const days = Math.floor((Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > 366) invalid("Product unit economics periods cannot exceed 366 days.");
  if (!["day", "week", "month"].includes(query.granularity)) invalid("Product unit economics granularity is invalid.");
  return query;
}

function date(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid("Product unit economics dates must use YYYY-MM-DD.");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    invalid("Product unit economics date is invalid.");
  }
}

function invalid(message: string): never {
  throw new UnitEconomicsFailure("UNIT_ECONOMICS_INVALID", message);
}

function readerFailure(cause: unknown): UnitEconomicsFailure {
  if (cause instanceof UnitEconomicsFailure) return cause;
  return new UnitEconomicsFailure("UNIT_ECONOMICS_UNAVAILABLE", "Unit economics are unavailable.", { cause });
}

import type { CompanyId, OrganizationId, UserId } from "@kontave/organizations/domain";

export type SalesPerformanceDimension = "user" | "role" | "device";
const dimensions: readonly string[] = ["user", "role", "device"];

export interface SalesPerformanceReportQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly from: string;
  readonly to: string;
  readonly dimension: SalesPerformanceDimension;
  readonly currency: "VES";
}

export interface SalesPerformanceAmount {
  readonly amount: string;
  readonly currency: "VES";
}

export interface SalesPerformanceRow {
  readonly key: string;
  readonly label: string;
  readonly attributed: boolean;
  readonly invoiceCount: number;
  readonly grossAmount: SalesPerformanceAmount;
}

export interface SalesPerformanceReport {
  readonly period: { readonly from: string; readonly to: string };
  readonly dimension: SalesPerformanceDimension;
  readonly currency: "VES";
  readonly rows: readonly SalesPerformanceRow[];
  readonly generatedAt: string;
}

export interface SalesPerformanceReportReader {
  /**
   * Reads a tenant-scoped sales report grouped by its requested attribution dimension.
   * @param query Authorized organization, company, date range, grouping and currency.
   * @returns Grouped invoice counts and exact serialized monetary totals.
   * @throws {SalesPerformanceReportFailure} When authorization or persistence fails.
   */
  read(query: SalesPerformanceReportQuery): Promise<SalesPerformanceReport>;
}

export type SalesPerformanceReportFailureCode =
  | "SALES_REPORT_INVALID"
  | "SALES_REPORT_ACCESS_DENIED"
  | "SALES_REPORT_UNAVAILABLE";

/** Expected failure exposed by sales performance reporting. */
export class SalesPerformanceReportFailure extends Error {
  /**
   * Creates a typed report failure.
   * @param code Stable failure code for callers.
   * @param message Human-readable diagnostic.
   * @param options Optional original cause.
   */
  constructor(readonly code: SalesPerformanceReportFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SalesPerformanceReportFailure";
  }
}

/** Validates report scope and delegates the read to the configured port. */
export class GetSalesPerformanceReport {
  /**
   * Creates the report query service.
   * @param reader Port that supplies authorized report snapshots.
   */
  constructor(private readonly reader: SalesPerformanceReportReader) {}

  /**
   * Obtains a sales performance report.
   * @param query Requested actor, company, period, dimension and currency.
   * @returns The grouped report.
   * @throws {SalesPerformanceReportFailure} When validation, access or reading fails.
   */
  async execute(query: SalesPerformanceReportQuery): Promise<SalesPerformanceReport> {
    const validated = validateSalesPerformanceReportQuery(query);
    try {
      return await this.reader.read(validated);
    } catch (cause) {
      if (cause instanceof SalesPerformanceReportFailure) throw cause;
      throw new SalesPerformanceReportFailure("SALES_REPORT_UNAVAILABLE", "Sales report is unavailable.", { cause });
    }
  }
}

/**
 * Validates and freezes a report request.
 * @param query Report request supplied by a caller.
 * @returns Validated request.
 * @throws {SalesPerformanceReportFailure} When dates, range, dimension or currency are invalid.
 */
export function validateSalesPerformanceReportQuery(query: SalesPerformanceReportQuery): SalesPerformanceReportQuery {
  const from = validDate(query.from);
  const to = validDate(query.to);
  if (from > to) throw invalid("Report start date must not be after its end date.");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > 366) throw invalid("Report periods cannot exceed 366 days.");
  if (!dimensions.includes(query.dimension)) {
    throw invalid("Report dimension is invalid.");
  }
  if (query.currency !== "VES") throw invalid("Sales performance reports currently use VES totals.");
  return Object.freeze({ ...query, from, to });
}

function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid("Report dates must use YYYY-MM-DD format.");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw invalid("Report date is invalid.");
  }
  return value;
}

function invalid(message: string): SalesPerformanceReportFailure {
  return new SalesPerformanceReportFailure("SALES_REPORT_INVALID", message);
}

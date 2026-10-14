import { TaxReportingFailure, type VatDeclaration, type TaxReportingScope } from "../domain";

/** Stable keyset position through append-only declaration revisions. */
export interface VatDeclarationHistoryCursor {
  readonly period: string;
  readonly id: string;
  readonly revision: number;
}

/** Bounded request for declaration history in one company. */
export interface VatDeclarationHistoryRequest {
  readonly fromPeriod: string;
  readonly toPeriod: string;
  readonly limit: number;
  readonly cursor: VatDeclarationHistoryCursor | null;
}

/** Read-only port for revision history; persistence rechecks actor and scope. */
export interface VatDeclarationHistoryRepository {
  /**
   * Reads ordered declaration revisions after authorizing a cross-book view.
   * @param scope - Tenant, organization, and company owner.
   * @param request - Inclusive period bounds and stable page cursor.
   * @param actorId - Authenticated caller revalidated by the persistence adapter.
   * @returns One page of immutable declaration revisions.
   * @throws {TaxReportingFailure} When scope or page request is invalid.
   */
  listDeclarations(scope: TaxReportingScope, request: VatDeclarationHistoryRequest, actorId: string): Promise<{
    readonly items: readonly VatDeclaration[];
    readonly nextCursor: VatDeclarationHistoryCursor | null;
  }>;
}

/** Lists immutable internal declaration revisions for one company and period range. */
export class ListVatDeclarationHistory {
  /**
   * Creates the declaration history query.
   * @param declarations - Scoped append-only declaration reader.
   * @returns Query for versioned declaration history.
   * @throws No expected failure during construction.
   */
  constructor(private readonly declarations: VatDeclarationHistoryRepository) {}

  /**
   * Reads one bounded page of declaration revisions.
   * @param scope - Authorized company scope.
   * @param request - Period bounds and optional continuation cursor.
   * @param actorId - Authenticated caller.
   * @returns Immutable revisions and the next cursor when more rows exist.
   * @throws {TaxReportingFailure} When the caller, period range, or cursor is invalid.
   */
  execute(scope: TaxReportingScope, request: VatDeclarationHistoryRequest, actorId: string) {
    if (!actorId.trim() || !validPeriod(request.fromPeriod) || !validPeriod(request.toPeriod)
      || request.fromPeriod > request.toPeriod || !Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100
      || (request.cursor !== null && (!validPeriod(request.cursor.period) || !request.cursor.id.trim()
        || !Number.isInteger(request.cursor.revision) || request.cursor.revision < 1))) {
      throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Declaration history request is invalid.");
    }
    return this.declarations.listDeclarations(scope, request, actorId.trim());
  }
}

function validPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

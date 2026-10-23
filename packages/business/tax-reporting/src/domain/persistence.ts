import type { TaxReportingFact, TaxReportingScope } from "./tax-reporting-fact";
/** Stable ascending ledger cursor. */
export interface TaxReportingCursor { readonly recognitionDate: string; readonly id: string; }
/** Bounded ledger query. */
export interface TaxReportingFactPageRequest { readonly from: string; readonly to: string; readonly period?: string; readonly limit: number; readonly cursor: TaxReportingCursor | null; }
/** One page from a scoped reporting fact store. */
export interface TaxReportingFactPage { readonly items: readonly TaxReportingFact[]; readonly nextCursor: TaxReportingCursor | null; }
/** Append-only persistence port. */
export interface TaxReportingFactRepository { persist(input: { readonly fact: TaxReportingFact; readonly actorId: string; readonly idempotencyKey: string }): Promise<{ readonly fact: TaxReportingFact; readonly replayed: boolean }>; list(scope: TaxReportingScope, request: TaxReportingFactPageRequest, actorId: string): Promise<TaxReportingFactPage>; }

/** Atomic persistence boundary for a user-selected set of reviewed historical facts. */
export interface TaxReportingFactBatchRepository {
  /** Persists every valid fact in one database transaction under a stable batch identity.
   * @param input - Company scoped facts, actor, and idempotent batch key.
   * @returns The persisted snapshots and whether the batch was replayed.
   * @throws {TaxReportingFailure} If any fact conflicts or the batch cannot be committed atomically.
   */
  persistBatch(input: { readonly scope: TaxReportingScope; readonly facts: readonly { readonly fact: TaxReportingFact; readonly idempotencyKey: string }[]; readonly actorId: string; readonly idempotencyKey: string }): Promise<{ readonly facts: readonly TaxReportingFact[]; readonly replayed: boolean }>;
}
/** Validates a keyset request. @param request - Candidate date range/page. @returns Normalized request. @throws Error on invalid bounds. */
export function taxReportingFactPageRequest(request: TaxReportingFactPageRequest): TaxReportingFactPageRequest { if (!/^\d{4}-\d{2}-\d{2}$/.test(request.from) || !/^\d{4}-\d{2}-\d{2}$/.test(request.to) || request.from > request.to || (request.period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(request.period)) || !Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100) throw new Error("Invalid tax reporting page request."); return request; }

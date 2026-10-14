import { TaxReportingFailure, type TaxReportingFact, type TaxReportingFactRepository, type TaxReportingScope } from "../domain";
import type { TaxationConfigurationRepository } from "@kontave/taxation/application";
import { reviewLegacyVatSourceRecord, type LegacyVatFactSeed, type LegacyVatRecordReviewEvidence } from "./legacy-source-record-review";
import type { LegacyVatReadDirection, LegacyVatSourceReader, LegacyVatSourceRecord } from "./legacy-vat-source";

/** Persists explicitly reviewed legacy source snapshots with reviewer and idempotency evidence. */
export class RecordReviewedLegacyVatSource {
  /**
   * Creates a legacy source review recorder.
   * @param facts - Append-only, actor-scoped historical reporting repository.
   * @param sources - Authorized reader for the company-scoped legacy source bridge.
   * @param taxation - Optional company-scoped profile reader used to snapshot the supplier's effective status.
   * @returns Command that records reconciled or review-required historical facts.
   * @throws No expected failure during construction.
   */
  constructor(
    private readonly facts: TaxReportingFactRepository,
    private readonly sources: LegacyVatSourceReader,
    private readonly taxation?: TaxationConfigurationRepository,
  ) {}

  /**
   * Loads a source row through the authorized reader, applies explicit historical review evidence, and persists it.
   *
   * Review-required facts are retained for audit, but declaration preparation
   * rejects their issue state until a separate correction or reconciliation is recorded.
   *
   * @param input - Source scope and key, bounded date range, reviewer decisions, actor, and stable command identity.
   * @returns The persisted fact and whether the exact command was replayed.
   * @throws {TaxReportingFailure} When amounts, metadata, actor, or idempotency are invalid.
   */
  async execute(input: {
    readonly scope: TaxReportingScope;
    readonly direction: LegacyVatReadDirection;
    readonly sourceId: string;
    readonly from: string;
    readonly to: string;
    readonly seed: LegacyVatFactSeed;
    readonly evidence: LegacyVatRecordReviewEvidence;
    readonly actorId: string;
    readonly idempotencyKey: string;
  }): Promise<{ readonly fact: TaxReportingFact; readonly replayed: boolean }> {
    const actorId = input.actorId.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    if (!actorId || !idempotencyKey || idempotencyKey.length > 128) {
      throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Reviewer and idempotency key are required for a legacy VAT source.");
    }
    if (!input.sourceId.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to) || input.from > input.to
      || input.seed.scope.tenantId !== input.scope.tenantId
      || input.seed.scope.organizationId !== input.scope.organizationId
      || input.seed.scope.companyId !== input.scope.companyId) {
      throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy source identity, range, or reporting scope is invalid.");
    }
    let cursor: string | null = null;
    let source: LegacyVatSourceRecord | null = null;
    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      const page = await this.sources.readLegacyVatSources({
        scope: input.scope, actorId, direction: input.direction, from: input.from, to: input.to, cursor, limit: 100,
      });
      source = page.documents.find((document) => document.id === input.sourceId) ?? null;
      if (source !== null) break;
      if (!page.hasMore) break;
      if (page.nextCursor === null) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy reader marked more records without a cursor.");
      cursor = page.nextCursor;
    }
    if (source === null) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy source was not found in the authorized company, direction, and date range.");
    let counterpartyFiscalProfile = input.seed.counterpartyFiscalProfile ?? null;
    const counterpartyId = source.header.counterpartyId?.trim();
    if (input.direction === "purchase" && counterpartyFiscalProfile === null && this.taxation !== undefined && counterpartyId) {
      const context = {
        actorUserId: actorId,
        organizationId: input.scope.organizationId,
        companyId: input.scope.companyId,
      } as Parameters<TaxationConfigurationRepository["getCounterpartyFiscalProfile"]>[0];
      counterpartyFiscalProfile = await this.taxation.getCounterpartyFiscalProfile(
        context,
        counterpartyId,
        source.documentDate ?? input.seed.recognitionDate,
      );
    }
    const fact = reviewLegacyVatSourceRecord(source, { ...input.seed, counterpartyFiscalProfile }, input.evidence);
    if (fact.direction !== input.direction) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy source direction differs from the authorized book query.");
    return this.facts.persist({ fact, actorId, idempotencyKey });
  }
}

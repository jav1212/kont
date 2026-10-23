import { TaxReportingFailure, type TaxReportingFactBatchRepository, type TaxReportingScope } from "../domain";
import type { LegacyVatReadDirection } from "./legacy-vat-source";
import type { RecordReviewedLegacyVatSource } from "./record-reviewed-legacy-vat-source";

type ReviewInput = Parameters<RecordReviewedLegacyVatSource["review"]>[0];
export interface LegacyVatBatchReviewItem extends Omit<ReviewInput, "scope" | "direction" | "actorId"> { readonly sourceId: string; }
export interface LegacyVatBatchReviewResult { readonly sourceId: string; readonly status: "incorporated" | "rejected"; readonly factId?: string; readonly reason?: string; }

/** Reviews selected legacy records and atomically appends only facts without blocking issues.
 * @param reviewer - Explicit source snapshot reviewer; it does not persist during validation.
 * @param batch - Atomic company scoped reporting fact writer.
 * @returns A bounded review command for one direction and one company.
 * @throws {TaxReportingFailure} When batch identity, scope, or persistence is invalid.
 */
export class ReviewLegacyVatSourcesBatch {
  constructor(private readonly reviewer: RecordReviewedLegacyVatSource, private readonly batch: TaxReportingFactBatchRepository) {}

  /** Builds a preview outcome for each selected source, then commits all eligible facts atomically.
   * @param input - Selected source evidence, tenant scope, actor, direction, and batch idempotency key.
   * @returns Per-source accepted/rejected results and replay status.
   * @throws {TaxReportingFailure} When the request is malformed or atomic persistence fails.
   */
  async execute(input: { readonly scope: TaxReportingScope; readonly direction: LegacyVatReadDirection; readonly actorId: string; readonly idempotencyKey: string; readonly items: readonly LegacyVatBatchReviewItem[] }): Promise<{ readonly items: readonly LegacyVatBatchReviewResult[]; readonly replayed: boolean }> {
    if (!input.actorId.trim() || !/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey) || input.items.length < 1 || input.items.length > 100) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Batch needs a stable key and between one and one hundred selected sources.");
    const sourceIds = input.items.map((item) => item.sourceId.trim());
    if (sourceIds.some((id) => !id) || new Set(sourceIds).size !== sourceIds.length) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Batch source identities must be unique and non-empty.");
    const outcomes: LegacyVatBatchReviewResult[] = [];
    const eligible: { readonly index: number; readonly fact: Awaited<ReturnType<RecordReviewedLegacyVatSource["review"]>>; readonly idempotencyKey: string }[] = [];
    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index]!;
      try {
        const fact = await this.reviewer.review({ ...item, scope: input.scope, direction: input.direction, actorId: input.actorId });
        if (fact.reconciliation.state === "issue") {
          outcomes[index] = { sourceId: item.sourceId, status: "rejected", reason: fact.reconciliation.reason ?? "El documento tiene evidencia pendiente de conciliación." };
        } else {
          eligible.push({ index, fact, idempotencyKey: `${input.idempotencyKey}:${index}` });
        }
      } catch (cause) {
        outcomes[index] = { sourceId: item.sourceId, status: "rejected", reason: cause instanceof Error ? cause.message : "No fue posible validar la fuente." };
      }
    }
    if (!eligible.length) return { items: outcomes, replayed: false };
    const persisted = await this.batch.persistBatch({ scope: input.scope, actorId: input.actorId, idempotencyKey: input.idempotencyKey, facts: eligible.map(({ fact, idempotencyKey }) => ({ fact, idempotencyKey })) });
    eligible.forEach(({ index, fact }) => { outcomes[index] = { sourceId: input.items[index]!.sourceId, status: "incorporated", factId: fact.id }; });
    return { items: outcomes, replayed: persisted.replayed };
  }
}

import {
  fiscalDocumentLineId,
  fiscalTaxDetermination,
  type FiscalTaxCategory,
  type FiscalTaxDetermination,
  type FiscalTaxSource,
} from "@kontave/fiscal/domain";
import type { TaxDecision, TaxTreatment } from "../domain";

/** Maps a shared tax decision into the immutable fiscal-document tax snapshot. @param decision - Previously resolved tax decision and provenance. @returns Validated fiscal determination. @throws {FiscalFailure} When the snapshot violates fiscal-document invariants. */
export function toFiscalTaxDetermination(decision: TaxDecision): FiscalTaxDetermination {
  return fiscalTaxDetermination({
    taxCode: decision.taxCode,
    category: fiscalCategory(decision.treatment),
    ...(decision.category === undefined || decision.category === null ? {} : { taxCategory: decision.category }),
    ...(decision.legacyRateSlot === undefined || decision.legacyRateSlot === null ? {} : { legacyRateSlot: decision.legacyRateSlot }),
    ...(decision.component === undefined ? {} : { component: decision.component }),
    calculationMode: decision.calculationMode,
    rate: decision.rate,
    taxableBase: decision.taxableBase,
    amount: decision.amount,
    jurisdiction: decision.jurisdiction,
    ruleVersion: decision.ruleVersion,
    legalBasis: decision.legalBasis,
    source: fiscalSource(decision),
  });
}

/** Maps an ordered set of decisions while retaining one deterministic snapshot per source. @param decisions - Decisions resolved by the taxation package. @returns Immutable fiscal determinations in input order. @throws {FiscalFailure} When any determination fails fiscal validation. */
export function toFiscalTaxDeterminations(decisions: readonly TaxDecision[]): readonly FiscalTaxDetermination[] {
  return Object.freeze(decisions.map(toFiscalTaxDetermination));
}

function fiscalCategory(treatment: TaxTreatment): FiscalTaxCategory {
  return treatment === "taxed" ? "taxable" : treatment;
}

function fiscalSource(decision: TaxDecision): FiscalTaxSource {
  if (decision.source.kind === "document") return { kind: "document" };
  return decision.source.kind === "line"
    ? { kind: "line", lineId: fiscalDocumentLineId(decision.source.reference) }
    : { kind: "payment", paymentKey: decision.source.reference };
}

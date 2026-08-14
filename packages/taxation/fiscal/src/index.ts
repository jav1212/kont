import {
  fiscalDocumentLineId,
  fiscalTaxDetermination,
  type FiscalTaxCategory,
  type FiscalTaxDetermination,
  type FiscalTaxSource,
} from "@kontave/fiscal-domain";
import type { TaxDecision, TaxTreatment } from "@kontave/taxation-domain";

export function toFiscalTaxDetermination(decision: TaxDecision): FiscalTaxDetermination {
  return fiscalTaxDetermination({
    taxCode: decision.taxCode,
    category: fiscalCategory(decision.treatment),
    calculationMode: decision.calculationMode,
    rate: decision.rate,
    taxableBase: decision.taxableBase,
    amount: decision.amount,
    jurisdiction: decision.jurisdiction,
    ruleVersion: decision.ruleVersion,
    source: fiscalSource(decision),
  });
}

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

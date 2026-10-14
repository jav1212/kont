import { addMoney, moneyFromMinor, sameCurrency, subtractMoney, type Money } from "@kontave/monetary/domain";
import { TaxReportingFailure, vatDeclaration, type TaxReportingFact, type VatDeclaration, type VatFormTemplate } from "../domain";

/** Declaration persistence port keeps revision/CAS and lifecycle append-only. */
export interface VatDeclarationRepository {
  /**
   * Saves one immutable declaration revision.
   * @param input - Declaration snapshot, actor, idempotency key, and expected revision.
   * @returns Persisted revision and whether an exact command replayed.
   * @throws {TaxReportingFailure} When authorization, idempotency, or revision checks fail.
   */
  save(input: { readonly declaration: VatDeclaration; readonly actorId: string; readonly idempotencyKey: string; readonly expectedRevision: number | null }): Promise<{ readonly declaration: VatDeclaration; readonly replayed: boolean }>;
}

/** Prepares an internal declaration only from reconciled, source-unique facts. */
export class PrepareVatDeclaration {
  /**
   * Creates a declaration preparation use case.
   * @param declarations - Atomic declaration persistence port.
   * @returns A declaration preparation service.
   */
  constructor(private readonly declarations: VatDeclarationRepository) {}

  /**
   * Creates an internal declaration snapshot from facts belonging to one exact tenant scope.
   *
   * The amount calculation uses only the historical fact snapshots and explicit carry-forward
   * and adjustment values supplied for this revision; current tax rules are never consulted.
   *
   * @param input - Facts and carry-forward snapshots for one internal form version.
   * @returns Versioned declaration draft and replay status.
   * @throws {TaxReportingFailure} When scope, reconciliation, currency, or lineage is invalid.
   */
  async execute(input: {
    readonly id: string;
    readonly scope: VatDeclaration["scope"];
    readonly period: string;
    readonly facts: readonly TaxReportingFact[];
    readonly template: VatFormTemplate;
    readonly carryForwardIn: Money;
    readonly adjustments: Money;
    readonly actorId: string;
    readonly idempotencyKey: string;
    readonly expectedRevision: number | null;
    readonly createdAt: string;
  }): Promise<{ readonly declaration: VatDeclaration; readonly replayed: boolean }> {
    if (!input.actorId.trim() || !input.idempotencyKey.trim() || input.idempotencyKey.trim().length > 128) {
      throw invalid("Declaration preparation requires an actor and bounded idempotency key.");
    }
    if (input.facts.length === 0) throw invalid("A declaration requires source facts.");

    const issueIds = input.facts
      .filter((fact) => fact.reconciliation.state === "issue"
        || fact.deductible.state === "pending_review"
        || fact.rateBreakdowns.some((item) => item.category === "unknown"))
      .map((fact) => fact.id);
    if (issueIds.length > 0) throw invalid("Unreconciled facts require review before preparation.");

    const factIds = new Set<string>();
    const lineage = new Set<string>();
    for (const fact of input.facts) {
      if (!sameScope(fact.scope, input.scope)
        || fact.period !== input.period
        || factIds.has(fact.id)
        || lineage.has(fact.source.lineageKey)) {
        throw invalid("Facts must be unique and belong to the exact declaration scope and period.");
      }
      factIds.add(fact.id);
      lineage.add(fact.source.lineageKey);
    }

    const zero = moneyFromMinor(0n, input.carryForwardIn.currency);
    let debit = zero;
    let credit = zero;
    let withheld = zero;
    let payable: Money;
    try {
      if (!sameCurrency(input.adjustments.currency, input.carryForwardIn.currency)) throw new Error("Mixed declaration currency.");
      for (const fact of input.facts) {
        if (!sameCurrency(fact.currency, input.carryForwardIn.currency)) throw new Error("Mixed fact currency.");
        if (fact.direction === "sale") debit = addMoney(debit, fact.signed.taxAmount);
        if (fact.direction !== "sale" && fact.deductible.state === "eligible") credit = addMoney(credit, fact.deductible.amount);
        if (fact.withholding !== null) withheld = addMoney(withheld, fact.withholding.amount);
      }
      payable = subtractMoney(subtractMoney(addMoney(debit, input.carryForwardIn), addMoney(credit, withheld)), input.adjustments);
    } catch {
      throw new TaxReportingFailure("TAX_REPORTING_DECLARATION_INVALID", "Declaration money snapshots and adjustments must use one currency.");
    }

    const declaration = vatDeclaration({
      id: input.id,
      scope: input.scope,
      period: input.period,
      revision: (input.expectedRevision ?? 0) + 1,
      status: "prepared",
      summary: { debitTax: debit, deductibleCredit: credit, withheldTax: withheld, carryForwardIn: input.carryForwardIn, adjustments: input.adjustments, payable },
      template: input.template,
      factIds: input.facts.map((fact) => fact.id),
      reconciliationIssueFactIds: [],
      submittedEvidence: null,
      voidEvidence: null,
      payments: [],
      createdAt: input.createdAt,
    });
    return this.declarations.save({
      declaration,
      actorId: input.actorId.trim(),
      idempotencyKey: input.idempotencyKey.trim(),
      expectedRevision: input.expectedRevision,
    });
  }
}

function sameScope(left: VatDeclaration["scope"], right: VatDeclaration["scope"]): boolean {
  return left.tenantId === right.tenantId
    && left.organizationId === right.organizationId
    && left.companyId === right.companyId;
}

function invalid(message: string): TaxReportingFailure {
  return new TaxReportingFailure("TAX_REPORTING_DECLARATION_INVALID", message);
}

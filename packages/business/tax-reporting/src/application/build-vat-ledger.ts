import { addMoney, type Money } from "@kontave/monetary/domain";
import { TaxReportingFailure, taxReportingFactPageRequest, type TaxReportingFact, type TaxReportingFactPageRequest, type TaxReportingFactRepository, type TaxReportingScope, type VatRateBreakdown, type TaxReportingCursor } from "../domain";
/** Historical tax total grouped by rate, legal category, component, rule version, and currency. */
export interface VatLedgerRateGroup {
  /** Exact historical percentage, retained as a decimal string. */
  readonly rate: string;
  /** Fiscal treatment saved with the source fact. */
  readonly category: VatRateBreakdown["category"];
  /** Legal component represented by this rate. */
  readonly component: VatRateBreakdown["component"];
  /** Version of the rule used when the source determination was saved. */
  readonly ruleVersion: string | null;
  /** Sum of source bases in the group's historical currency. */
  readonly taxableBase: Money;
  /** Sum of source tax amounts in the group's historical currency. */
  readonly taxAmount: Money;
}

/** Historical withholding total grouped by legal direction and currency. */
export interface VatLedgerWithholdingGroup {
  /** Whether the company withheld tax or another party withheld it from the company. */
  readonly kind: "practiced" | "suffered";
  /** Sum of source withholding amounts in their historical currency. */
  readonly amount: Money;
}

/** Source-traceable ledger page with rate totals and a stable continuation cursor. */
export interface VatLedgerPage {
  /** Immutable historical facts included in this page. */
  readonly facts: readonly TaxReportingFact[];
  /** Historical rate totals separated by every dimension needed to avoid unlike aggregation. */
  readonly rateGroups: readonly VatLedgerRateGroup[];
  /** Historical withholding totals separated by direction and currency. */
  readonly withholdingGroups: readonly VatLedgerWithholdingGroup[];
  /** Cursor for the next page, or `null` when this result ends the requested range. */
  readonly nextCursor: TaxReportingCursor | null;
}

/** Builds a source-traceable VAT ledger without consulting current tax rules. */
export class BuildVatLedger {
  /**
   * Creates the historical VAT ledger builder.
   * @param facts - Repository that revalidates the reader's scope and returns saved facts.
   * @returns A source-traceable ledger query service.
   */
  constructor(private readonly facts: TaxReportingFactRepository) {}

  /**
   * Reads one page and aggregates only like historical rate and withholding facts.
   * @param scope - Tenant, organization, and company that own the ledger.
   * @param request - Date range and keyset pagination request.
   * @param actorId - Authenticated reader; persistence revalidates access for this actor.
   * @returns Historical rows, dimension-preserving totals, and the next cursor.
   * @throws {TaxReportingFailure} When the actor is missing or incompatible monetary values are returned.
   */
  async execute(scope: TaxReportingScope, request: TaxReportingFactPageRequest, actorId: string): Promise<VatLedgerPage> {
    if (!actorId.trim()) throw new TaxReportingFailure("TAX_REPORTING_SCOPE", "Ledger access requires an authenticated actor.");
    const page = await this.facts.list(scope, taxReportingFactPageRequest(request), actorId.trim());
    const groups = new Map<string, VatLedgerRateGroup>();
    const withholdingGroups = new Map<string, VatLedgerWithholdingGroup>();
    for (const fact of page.items) for (const item of fact.rateBreakdowns) {
      const component = item.component ?? "base";
      const ruleVersion = item.ruleVersion;
      const key = JSON.stringify([component, item.category, item.rate, ruleVersion, item.taxableBase.currency.code, item.taxableBase.currency.minorUnit]);
      const current = groups.get(key);
      if (current === undefined) groups.set(key, { rate: item.rate, category: item.category, component, ruleVersion, taxableBase: item.taxableBase, taxAmount: item.taxAmount });
      else { try { groups.set(key, { ...current, taxableBase: addMoney(current.taxableBase, item.taxableBase), taxAmount: addMoney(current.taxAmount, item.taxAmount) }); } catch { throw new TaxReportingFailure("TAX_REPORTING_INVALID", "A ledger range cannot aggregate multiple currencies."); } }
    }
    for (const fact of page.items) {
      if (fact.withholding === null) continue;
      const { kind, amount } = fact.withholding;
      const key = `${kind}:${amount.currency.code}:${amount.currency.minorUnit}`;
      const current = withholdingGroups.get(key);
      try {
        withholdingGroups.set(key, { kind, amount: current === undefined ? amount : addMoney(current.amount, amount) });
      } catch {
        throw new TaxReportingFailure("TAX_REPORTING_INVALID", "A ledger range cannot aggregate incompatible withholding currencies.");
      }
    }
    return { facts: page.items, rateGroups: [...groups.values()], withholdingGroups: [...withholdingGroups.values()], nextCursor: page.nextCursor };
  }
}

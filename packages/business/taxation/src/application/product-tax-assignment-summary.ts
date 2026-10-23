import { TaxationFailure, type TaxationDate, type TaxRuleCategory, type TaxTreatment } from "../domain";
import type { TaxationContext } from "./index";

/** Active products sharing one effective IVA treatment and category. */
export interface ProductTaxAssignmentGroup {
  readonly treatment: TaxTreatment;
  readonly category: TaxRuleCategory | null;
  readonly products: number;
}

/** Company-wide count of active products by their IVA assignment effective on a date. */
export interface ProductTaxAssignmentSummary {
  readonly on: TaxationDate;
  readonly activeProducts: number;
  /** Active products with no effective IVA assignment; they are never classified by default. */
  readonly unassigned: number;
  /** Products whose legacy catalogue type disagrees with their effective IVA assignment. */
  readonly legacyMismatch: number;
  readonly groups: readonly ProductTaxAssignmentGroup[];
}

/** Read port for product IVA assignment counts owned by the taxation capability. */
export interface ProductTaxAssignmentSummaryReader {
  /**
   * Counts active company products by effective IVA assignment.
   * @param context - Authorized actor, organization, and company scope.
   * @param on - Date on which assignments must be effective.
   * @returns Counts by treatment and category plus unassigned and inconsistent products.
   * @throws {TaxationFailure} When the actor cannot read the company or persistence is unavailable.
   */
  summarize(context: TaxationContext, on: TaxationDate): Promise<ProductTaxAssignmentSummary>;
}

/** Reads product IVA assignment counts for the fiscal configuration view. */
export class SummarizeProductTaxAssignments {
  /**
   * Creates the summary reader.
   * @param reader - Company-scoped assignment count port.
   * @returns Product assignment summary action.
   */
  constructor(private readonly reader: ProductTaxAssignmentSummaryReader) {}
  /**
   * Reads counts and rejects summaries whose groups do not add up to the assigned products.
   * @param context - Authorized actor and company scope.
   * @param on - Effective date for assignments.
   * @returns Consistent product assignment summary.
   * @throws {TaxationFailure} When access is denied, persistence fails, or the counts are inconsistent.
   */
  async execute(context: TaxationContext, on: TaxationDate): Promise<ProductTaxAssignmentSummary> {
    const summary = await this.reader.summarize(context, on);
    const assigned = summary.groups.reduce((total, group) => total + group.products, 0);
    if (assigned + summary.unassigned !== summary.activeProducts) {
      throw new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Product tax assignment counts are inconsistent.");
    }
    return summary;
  }
}

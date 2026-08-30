import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import type { ProductId } from "@kontave/products-domain";
import {
  TaxationFailure,
  resolveTaxRule,
  type ProductTaxAssignment,
  type ProductTaxProfile,
  type TaxCode,
  type TaxRule,
  type TaxTreatment,
} from "@kontave/taxation-domain";

/** Actor and tenant scope required by product-taxation operations. */
export interface TaxationContext {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}

/** Input required to change a product tax treatment. */
export interface SetProductTaxTreatmentInput extends TaxationContext {
  readonly productId: ProductId;
  readonly taxCode: TaxCode;
  readonly treatment: TaxTreatment;
  readonly effectiveFrom: string;
  readonly legalBasis: string;
  readonly expectedVersion: number;
}

/** Persistence port owned by the taxation application layer. */
export interface ProductTaxationRepository {
  /** @returns The product tax profile, or `null` when it has not been classified. */
  getProfile(context: TaxationContext, productId: ProductId): Promise<ProductTaxProfile | null>;
  /** @returns Rules matching a tax code and jurisdiction. */
  listRules(code: TaxCode, jurisdiction: string): Promise<readonly TaxRule[]>;
  /** @returns The authoritative profile after changing treatment. */
  setTreatment(input: SetProductTaxTreatmentInput): Promise<ProductTaxProfile>;
}

/** Tax profile, effective assignment and legal rule resolved for one date. */
export interface ResolvedProductTaxation {
  readonly profile: ProductTaxProfile;
  readonly assignment: ProductTaxAssignment;
  readonly rule: TaxRule;
}

/** Resolves the effective tax classification and legal rule for a product. */
export class GetResolvedProductTaxation {
  /** @param repository - Product-taxation persistence port. */
  constructor(private readonly repository: ProductTaxationRepository) {}

  /**
   * @param context - Actor, organization and company scope.
   * @param productId - Product whose taxation is requested.
   * @param taxCode - Tax code to resolve.
   * @param date - Effective local date in `YYYY-MM-DD` format.
   * @returns The profile, effective assignment and matching legal rule.
   * @throws {TaxationFailure} When classification, rule resolution or persistence fails.
   */
  execute(
    context: TaxationContext,
    productId: ProductId,
    taxCode: TaxCode,
    date: string,
  ): Promise<ResolvedProductTaxation> {
    return taxationCall(async () => {
      const profile = await this.repository.getProfile(context, productId);
      if (!profile) {
        throw new TaxationFailure(
          "TAXATION_PROFILE_NOT_FOUND",
          "Product taxation profile was not found.",
        );
      }
      const assignment = profile.assignmentAt(taxCode, date);
      const rules = await this.repository.listRules(taxCode, profile.jurisdiction);
      const rule = resolveTaxRule({
        rules,
        taxCode,
        treatment: assignment.treatment,
        jurisdiction: profile.jurisdiction,
        date,
      });
      return { profile, assignment, rule };
    });
  }
}

/** Changes a product tax treatment using optimistic concurrency. */
export class SetProductTaxTreatment {
  /** @param repository - Product-taxation persistence port. */
  constructor(private readonly repository: ProductTaxationRepository) {}

  /**
   * @param input - Scope, classification, legal basis and expected version.
   * @returns The authoritative updated tax profile.
   * @throws {TaxationFailure} When validation, concurrency or persistence fails.
   */
  execute(input: SetProductTaxTreatmentInput): Promise<ProductTaxProfile> {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new TaxationFailure(
        "TAXATION_PROFILE_INVALID",
        "Expected taxation version is invalid.",
      );
    }
    if (!input.legalBasis.trim()) {
      throw new TaxationFailure(
        "TAXATION_PROFILE_INVALID",
        "Tax classification legal basis is required.",
      );
    }
    return taxationCall(() => this.repository.setTreatment(input));
  }
}

async function taxationCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof TaxationFailure) throw cause;
    throw new TaxationFailure(
      "TAXATION_REPOSITORY_UNAVAILABLE",
      "Taxation repository is unavailable.",
      { cause },
    );
  }
}

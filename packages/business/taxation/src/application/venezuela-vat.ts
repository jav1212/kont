import type { ProductId } from "@kontave/products/domain";
import type { Money, RoundingMode } from "@kontave/monetary/domain";
import {
  TaxationFailure,
  type TaxRule,
} from "../domain";
import type { ProductTaxationRepository, TaxationConfigurationRepository, TaxationContext } from "./index";
import {
  resolveVenezuelanVatComponents,
  VENEZUELAN_IVA,
} from "../venezuela";
import type { TaxDecision, TaxPriceMode } from "../domain";

/** Explicitly approved legal IVA component attached to a product operation. */
export interface VenezuelanVatComponentSelection {
  readonly ruleId: TaxRule["id"];
  readonly source: { readonly kind: "line" | "payment"; readonly reference: string };
  /** Required for payment-linked IVA and expressed in the invoice currency. */
  readonly taxableBase?: Money;
}

/** Backward-compatible product-oriented name for an explicit component selection. */
export type ProductVatComponentSelection = VenezuelanVatComponentSelection;

/** Inputs needed to resolve product IVA from company-owned classification and shared effective rules. */
export interface ResolveProductVenezuelanVatInput extends TaxationContext {
  readonly productId: ProductId;
  readonly operationDate: string;
  readonly lineReference: string;
  readonly lineAmount: Money;
  readonly roundingMode: RoundingMode;
  readonly priceMode?: TaxPriceMode;
  /** Additional components already determined to apply by the authorized operation workflow. */
  readonly additionalComponents?: readonly VenezuelanVatComponentSelection[];
}

/** Resolves an auditable product IVA snapshot through the owning taxation repository. */
export class ResolveProductVenezuelanVat {
  /**
   * Creates the product IVA resolver.
   * @param products - Company-scoped product profiles and legacy legal-rule reader.
   * @param configuration - Company-scoped versioned tax-rule catalog reader.
   * @returns A resolver that produces immutable base and component decisions.
   * @throws {TaxationFailure} When construction dependencies are invalid.
   */
  constructor(
    private readonly products: ProductTaxationRepository,
    private readonly configuration: TaxationConfigurationRepository,
  ) {}

  /**
   * Resolves base IVA and explicitly selected additional components for one product line.
   * @param input - Authorized company scope, product line values, date and applicable components.
   * @returns Decisions in deterministic base-then-component order for fiscal snapshot mapping.
   * @throws {TaxationFailure} When profile, effective rules, component selection or persistence is invalid.
   */
  async execute(input: ResolveProductVenezuelanVatInput): Promise<readonly TaxDecision[]> {
    try {
      const profile = await this.products.getProfile(input, input.productId);
      if (!profile) throw new TaxationFailure("TAXATION_PROFILE_NOT_FOUND", "Product tax profile was not found.");
      if (profile.companyId !== input.companyId || profile.productId !== input.productId) {
        throw new TaxationFailure("TAXATION_ACCESS_DENIED", "Product tax profile is outside the requested company scope.");
      }
      const catalog = await this.configuration.getCompanyTaxRuleCatalog(input);
      if (catalog.companyId !== input.companyId) {
        throw new TaxationFailure("TAXATION_ACCESS_DENIED", "Tax rule catalog is outside the requested company scope.");
      }
      const rules = catalog.version > 0
        ? catalog.rules.filter((rule) => rule.taxCode === VENEZUELAN_IVA && rule.jurisdiction === profile.jurisdiction)
        : await this.products.listRules(VENEZUELAN_IVA, profile.jurisdiction);
      const selectedComponents = (input.additionalComponents ?? []).map((selection) => {
        const candidates = rules.filter((rule) => rule.id === selection.ruleId);
        if (candidates.length !== 1) throw new TaxationFailure("TAXATION_RULE_MISSING", "Selected IVA component rule was not found uniquely.");
        const rule = candidates[0];
        if (!rule) throw new TaxationFailure("TAXATION_RULE_MISSING", "Selected IVA component rule was not found.");
        return { rule, source: selection.source, ...(selection.taxableBase === undefined ? {} : { taxableBase: selection.taxableBase }) };
      });
      return resolveVenezuelanVatComponents({
        profile,
        rules,
        operationDate: input.operationDate,
        lineReference: input.lineReference,
        lineAmount: input.lineAmount,
        roundingMode: input.roundingMode,
        ...(input.priceMode === undefined ? {} : { priceMode: input.priceMode }),
        additionalComponents: selectedComponents,
      });
    } catch (cause: unknown) {
      if (cause instanceof TaxationFailure) throw cause;
      throw new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Product or tax-configuration repository is unavailable.", { cause });
    }
  }
}

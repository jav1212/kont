import type { Money, RoundingMode } from "@kontave/monetary/domain";
import type { TaxRule } from "../domain";
import { TaxationFailure } from "../domain";
import type { ServiceTaxationRepository, TaxationContext, TaxationConfigurationRepository } from "./index";
import type { TaxPriceMode, TaxDecision } from "../domain";
import { resolveVenezuelanVatComponents, VENEZUELAN_IVA } from "../venezuela";
import type { VenezuelanVatComponentSelection } from "./venezuela-vat";

/** Inputs for effective service IVA resolution and fiscal snapshot creation. */
export interface ResolveServiceVenezuelanVatInput extends TaxationContext {
  readonly serviceCode: string;
  readonly operationDate: string;
  readonly lineReference: string;
  readonly lineAmount: Money;
  readonly roundingMode: RoundingMode;
  readonly priceMode?: TaxPriceMode;
  /** Components explicitly selected by the authorized invoice or payment workflow. */
  readonly additionalComponents?: readonly VenezuelanVatComponentSelection[];
}

/** Tax decisions and classification audit snapshot for one resolved service line. */
export interface ResolvedServiceVenezuelanVat {
  readonly unitCode: string;
  readonly classificationVersion: string;
  readonly classificationLegalBasis: string;
  readonly determinations: readonly TaxDecision[];
}

/** Resolves Venezuelan IVA decisions for one company-classified service line. */
export class ResolveServiceVenezuelanVat {
  /**
   * Creates a service IVA resolver.
   * @param services - Company-scoped service profiles and legacy rules.
   * @param configuration - Company-scoped versioned tax-rule catalog reader.
   * @returns A resolver for service-line IVA snapshots.
   * @throws {TaxationFailure} When dependencies cannot be used by the application.
   */
  constructor(
    private readonly services: ServiceTaxationRepository,
    private readonly configuration: TaxationConfigurationRepository,
  ) {}

  /**
   * Resolves base IVA and selected components using the profile effective on the operation date.
   * @param input - Authorized scope, service line, operation date and applicable components.
   * @returns Immutable base-first tax decisions for mapping to fiscal snapshots.
   * @throws {TaxationFailure} When classification, rule, scope or persistence validation fails.
   */
  async execute(input: ResolveServiceVenezuelanVatInput): Promise<ResolvedServiceVenezuelanVat> {
    try {
      const profile = await this.services.getProfile(input, input.serviceCode);
      if (!profile) throw new TaxationFailure("TAXATION_PROFILE_NOT_FOUND", "Service tax profile was not found.");
      if (profile.companyId !== input.companyId || profile.serviceCode !== input.serviceCode.trim()) {
        throw new TaxationFailure("TAXATION_ACCESS_DENIED", "Service tax profile is outside the requested company scope.");
      }
      const catalog = await this.configuration.getCompanyTaxRuleCatalog(input);
      if (catalog.companyId !== input.companyId) {
        throw new TaxationFailure("TAXATION_ACCESS_DENIED", "Tax rule catalog is outside the requested company scope.");
      }
      const rules = catalog.version > 0
        ? catalog.rules.filter((rule) => rule.taxCode === VENEZUELAN_IVA && rule.jurisdiction === profile.jurisdiction)
        : await this.services.listRules(VENEZUELAN_IVA, profile.jurisdiction);
      const selectedComponents = (input.additionalComponents ?? []).map((selection) => {
        const candidates = rules.filter((rule) => rule.id === selection.ruleId);
        if (candidates.length !== 1) throw new TaxationFailure("TAXATION_RULE_MISSING", "Selected IVA component rule was not found uniquely.");
        const rule: TaxRule | undefined = candidates[0];
        if (!rule) throw new TaxationFailure("TAXATION_RULE_MISSING", "Selected IVA component rule was not found.");
        return { rule, source: selection.source, ...(selection.taxableBase === undefined ? {} : { taxableBase: selection.taxableBase }) };
      });
      const assignment = profile.assignmentAt(VENEZUELAN_IVA, input.operationDate);
      const determinations = resolveVenezuelanVatComponents({
        profile,
        rules,
        operationDate: input.operationDate,
        lineReference: input.lineReference,
        lineAmount: input.lineAmount,
        roundingMode: input.roundingMode,
        ...(input.priceMode === undefined ? {} : { priceMode: input.priceMode }),
        additionalComponents: selectedComponents,
      });
      return Object.freeze({
        unitCode: profile.unitCode,
        classificationVersion: assignment.classificationVersion,
        classificationLegalBasis: assignment.legalBasis,
        determinations,
      });
    } catch (cause: unknown) {
      if (cause instanceof TaxationFailure) throw cause;
      throw new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Service or tax-configuration repository is unavailable.", { cause });
    }
  }
}

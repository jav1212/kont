import type { TaxationContext } from "./index";
import {
  resolveTaxRule,
  taxationDate,
  TaxationFailure,
  type ServiceTaxAssignment,
  type ServiceTaxProfile,
  type TaxCode,
  type TaxRule,
  type TaxTreatment,
} from "../domain";

/** Input required to change the effective tax treatment of a service code. */
export interface SetServiceTaxTreatmentInput extends TaxationContext {
  readonly serviceCode: string;
  readonly unitCode: string;
  readonly jurisdiction: string;
  readonly taxCode: TaxCode;
  readonly treatment: TaxTreatment;
  readonly effectiveFrom: string;
  readonly legalBasis: string;
  readonly expectedVersion: number;
}

/** Persistence port for service classifications and shared legal tax rules. */
export interface ServiceTaxationRepository {
  /**
   * Reads one company-owned service classification.
   * @param context - Authorized actor, organization, and company scope.
   * @param serviceCode - Stable code assigned to the service line.
   * @returns The profile, or `null` when the code has not been classified.
   */
  getProfile(context: TaxationContext, serviceCode: string): Promise<ServiceTaxProfile | null>;
  /**
   * Lists legal rules for a tax and jurisdiction.
   * @param code - Tax code to list.
   * @param jurisdiction - Jurisdiction code.
   * @returns Candidate rules; application policy resolves the effective unique rule.
   */
  listRules(code: TaxCode, jurisdiction: string): Promise<readonly TaxRule[]>;
  /**
   * Saves a versioned effective classification.
   * @param input - Scope, service code, treatment, effective date, legal basis, and expected version.
   * @returns The authoritative updated profile.
   */
  setTreatment(input: SetServiceTaxTreatmentInput): Promise<ServiceTaxProfile>;
}

/** Effective service assignment and matching legal rule for an operation date. */
export interface ResolvedServiceTaxation {
  readonly profile: ServiceTaxProfile;
  readonly assignment: ServiceTaxAssignment;
  readonly rule: TaxRule;
}

/** Reads a company service tax profile without resolving it to a specific date. */
export class GetServiceTaxProfile {
  /**
   * Creates a service tax-profile query.
   * @param repository - Company-scoped service tax persistence port.
   */
  constructor(private readonly repository: ServiceTaxationRepository) {}

  /**
   * Returns the versioned profile used to classify a service code.
   * @param context - Authorized actor, organization, and company scope.
   * @param serviceCode - Stable code assigned to a service line.
   * @returns The stored profile, or `null` when it has not been configured.
   * @throws {TaxationFailure} When the service code or persistence request is invalid.
   */
  async execute(context: TaxationContext, serviceCode: string): Promise<ServiceTaxProfile | null> {
    const code = serviceCode.trim();
    if (!code || code.length > 128) throw new TaxationFailure("TAXATION_PROFILE_INVALID", "Service code is invalid.");
    try {
      return await this.repository.getProfile(context, code);
    } catch (cause: unknown) {
      if (cause instanceof TaxationFailure) throw cause;
      throw new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Service taxation repository is unavailable.", { cause });
    }
  }
}

/** Resolves the effective service classification against the legal rule catalogue. */
export class GetResolvedServiceTaxation {
  /**
   * Creates a resolver for persisted service classifications and legal rules.
   * @param repository - Company scoped classification and rule persistence port.
   */
  constructor(private readonly repository: ServiceTaxationRepository) {}

  /**
   * Resolves one service code for an operation date.
   * @param context - Authorized actor, organization, and company scope.
   * @param serviceCode - Stable code stored on the sales line.
   * @param code - Tax code to resolve.
   * @param date - Effective local date in `YYYY-MM-DD` format.
   * @returns The profile, effective assignment, and unique legal rule.
   * @throws {TaxationFailure} When classification or a unique rule is missing or invalid.
   */
  async execute(context: TaxationContext, serviceCode: string, code: TaxCode, date: string): Promise<ResolvedServiceTaxation> {
    try {
      const normalizedCode = serviceCode.trim();
      if (!normalizedCode || normalizedCode.length > 128) throw new TaxationFailure("TAXATION_PROFILE_INVALID", "Service code is invalid.");
      const operationDate = taxationDate(date);
      const profile = await this.repository.getProfile(context, normalizedCode);
      if (!profile) throw new TaxationFailure("TAXATION_PROFILE_NOT_FOUND", "Service tax profile was not found.");
      const assignment = profile.assignmentAt(code, operationDate);
      const rules = await this.repository.listRules(code, profile.jurisdiction);
      const rule = resolveTaxRule({ rules, taxCode: code, treatment: assignment.treatment, jurisdiction: profile.jurisdiction, date: operationDate });
      return { profile, assignment, rule };
    } catch (cause: unknown) {
      if (cause instanceof TaxationFailure) throw cause;
      throw new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Service taxation repository is unavailable.", { cause });
    }
  }
}

/** Changes a service classification using optimistic version control. */
export class SetServiceTaxTreatment {
  /**
   * Creates a service classification command.
   * @param repository - Persistence port for service classifications.
   */
  constructor(private readonly repository: ServiceTaxationRepository) {}

  /**
   * Records a new effective treatment and legal basis.
   * @param input - Scope, service code, tax treatment, date, basis, and expected profile version.
   * @returns The persisted profile and its new version.
   * @throws {TaxationFailure} When validation, concurrency, or persistence fails.
   */
  async execute(input: SetServiceTaxTreatmentInput): Promise<ServiceTaxProfile> {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || !input.legalBasis.trim() || !input.jurisdiction.trim()
      || !input.unitCode.trim() || input.unitCode.trim().length > 32) {
      throw new TaxationFailure("TAXATION_PROFILE_INVALID", "Expected service version, jurisdiction, fiscal unit, and legal basis are required.");
    }
    taxationDate(input.effectiveFrom);
    if (!input.serviceCode.trim() || input.serviceCode.trim().length > 128) throw new TaxationFailure("TAXATION_PROFILE_INVALID", "Service code is invalid.");
    try {
      return await this.repository.setTreatment(input);
    } catch (cause: unknown) {
      if (cause instanceof TaxationFailure) throw cause;
      throw new TaxationFailure("TAXATION_REPOSITORY_UNAVAILABLE", "Service taxation repository is unavailable.", { cause });
    }
  }
}

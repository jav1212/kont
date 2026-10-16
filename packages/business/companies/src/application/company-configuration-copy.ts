import type { OrganizationId } from "@kontave/organizations/domain";
import {
  Company,
  CompanyCountry,
  CompanyFailure,
  CompanyStatus,
  companyPersonNature,
  companyVersion,
  normalizeCompanyConfigurationCopySections,
  taxId,
  type CompanyConfigurationCopySection,
  type CompanyId,
  type CompanyOperatingProfile,
  type CompanyPersonNature,
  type TaxId,
} from "../domain";
import {
  CompanyAdministrationPermission,
  type CompanyAdministrationScope,
} from "./index";

/** Exact company resource whose configuration is authorized for a copy operation. */
export interface CompanyConfigurationCopyAuthorizationScope extends CompanyAdministrationScope {
  readonly companyId: CompanyId | null;
}

/** Authorization boundary that evaluates source and destination company resources independently. */
export interface CompanyConfigurationCopyAuthorization {
  /**
   * Verifies an actor's permission against one source company or a destination company creation scope.
   * A null company ID is valid only for the destination of a new company, which does not exist yet.
   * @param scope - Actor, organization, and exact company resource or creation scope.
   * @param operation - Copy-specific business operation being authorized.
   * @param permission - Existing company permission required by that operation.
   * @returns Nothing when the scoped operation is allowed.
   * @throws {CompanyFailure} When access is denied or unavailable.
   */
  assertCanCopyCompanyConfiguration(
    scope: CompanyConfigurationCopyAuthorizationScope,
    operation: CompanyConfigurationCopyOperation,
    permission: CompanyAdministrationPermission,
  ): Promise<void>;
}

/** Copy-specific operations retained separately from generic company administration. */
export enum CompanyConfigurationCopyOperation {
  ReadSource = "read_company_configuration_source",
  CopyToExisting = "copy_company_configuration_to_existing",
  CreateFromExisting = "create_company_from_existing",
}

/** Explicit settings and source revisions selected for an identity-free configuration copy. */
export interface CompanyConfigurationCopySelection {
  readonly sections: readonly CompanyConfigurationCopySection[];
  /** Required only when `date_format` is selected; it pins the source immutable format revision. */
  readonly expectedSourceDateFormatVersion?: number;
  /** Required only when `monetary_policy` is selected; it pins the source immutable policy revision. */
  readonly expectedSourceMonetaryPolicyVersion?: number;
}

/** Target legal identity supplied by the caller when creating a company from an existing configuration. */
export interface CompanyCopyCreationTarget {
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: TaxId | null;
  readonly country: CompanyCountry;
  readonly personNature: CompanyPersonNature;
}

/** Shared source scope required by both copy cases. */
export interface CompanyConfigurationCopySourceScope extends CompanyAdministrationScope {
  readonly sourceCompanyId: CompanyId;
  /** Optimistic revision of the source company, including its operating profile. */
  readonly expectedSourceCompanyVersion: number;
  readonly selection: CompanyConfigurationCopySelection;
}

/** ADM-006 request to copy selected configuration to an existing company in the same organization. */
export interface CopyCompanyConfigurationToExistingCommand extends CompanyConfigurationCopySourceScope {
  readonly destinationCompanyId: CompanyId;
  /** Optimistic revision of the existing destination company. */
  readonly expectedDestinationCompanyVersion: number;
  /** Required only when `date_format` is selected; zero asserts that the destination has no format. */
  readonly expectedDestinationDateFormatVersion?: number;
  /** Required only when `monetary_policy` is selected; zero asserts that the destination has no policy. */
  readonly expectedDestinationMonetaryPolicyVersion?: number;
  readonly idempotencyKey: string;
}

/** ADM-004 request to create a distinct company and copy selected source configuration in one transaction. */
export interface CreateCompanyFromExistingCommand extends CompanyConfigurationCopySourceScope {
  readonly idempotencyKey: string;
  /** New legal identity. Source legal name, trade name, RIF, logo, and lifecycle are never copied. */
  readonly target: CompanyCopyCreationTarget;
}

/** Result returned only after a repository has atomically applied the selected typed settings. */
export interface CompanyConfigurationCopyResult {
  readonly company: Company;
  readonly copiedSections: readonly CompanyConfigurationCopySection[];
}

/** Atomic persistence port for ADM-004 and ADM-006. */
export interface CompanyConfigurationCopyRepository {
  /**
   * Locks both existing companies, verifies all expected revisions, reads source sidecars, and writes the selected target configuration atomically.
   * Implementations must derive the payload with `deriveCompanyConfigurationCopy`, and must not copy identity, logo, numbering, historical documents, inventory, payroll, or issued counters.
   * @param command - Authorized normalized command with source and destination revision expectations.
   * @returns The updated destination company and exactly copied sections, or the original idempotency receipt.
   * @throws {CompanyFailure} When a source setting is absent, a revision is stale, or idempotency conflicts.
   */
  copyToExisting(command: CopyCompanyConfigurationToExistingCommand): Promise<CompanyConfigurationCopyResult>;
  /**
   * Locks the source, creates a new company using only the supplied target identity, and writes selected configuration in one atomic operation.
   * @param command - Authorized normalized creation request with source revision expectations.
   * @returns The new company and exactly copied sections, or the original idempotency receipt.
   * @throws {CompanyFailure} When source configuration is absent, creation conflicts, or idempotency conflicts.
   */
  createFromExisting(command: CreateCompanyFromExistingCommand): Promise<CompanyConfigurationCopyResult>;
}

/** Copies explicitly selected, typed configuration from one existing company to another existing company. */
export class CopyCompanyConfigurationToExisting {
  /**
   * @param authorization - Resource-scoped source and destination authorization boundary.
   * @param repository - Atomic configuration-copy persistence boundary.
   */
  constructor(
    private readonly authorization: CompanyConfigurationCopyAuthorization,
    private readonly repository: CompanyConfigurationCopyRepository,
  ) {}

  /**
   * @param command - Source, destination, selected sidecars, revisions, and idempotency key.
   * @returns The updated destination after the atomic configuration transfer.
   * @throws {CompanyFailure} When unauthorized, invalid, stale, outside the same organization, or persistence rejects the request.
   */
  async execute(command: CopyCompanyConfigurationToExistingCommand): Promise<CompanyConfigurationCopyResult> {
    const normalized = normalizeExistingCopy(command);
    await this.authorization.assertCanCopyCompanyConfiguration(
      sourceAuthorizationScope(normalized),
      CompanyConfigurationCopyOperation.ReadSource,
      CompanyAdministrationPermission.Read,
    );
    await this.authorization.assertCanCopyCompanyConfiguration(
      { actorUserId: normalized.actorUserId, organizationId: normalized.organizationId, companyId: normalized.destinationCompanyId },
      CompanyConfigurationCopyOperation.CopyToExisting,
      CompanyAdministrationPermission.Update,
    );
    return assertCopyResult(normalized.organizationId, normalized.destinationCompanyId, normalized.selection.sections, await this.repository.copyToExisting(normalized));
  }
}

/** Creates a distinct legal company while atomically copying only selected typed source configuration. */
export class CreateCompanyFromExisting {
  /**
   * @param authorization - Resource-scoped source and organization-level destination authorization boundary.
   * @param repository - Atomic create-and-copy persistence boundary.
   */
  constructor(
    private readonly authorization: CompanyConfigurationCopyAuthorization,
    private readonly repository: CompanyConfigurationCopyRepository,
  ) {}

  /**
   * @param command - Source revisions, selected sidecars, new legal identity, and idempotency key.
   * @returns The newly created company after its selected configuration is committed atomically.
   * @throws {CompanyFailure} When unauthorized, invalid, stale, or persistence rejects the transaction.
   */
  async execute(command: CreateCompanyFromExistingCommand): Promise<CompanyConfigurationCopyResult> {
    const normalized = normalizeCreationCopy(command);
    await this.authorization.assertCanCopyCompanyConfiguration(
      sourceAuthorizationScope(normalized),
      CompanyConfigurationCopyOperation.ReadSource,
      CompanyAdministrationPermission.Read,
    );
    await this.authorization.assertCanCopyCompanyConfiguration(
      { actorUserId: normalized.actorUserId, organizationId: normalized.organizationId, companyId: null },
      CompanyConfigurationCopyOperation.CreateFromExisting,
      CompanyAdministrationPermission.Create,
    );
    return assertCopyResult(normalized.organizationId, null, normalized.selection.sections, await this.repository.createFromExisting(normalized));
  }
}

function normalizeExistingCopy(command: CopyCompanyConfigurationToExistingCommand): CopyCompanyConfigurationToExistingCommand {
  const common = normalizeSourceScope(command);
  if (common.sourceCompanyId === command.destinationCompanyId) invalid("The source and destination companies must differ.");
  companyVersion(command.expectedDestinationCompanyVersion);
  const selection = normalizeSelection(command.selection, {
    ...(command.expectedDestinationDateFormatVersion === undefined ? {} : { expectedDestinationDateFormatVersion: command.expectedDestinationDateFormatVersion }),
    ...(command.expectedDestinationMonetaryPolicyVersion === undefined ? {} : { expectedDestinationMonetaryPolicyVersion: command.expectedDestinationMonetaryPolicyVersion }),
  });
  return { ...command, ...common, idempotencyKey: normalizeIdempotencyKey(command.idempotencyKey), selection };
}

function normalizeCreationCopy(command: CreateCompanyFromExistingCommand): CreateCompanyFromExistingCommand {
  const common = normalizeSourceScope(command);
  const selection = normalizeSelection(command.selection);
  const target = normalizeTarget(command.organizationId, command.target);
  return { ...command, ...common, idempotencyKey: normalizeIdempotencyKey(command.idempotencyKey), selection, target };
}

function normalizeSourceScope(command: CompanyConfigurationCopySourceScope): Pick<CompanyConfigurationCopySourceScope, "sourceCompanyId" | "expectedSourceCompanyVersion"> {
  if (!command.actorUserId || !command.organizationId || !command.sourceCompanyId) invalid("The configuration copy scope is invalid.");
  companyVersion(command.expectedSourceCompanyVersion);
  return { sourceCompanyId: command.sourceCompanyId, expectedSourceCompanyVersion: command.expectedSourceCompanyVersion };
}

function normalizeSelection(
  selection: CompanyConfigurationCopySelection,
  destination?: Pick<CopyCompanyConfigurationToExistingCommand, "expectedDestinationDateFormatVersion" | "expectedDestinationMonetaryPolicyVersion">,
): CompanyConfigurationCopySelection {
  const sections = normalizeCompanyConfigurationCopySections(selection.sections);
  const dateSelected = sections.includes("date_format");
  const policySelected = sections.includes("monetary_policy");
  assertSelectedRevision(selection.expectedSourceDateFormatVersion, dateSelected, false, "source date format");
  assertSelectedRevision(selection.expectedSourceMonetaryPolicyVersion, policySelected, false, "source monetary policy");
  if (destination) {
    assertSelectedRevision(destination.expectedDestinationDateFormatVersion, dateSelected, true, "destination date format");
    assertSelectedRevision(destination.expectedDestinationMonetaryPolicyVersion, policySelected, true, "destination monetary policy");
  }
  return Object.freeze({
    sections,
    ...(dateSelected ? { expectedSourceDateFormatVersion: selection.expectedSourceDateFormatVersion! } : {}),
    ...(policySelected ? { expectedSourceMonetaryPolicyVersion: selection.expectedSourceMonetaryPolicyVersion! } : {}),
  });
}

function assertSelectedRevision(value: number | undefined, selected: boolean, zeroAllowed: boolean, label: string): void {
  if (!selected) {
    if (value !== undefined) invalid(`No ${label} revision may be supplied when that section is not selected.`);
    return;
  }
  if (!Number.isSafeInteger(value) || value === undefined || value < (zeroAllowed ? 0 : 1)) invalid(`The expected ${label} revision is invalid.`);
}

function normalizeTarget(organizationId: OrganizationId, target: CompanyCopyCreationTarget): CompanyCopyCreationTarget {
  const normalized = {
    legalName: target.legalName,
    tradeName: normalizeTradeName(target.tradeName),
    taxId: target.taxId === null ? null : taxId(target.taxId),
    country: target.country,
    personNature: companyPersonNature(target.personNature),
  };
  const candidate = new Company({
    id: "company-copy-validation" as CompanyId,
    organizationId,
    legacyCompanyId: null,
    legalName: normalized.legalName,
    tradeName: normalized.tradeName,
    taxId: normalized.taxId,
    country: normalized.country,
    status: CompanyStatus.Active,
    operatingProfile: "standard" as CompanyOperatingProfile,
    personNature: normalized.personNature,
    version: 1,
  });
  return Object.freeze({
    legalName: candidate.legalName,
    tradeName: candidate.tradeName,
    taxId: candidate.taxId,
    country: candidate.country,
    personNature: candidate.personNature!,
  });
}

function normalizeTradeName(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) invalid("The idempotency key is invalid.");
  return normalized;
}

function sourceAuthorizationScope(command: CompanyConfigurationCopySourceScope): CompanyConfigurationCopyAuthorizationScope {
  return { actorUserId: command.actorUserId, organizationId: command.organizationId, companyId: command.sourceCompanyId };
}

function assertCopyResult(
  organizationId: OrganizationId,
  expectedCompanyId: CompanyId | null,
  sections: readonly CompanyConfigurationCopySection[],
  result: CompanyConfigurationCopyResult,
): CompanyConfigurationCopyResult {
  result.company.assertBelongsTo(organizationId);
  if (expectedCompanyId !== null && result.company.id !== expectedCompanyId) invalid("Persistence returned another destination company.");
  const copiedSections = normalizeCompanyConfigurationCopySections(result.copiedSections);
  if (copiedSections.length !== sections.length || copiedSections.some((section, index) => section !== sections[index])) invalid("Persistence returned a different configuration selection.");
  return Object.freeze({ company: result.company, copiedSections });
}

function invalid(message: string): never {
  throw new CompanyFailure("COMPANY_CONFIGURATION_COPY_INVALID", message);
}

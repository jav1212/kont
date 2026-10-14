import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import {
  CompanyFailure,
  companyFiscalAddress,
  companyTaxpayerType,
  type CompanyFiscalProfile,
  type CompanyId,
  type CompanyTaxpayerType,
} from "../domain";
import {
  CompanyAdministrationOperation,
  CompanyAdministrationPermission,
  type CompanyAdministrationAuthorization,
} from "./index";

/** Authenticated organization and company scope for fiscal-profile operations. */
export interface CompanyFiscalProfileScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}

/** Versioned, idempotent request to change the mutable fiscal profile fields. */
export interface ConfigureCompanyFiscalProfileCommand extends CompanyFiscalProfileScope {
  readonly expectedCompanyVersion: number;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly fiscalAddress: string | null;
  readonly taxpayerType: CompanyTaxpayerType;
}

/** Persistence boundary for the company record's typed fiscal settings. */
export interface CompanyFiscalProfileRepository {
  /**
   * Reads fiscal context from a company record without changing any identity field.
   * @param scope - Authenticated company scope.
   * @returns The authoritative profile.
   * @throws {CompanyFailure} When persistence fails or returns another company.
   */
  get(scope: CompanyFiscalProfileScope): Promise<CompanyFiscalProfile>;
  /**
   * Atomically updates only fiscal address and taxpayer type under the company revision.
   * @param command - Authorized, normalized configuration intent.
   * @returns The persisted profile, including the next company revision.
   * @throws {CompanyFailure} When stale, inaccessible, invalid, or idempotency conflicts.
   */
  configure(command: ConfigureCompanyFiscalProfileCommand): Promise<CompanyFiscalProfile>;
}

/** Reads fiscal settings and their read-only legal context for one company. */
export class GetCompanyFiscalProfile {
  /**
   * @param authorization - Company read authorization boundary.
   * @param repository - Typed fiscal-profile persistence port.
   * @returns A read use case.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanyFiscalProfileRepository,
  ) {}

  /**
   * Loads the current fiscal profile after checking the company read permission.
   * @param scope - Authenticated organization and company scope.
   * @returns The profile.
   * @throws {CompanyFailure} When scope, authorization, or repository data is invalid.
   */
  async execute(scope: CompanyFiscalProfileScope): Promise<CompanyFiscalProfile> {
    assertScope(scope);
    await this.authorization.assertCanManageCompanies(
      scope,
      CompanyAdministrationOperation.ReadFiscalProfile,
      CompanyAdministrationPermission.Read,
    );
    const profile = await this.repository.get(scope);
    assertProfileScope(scope, profile);
    return profile;
  }
}

/** Updates the mutable fiscal address and taxpayer classification without changing legal identity. */
export class ConfigureCompanyFiscalProfile {
  /**
   * @param authorization - Company update authorization boundary.
   * @param repository - Typed fiscal-profile persistence port.
   * @returns A configuration use case.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanyFiscalProfileRepository,
  ) {}

  /**
   * Validates, authorizes, and atomically persists one fiscal-profile configuration intent.
   * @param command - Actor scope, company revision, retry key, reason, address, and taxpayer type.
   * @returns The authoritative profile with its next company version.
   * @throws {CompanyFailure} When validation, authorization, concurrency, or persistence fails.
   */
  async execute(command: ConfigureCompanyFiscalProfileCommand): Promise<CompanyFiscalProfile> {
    const normalized = normalizeCommand(command);
    await this.authorization.assertCanManageCompanies(
      normalized,
      CompanyAdministrationOperation.ConfigureFiscalProfile,
      CompanyAdministrationPermission.Update,
    );
    const profile = await this.repository.configure(normalized);
    assertProfileScope(normalized, profile);
    return profile;
  }
}

function normalizeCommand(command: ConfigureCompanyFiscalProfileCommand): ConfigureCompanyFiscalProfileCommand {
  assertScope(command);
  if (!Number.isSafeInteger(command.expectedCompanyVersion) || command.expectedCompanyVersion < 1) {
    throw invalidProfile();
  }
  const idempotencyKey = typeof command.idempotencyKey === "string" ? command.idempotencyKey.trim() : "";
  const reason = typeof command.reason === "string" ? command.reason.trim() : "";
  if (!idempotencyKey || idempotencyKey.length > 128 || !reason || reason.length > 500 || /[\u0000-\u001f\u007f]/.test(reason)) {
    throw invalidProfile();
  }
  return Object.freeze({
    ...command,
    idempotencyKey,
    reason,
    fiscalAddress: companyFiscalAddress(command.fiscalAddress),
    taxpayerType: companyTaxpayerType(command.taxpayerType),
  });
}

function assertScope(scope: CompanyFiscalProfileScope): void {
  if (!scope?.actorUserId || !scope.organizationId || !scope.companyId) throw invalidProfile();
}

function assertProfileScope(scope: CompanyFiscalProfileScope, profile: CompanyFiscalProfile): void {
  if (profile.companyId !== scope.companyId) {
    throw new CompanyFailure("COMPANY_OUTSIDE_ORGANIZATION", "The fiscal profile escaped its company scope.");
  }
}

function invalidProfile(): CompanyFailure {
  return new CompanyFailure("COMPANY_FISCAL_PROFILE_INVALID", "The company fiscal profile is invalid.");
}

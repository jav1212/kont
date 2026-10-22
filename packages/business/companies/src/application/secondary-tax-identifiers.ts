import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import {
  CompanyFailure,
  secondaryTaxIdentifierScheme,
  secondaryTaxIdentifierValue,
  secondaryTaxJurisdiction,
  type CompanyId,
  type CompanySecondaryTaxIdentifier,
  type SecondaryTaxIdentifierKey,
} from "../domain";
import {
  CompanyAdministrationOperation,
  CompanyAdministrationPermission,
  type CompanyAdministrationAuthorization,
} from "./index";

/** Authenticated company scope for secondary tax-identifier operations. */
export interface CompanySecondaryTaxIdentifierScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}

/** Versioned request to configure one jurisdiction/scheme slot. */
export interface SetCompanySecondaryTaxIdentifierCommand extends CompanySecondaryTaxIdentifierScope, SecondaryTaxIdentifierKey {
  readonly value: string;
  /** Zero creates a slot; a positive revision replaces or reactivates it. */
  readonly expectedVersion: number;
}

/** Versioned request to retire one configured identifier slot. */
export interface RemoveCompanySecondaryTaxIdentifierCommand extends CompanySecondaryTaxIdentifierScope, SecondaryTaxIdentifierKey {
  readonly expectedVersion: number;
}

/** Persistence port for company-owned secondary tax identifiers. */
export interface CompanySecondaryTaxIdentifierRepository {
  /**
   * Lists active identifiers in one organization and company.
   * @param scope - Authenticated organization and company scope.
   * @returns Active identifiers ordered by jurisdiction and scheme.
   * @throws {CompanyFailure} When persistence is unavailable or returns a different scope.
   */
  list(scope: CompanySecondaryTaxIdentifierScope): Promise<readonly CompanySecondaryTaxIdentifier[]>;
  /**
   * Creates, replaces, or reactivates one identifier using optimistic concurrency.
   * @param command - Canonical slot, value and previously observed revision.
   * @returns The authoritative persisted identifier.
   * @throws {CompanyFailure} When the slot is stale, inaccessible or unavailable.
   */
  set(command: SetCompanySecondaryTaxIdentifierCommand): Promise<CompanySecondaryTaxIdentifier>;
  /**
   * Retires one identifier and clears its stored value while preserving revision history.
   * @param command - Canonical slot and expected current revision.
   * @returns Nothing after the retirement commits.
   * @throws {CompanyFailure} When the slot is absent, stale or unavailable.
   */
  remove(command: RemoveCompanySecondaryTaxIdentifierCommand): Promise<void>;
}

/** Reads a company's configured secondary tax identifiers. */
export class GetCompanySecondaryTaxIdentifiers {
  /**
   * @param authorization - Company access policy.
   * @param repository - Company-scoped secondary identifier persistence.
   * @returns A query for active additional identifiers.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanySecondaryTaxIdentifierRepository,
  ) {}

  /**
   * Returns only active identifier slots for the requested company.
   * @param scope - Authenticated organization and company scope.
   * @returns Active identifiers ordered by jurisdiction and scheme.
   * @throws {CompanyFailure} When access is denied or the repository returns an invalid scope.
   */
  async execute(scope: CompanySecondaryTaxIdentifierScope): Promise<readonly CompanySecondaryTaxIdentifier[]> {
    validateScope(scope);
    await this.authorization.assertCanManageCompanies(
      scope,
      CompanyAdministrationOperation.ReadSecondaryTaxIdentifiers,
      CompanyAdministrationPermission.Read,
    );
    const identifiers = await this.repository.list(scope);
    const seen = new Set<string>();
    for (const identifier of identifiers) {
      if (identifier.companyId !== scope.companyId || identifier.organizationId !== scope.organizationId) {
        throw new CompanyFailure("COMPANY_OUTSIDE_ORGANIZATION", "A secondary identifier escaped its company scope.");
      }
      const key = `${identifier.jurisdiction}:${identifier.scheme}`;
      if (seen.has(key)) throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Secondary identifiers contain duplicate slots.");
      seen.add(key);
    }
    return Object.freeze([...identifiers]);
  }
}

/** Configures one additional company tax identity without changing the primary RIF. */
export class SetCompanySecondaryTaxIdentifier {
  /**
   * @param authorization - Company update policy.
   * @param repository - Company-scoped, revisioned persistence.
   * @returns A command for configuring one jurisdiction/scheme slot.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanySecondaryTaxIdentifierRepository,
  ) {}

  /**
   * Saves a typed tax identifier as an additional identity for the company.
   * @param command - Actor scope, jurisdiction, scheme, value and expected revision.
   * @returns The authoritative identifier snapshot.
   * @throws {CompanyFailure} When access, validation, version or persistence fails.
   */
  async execute(command: SetCompanySecondaryTaxIdentifierCommand): Promise<CompanySecondaryTaxIdentifier> {
    const normalized = validateSetCommand(command);
    await this.authorization.assertCanManageCompanies(
      normalized,
      CompanyAdministrationOperation.ConfigureSecondaryTaxIdentifiers,
      CompanyAdministrationPermission.Update,
    );
    const saved = await this.repository.set(normalized);
    assertOwned(normalized, saved);
    return saved;
  }
}

/** Retires one additional company tax identity and requests deletion of its stored value. */
export class RemoveCompanySecondaryTaxIdentifier {
  /**
   * @param authorization - Company update policy.
   * @param repository - Company-scoped, revisioned persistence.
   * @returns A command for retiring one identifier slot.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanySecondaryTaxIdentifierRepository,
  ) {}

  /**
   * Retires one exact company/jurisdiction/scheme slot.
   * @param command - Actor scope, identifier slot and expected revision.
   * @returns Nothing after the change commits.
   * @throws {CompanyFailure} When access, validation, version or persistence fails.
   */
  async execute(command: RemoveCompanySecondaryTaxIdentifierCommand): Promise<void> {
    const normalized = validateRemoveCommand(command);
    await this.authorization.assertCanManageCompanies(
      normalized,
      CompanyAdministrationOperation.ConfigureSecondaryTaxIdentifiers,
      CompanyAdministrationPermission.Update,
    );
    await this.repository.remove(normalized);
  }
}

function validateScope(scope: CompanySecondaryTaxIdentifierScope): void {
  if (!scope?.actorUserId || !scope.organizationId || !scope.companyId) throw invalidIdentifier();
}

function validateSetCommand(command: SetCompanySecondaryTaxIdentifierCommand): SetCompanySecondaryTaxIdentifierCommand {
  validateScope(command);
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) throw versionConflict();
  return {
    ...command,
    jurisdiction: secondaryTaxJurisdiction(command.jurisdiction),
    scheme: secondaryTaxIdentifierScheme(command.scheme),
    value: secondaryTaxIdentifierValue(command.value),
  };
}

function validateRemoveCommand(command: RemoveCompanySecondaryTaxIdentifierCommand): RemoveCompanySecondaryTaxIdentifierCommand {
  validateScope(command);
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) throw versionConflict();
  return {
    ...command,
    jurisdiction: secondaryTaxJurisdiction(command.jurisdiction),
    scheme: secondaryTaxIdentifierScheme(command.scheme),
  };
}

function assertOwned(scope: SetCompanySecondaryTaxIdentifierCommand, identifier: CompanySecondaryTaxIdentifier): void {
  if (identifier.companyId !== scope.companyId || identifier.organizationId !== scope.organizationId) {
    throw new CompanyFailure("COMPANY_OUTSIDE_ORGANIZATION", "The saved secondary identifier escaped its company scope.");
  }
  if (identifier.jurisdiction !== scope.jurisdiction || identifier.scheme !== scope.scheme) {
    throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "The saved secondary identifier does not match its requested slot.");
  }
}

function invalidIdentifier(): CompanyFailure {
  return new CompanyFailure("COMPANY_SECONDARY_TAX_IDENTIFIER_INVALID", "The secondary tax identifier is invalid.");
}

function versionConflict(): CompanyFailure {
  return new CompanyFailure("COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT", "The secondary tax identifier revision is invalid or stale.");
}

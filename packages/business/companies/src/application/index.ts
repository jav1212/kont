import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import type { ResolvedExchangeRateSet } from "@kontave/monetary/application";
import type { CurrencyCode, CurrencyDefinition } from "@kontave/monetary/domain";
export * from "./company-branches";
export * from "./company-branch-connectivity";
export * from "./secondary-tax-identifiers";
export * from "./document-numbering-series";
export * from "./company-configuration-copy";
export * from "./company-fiscal-profile";
import {
  Company,
  CompanyCountry,
  CompanyFailure,
  CompanyStatus,
  companyVersion,
  documentSeriesNextNumber,
  taxId,
  type CompanyId,
  type CompanyOperatingProfile,
  companyPersonNature,
  type CompanyPersonNature,
  type CompanyDocumentNumberingSettings,
  companyMonetaryContextSnapshot,
  companyMonetaryPolicySettings,
  type CompanyMonetaryContextSnapshot,
  type CompanyMonetaryPolicy,
  type CompanyMonetaryPolicySettings,
  companyDateOrder,
  companyLogoFile,
  companyLogoUrl,
  type CompanyDateFormat,
  type CompanyDateOrder,
  type CompanyLogoFile,
  type TaxId,
} from "../domain";

/** Legacy read/write port retained for existing server-side consumers. */
export interface CompanyRepository {
  /**
   * Lists companies owned by an organization.
   * @param organizationId - Organization that owns the results.
   * @returns Validated company snapshots.
   * @throws {CompanyFailure} When persistence is unavailable.
   */
  listByOrganization(organizationId: OrganizationId): Promise<readonly Company[]>;
  /**
   * Finds one company in an organization.
   * @param organizationId - Organization that owns the company.
   * @param companyId - Company identifier.
   * @returns A snapshot, or null when no in-scope company exists.
   * @throws {CompanyFailure} When persistence is unavailable.
   */
  findById(organizationId: OrganizationId, companyId: CompanyId): Promise<Company | null>;
  /**
   * Saves a complete trusted-server snapshot using its current version.
   * @param company - Authoritative snapshot carrying the expected version.
   * @returns Nothing after durable optimistic persistence.
   * @throws {CompanyFailure} When the company is absent, stale, or unavailable.
   */
  save(company: Company): Promise<void>;
}

/** Actor and organization boundary evaluated before an administrative mutation. */
export interface CompanyAdministrationScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
}

/** Operation-specific permission checked before a company administration mutation. */
export enum CompanyAdministrationOperation {
  Create = "create",
  Update = "update",
  Suspend = "suspend",
  Activate = "activate",
  ConfigureDocumentNumbering = "configure_document_numbering",
  ReadDocumentNumbering = "read_document_numbering",
  ReadMonetaryPolicy = "read_monetary_policy",
  ConfigureMonetaryPolicy = "configure_monetary_policy",
  ReadDateFormat = "read_date_format",
  ConfigureDateFormat = "configure_date_format",
  SetLogo = "set_logo",
  ReadSecondaryTaxIdentifiers = "read_secondary_tax_identifiers",
  ConfigureSecondaryTaxIdentifiers = "configure_secondary_tax_identifiers",
  ReadFiscalProfile = "read_fiscal_profile",
  ConfigureFiscalProfile = "configure_fiscal_profile",
}

/** Permission codes currently available for company administration. */
export enum CompanyAdministrationPermission {
  Create = "companies.create",
  Update = "companies.update",
  Read = "companies.read",
}

/** Injectable authorization boundary owned by the company application layer. */
export interface CompanyAdministrationAuthorization {
  /**
   * Verifies the actor may perform one company administration operation.
   * @param scope - Actor and organization scope.
   * @param operation - Business operation being authorized.
   * @param permission - Existing permission code required by that operation.
   * @returns Nothing when the operation is allowed.
   * @throws {CompanyFailure} When access is denied or authorization is unavailable.
   */
  assertCanManageCompanies(
    scope: CompanyAdministrationScope,
    operation: CompanyAdministrationOperation,
    permission: CompanyAdministrationPermission,
  ): Promise<void>;
}

/** Complete company data used when creating a company. */
export interface CreateCompanyCommand extends CompanyAdministrationScope {
  readonly idempotencyKey: string;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: TaxId | null;
  readonly country: CompanyCountry;
  readonly operatingProfile: CompanyOperatingProfile;
  readonly personNature: CompanyPersonNature;
}

/** Versioned fields that may change after company creation. */
export interface UpdateCompanyCommand extends CompanyAdministrationScope {
  readonly companyId: CompanyId;
  readonly expectedVersion: number;
  readonly legalName?: string;
  readonly tradeName?: string | null;
  readonly taxId?: TaxId | null;
  readonly operatingProfile?: CompanyOperatingProfile;
}

/** Versioned classification of a company's represented taxpayer as natural or juridical. */
export interface SetCompanyPersonNatureCommand extends CompanyLifecycleCommand {
  readonly personNature: CompanyPersonNature;
}

/** Versioned lifecycle mutation. */
export interface CompanyLifecycleCommand extends CompanyAdministrationScope {
  readonly companyId: CompanyId;
  readonly expectedVersion: number;
}

/** Specialized write port that prevents administrative operations from using an unversioned save. */
export interface CompanyAdministrationRepository {
  /**
   * Creates or replays a company creation from its idempotency receipt.
   * @param command - Authorized and normalized creation command.
   * @returns The original or newly created authoritative snapshot.
   * @throws {CompanyFailure} When the intent conflicts or persistence rejects it.
   */
  create(command: CreateCompanyCommand): Promise<Company>;
  /**
   * Updates an in-scope company with optimistic concurrency.
   * @param command - Authorized and normalized patch carrying the expected version.
   * @returns The authoritative updated snapshot.
   * @throws {CompanyFailure} When the company is absent, stale, or invalid.
   */
  update(command: UpdateCompanyCommand): Promise<Company>;
  /**
   * Sets the company's legal person nature with optimistic concurrency.
   * @param command - Authorized classification and expected company revision.
   * @returns The authoritative company snapshot.
   * @throws {CompanyFailure} When the company is absent, stale, invalid, or persistence fails.
   */
  setPersonNature(command: SetCompanyPersonNatureCommand): Promise<Company>;
  /**
   * Atomically stores a prevalidated logo reference with the company optimistic revision.
   * @param command - Authorized logo mutation carrying its expected company version.
   * @returns The authoritative company snapshot with its new logo reference.
   * @throws {CompanyFailure} When the company is absent, stale, or rejects the storage reference.
   */
  updateLogo(command: UpdateCompanyLogoCommand): Promise<Company>;
  /**
   * Applies one lifecycle transition with optimistic concurrency.
   * @param command - Authorized lifecycle command.
   * @param target - Requested company status.
   * @returns The authoritative transitioned snapshot.
   * @throws {CompanyFailure} When the transition is invalid, absent, or stale.
   */
  setStatus(command: CompanyLifecycleCommand, target: CompanyStatus): Promise<Company>;
  /**
   * Reads the next values of the two transactional commercial document series.
   * @param scope - Authenticated actor, organization and company revision scope.
   * @returns Current counters and company revision.
   * @throws {CompanyFailure} When the company is absent or persistence fails.
   */
  getDocumentNumberingSettings(scope: CompanyLifecycleCommand): Promise<CompanyDocumentNumberingSettings>;
  /**
   * Advances selected document counters without ever rewinding an issued series.
   * @param command - Authorized partial counter update with optimistic revision.
   * @returns Updated counters and company revision.
   * @throws {CompanyFailure} When stale, unauthorized, invalid, or below a current counter.
   */
  updateDocumentNumberingSettings(command: UpdateCompanyDocumentNumberingCommand): Promise<CompanyDocumentNumberingSettings>;
}

/** Versioned administrative change to the company's sales and delivery-note counters. */
export interface UpdateCompanyDocumentNumberingCommand extends CompanyLifecycleCommand {
  readonly salesInvoiceNextNumber?: number;
  readonly deliveryNoteNextNumber?: number;
}

/** Versioned request that sets or removes the public logo reference of one company. */
export interface UpdateCompanyLogoCommand extends CompanyLifecycleCommand {
  readonly logoUrl: string | null;
}

/** Object-storage boundary used exclusively by the company-logo application service. */
export interface CompanyLogoStorage {
  /**
   * Writes one validated image under its organization and company scope.
   * @param scope - Organization and company ownership boundary.
   * @param file - Validated image binary and MIME type.
   * @returns Public HTTPS URL of the newly stored object.
   * @throws {CompanyFailure} When trusted object storage cannot persist the object.
   */
  upload(scope: Pick<CompanyLifecycleCommand, "organizationId" | "companyId">, file: CompanyLogoFile): Promise<string>;
  /**
   * Deletes an object only after validating that its URL belongs to the exact organization and company scope.
   * @param scope - Organization and company that own the object.
   * @param logoUrl - Public HTTPS URL that was previously persisted for the company.
   * @returns Nothing after storage has removed the object or confirmed it absent.
   * @throws {CompanyFailure} When storage cannot safely delete the object.
   */
  remove(scope: Pick<CompanyLifecycleCommand, "organizationId" | "companyId">, logoUrl: string): Promise<void>;
}

/** Reads company-owned commercial document counters. */
export class GetCompanyDocumentNumberingSettings {
  /**
   * @param authorization - Company-management authorization boundary.
   * @param repository - Company document-numbering persistence port.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanyAdministrationRepository,
  ) {}

  /**
   * @param command - Actor, organization, company and expected revision.
   * @returns The current counters and revision.
   * @throws {CompanyFailure} When unauthorized, stale, or persistence fails.
   */
  async execute(command: CompanyLifecycleCommand): Promise<CompanyDocumentNumberingSettings> {
    assertLifecycle(command);
    await this.authorization.assertCanManageCompanies(command, CompanyAdministrationOperation.ConfigureDocumentNumbering, CompanyAdministrationPermission.Update);
    return this.repository.getDocumentNumberingSettings(command);
  }
}

/** Changes selected company-owned commercial document counters. */
export class UpdateCompanyDocumentNumberingSettings {
  /**
   * @param authorization - Company-management authorization boundary.
   * @param repository - Company document-numbering persistence port.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanyAdministrationRepository,
  ) {}

  /**
   * @param command - Actor, organization, company, revision and selected counters.
   * @returns Authoritative counters and updated company revision.
   * @throws {CompanyFailure} When unauthorized, invalid, stale, or a counter would rewind.
   */
  async execute(command: UpdateCompanyDocumentNumberingCommand): Promise<CompanyDocumentNumberingSettings> {
    assertLifecycle(command);
    if (command.salesInvoiceNextNumber === undefined && command.deliveryNoteNextNumber === undefined) {
      throw new CompanyFailure("COMPANY_DOCUMENT_NUMBER_INVALID", "At least one document counter is required.");
    }
    const normalized = {
      ...command,
      ...(command.salesInvoiceNextNumber === undefined ? {} : { salesInvoiceNextNumber: documentSeriesNextNumber(command.salesInvoiceNextNumber) }),
      ...(command.deliveryNoteNextNumber === undefined ? {} : { deliveryNoteNextNumber: documentSeriesNextNumber(command.deliveryNoteNextNumber) }),
    };
    await this.authorization.assertCanManageCompanies(normalized, CompanyAdministrationOperation.ConfigureDocumentNumbering, CompanyAdministrationPermission.Update);
    return this.repository.updateDocumentNumberingSettings(normalized);
  }
}

/** Lists companies owned by an organization. */
export class ListOrganizationCompanies {
  /**
   * @param repository - Company read port.
   */
  constructor(private readonly repository: CompanyRepository) {}

  /**
   * @param organizationId - Requested organization.
   * @returns Valid company snapshots.
   * @throws {CompanyFailure} When a returned company escapes the requested organization.
   */
  async execute(organizationId: OrganizationId): Promise<readonly Company[]> {
    const companies = await this.repository.listByOrganization(organizationId);
    for (const company of companies) company.assertBelongsTo(organizationId);
    return companies;
  }
}

/** Retrieves an operational company in an organization. */
export class GetOperationalCompany {
  /**
   * @param repository - Company read port.
   */
  constructor(private readonly repository: CompanyRepository) {}

  /**
   * @param organizationId - Requested organization.
   * @param id - Company identifier.
   * @returns An active company.
   * @throws {CompanyFailure} When missing, outside the organization, or inactive.
   */
  async execute(organizationId: OrganizationId, id: CompanyId): Promise<Company> {
    const company = await this.repository.findById(organizationId, id);
    if (!company) throw new CompanyFailure("COMPANY_NOT_FOUND", "The company does not exist.");
    company.assertBelongsTo(organizationId);
    company.assertOperational();
    return company;
  }
}

/** Creates a company using a durable organization-scoped idempotency key. */
export class CreateCompany {
  /**
   * @param authorization - Operation-specific authorization boundary.
   * @param repository - Versioned company write port.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanyAdministrationRepository,
  ) {}

  /**
   * @param command - Creation request.
   * @returns The original or newly created company.
   * @throws {CompanyFailure} When unauthorized, invalid, or persistence rejects it.
   */
  async execute(command: CreateCompanyCommand): Promise<Company> {
    const normalized = normalizeCreate(command);
    await this.authorization.assertCanManageCompanies(
      normalized,
      CompanyAdministrationOperation.Create,
      CompanyAdministrationPermission.Create,
    );
    const created = assertOwned(normalized.organizationId, await this.repository.create(normalized));
    if (created.personNature !== normalized.personNature) {
      throw new CompanyFailure("COMPANY_INVALID", "Company persistence returned a different person nature.");
    }
    return created;
  }
}

/** Updates mutable company identity fields with optimistic concurrency. */
export class UpdateCompany {
  /**
   * @param authorization - Operation-specific authorization boundary.
   * @param repository - Versioned company write port.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanyAdministrationRepository,
  ) {}

  /**
   * @param command - Versioned identity patch.
   * @returns The authoritative updated company.
   * @throws {CompanyFailure} When unauthorized, invalid, stale, or out of scope.
   */
  async execute(command: UpdateCompanyCommand): Promise<Company> {
    const normalized = normalizeUpdate(command);
    await this.authorization.assertCanManageCompanies(
      normalized,
      CompanyAdministrationOperation.Update,
      CompanyAdministrationPermission.Update,
    );
    return assertMutationOutput(
      normalized.organizationId,
      normalized.companyId,
      await this.repository.update(normalized),
    );
  }
}

/** Classifies an existing company as representing a natural or juridical person. */
export class SetCompanyPersonNature {
  /**
   * Composes authorization with the company administration repository.
   * @param authorization - Operation-specific authorization boundary.
   * @param repository - Versioned company write port.
   * @returns A use case that classifies companies after authorization.
   * @throws {CompanyFailure} When required dependencies are unavailable.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanyAdministrationRepository,
  ) {}

  /**
   * @param command - Versioned person-nature classification request.
   * @returns The authoritative company with its verified nature.
   * @throws {CompanyFailure} When unauthorized, invalid, stale, or out of scope.
   */
  async execute(command: SetCompanyPersonNatureCommand): Promise<Company> {
    assertLifecycle(command);
    const personNature = companyPersonNature(command.personNature);
    await this.authorization.assertCanManageCompanies(
      command,
      CompanyAdministrationOperation.Update,
      CompanyAdministrationPermission.Update,
    );
    const updated = assertMutationOutput(
      command.organizationId,
      command.companyId,
      await this.repository.setPersonNature({ ...command, personNature }),
    );
    if (updated.personNature !== personNature) {
      throw new CompanyFailure("COMPANY_INVALID", "Company persistence returned a different person nature.");
    }
    return updated;
  }
}

/** Uploads, replaces, or removes a company logo without allowing client-side storage writes. */
export class SetCompanyLogo {
  /**
   * @param authorization - Authorization boundary that requires `companies.update` before Storage is touched.
   * @param companies - Scoped company reader used to retain the former logo reference.
   * @param repository - Atomic versioned logo-reference persistence port.
   * @param storage - Trusted server-side company-logo object storage.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly companies: CompanyRepository,
    private readonly repository: CompanyAdministrationRepository,
    private readonly storage: CompanyLogoStorage,
  ) {}

  /**
   * @param command - Versioned company scope and a new image, or null to remove the current logo.
   * @returns The authoritative company snapshot after its logo reference changes.
   * @throws {CompanyFailure} When unauthorized, invalid, stale, storage is unavailable, or safe compensation fails.
   */
  async execute(command: SetCompanyLogoCommand): Promise<Company> {
    assertLifecycle(command);
    const file = command.file === null ? null : companyLogoFile(command.file);
    await this.authorization.assertCanManageCompanies(command, CompanyAdministrationOperation.SetLogo, CompanyAdministrationPermission.Update);
    const current = await this.companies.findById(command.organizationId, command.companyId);
    if (!current) throw new CompanyFailure("COMPANY_NOT_FOUND", "The company does not exist.");
    current.assertBelongsTo(command.organizationId);

    const scope = { organizationId: command.organizationId, companyId: command.companyId };
    const newLogoUrl = file === null ? null : companyLogoUrl(await this.storage.upload(scope, file));
    let updated: Company;
    try {
      updated = assertMutationOutput(
        command.organizationId,
        command.companyId,
        await this.repository.updateLogo({ ...command, logoUrl: newLogoUrl }),
      );
    } catch (cause: unknown) {
      if (newLogoUrl !== null) await this.compensateUnpersistedUpload(scope, newLogoUrl, cause);
      throw cause;
    }
    if (updated.logoUrl !== newLogoUrl) {
      if (newLogoUrl !== null) await this.compensateUnpersistedUpload(scope, newLogoUrl, new CompanyFailure("COMPANY_LOGO_INVALID", "Company persistence returned an unexpected logo URL."));
      throw new CompanyFailure("COMPANY_LOGO_INVALID", "Company persistence returned an unexpected logo URL.");
    }
    if (current.logoUrl !== null && current.logoUrl !== newLogoUrl) {
      await this.removeFormerLogo(scope, current.logoUrl);
    }
    return updated;
  }

  private async compensateUnpersistedUpload(
    scope: Pick<CompanyLifecycleCommand, "organizationId" | "companyId">,
    uploadedUrl: string,
    persistenceCause: unknown,
  ): Promise<void> {
    let observed: Company | null;
    try {
      observed = await this.companies.findById(scope.organizationId, scope.companyId);
    } catch {
      return;
    }
    if (observed?.logoUrl === uploadedUrl) return;
    try {
      await this.storage.remove(scope, uploadedUrl);
    } catch (cleanupCause: unknown) {
      throw new CompanyFailure("COMPANY_LOGO_COMPENSATION_FAILED", "The unpersisted company logo could not be removed safely.", {
        cause: new AggregateError([persistenceCause, cleanupCause], "Company logo persistence and cleanup failed."),
      });
    }
  }

  private async removeFormerLogo(
    scope: Pick<CompanyLifecycleCommand, "organizationId" | "companyId">,
    logoUrl: string,
  ): Promise<void> {
    try {
      await this.storage.remove(scope, logoUrl);
    } catch {
      // This cleanup occurs only after the new reference is durably committed.
      // Reporting a failure here would ask callers to retry a stale mutation;
      // retention is safer and an operational cleanup can remove the orphan.
    }
  }
}

/** Versioned company-logo command. A null file removes the currently configured logo. */
export interface SetCompanyLogoCommand extends CompanyLifecycleCommand {
  readonly file: CompanyLogoFile | null;
}

/** Suspends a currently active company with optimistic concurrency. */
export class SuspendCompany {
  /**
   * @param authorization - Operation-specific authorization boundary.
   * @param repository - Versioned company write port.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanyAdministrationRepository,
  ) {}

  /**
   * @param command - Versioned lifecycle request.
   * @returns The suspended company.
   * @throws {CompanyFailure} When unauthorized, invalid, stale, or transition is rejected.
   */
  async execute(command: CompanyLifecycleCommand): Promise<Company> {
    assertLifecycle(command);
    await this.authorization.assertCanManageCompanies(
      command,
      CompanyAdministrationOperation.Suspend,
      CompanyAdministrationPermission.Update,
    );
    return assertMutationOutput(
      command.organizationId,
      command.companyId,
      await this.repository.setStatus(command, CompanyStatus.Suspended),
    );
  }
}

/** Activates a currently suspended company with optimistic concurrency. */
export class ActivateCompany {
  /**
   * @param authorization - Operation-specific authorization boundary.
   * @param repository - Versioned company write port.
   */
  constructor(
    private readonly authorization: CompanyAdministrationAuthorization,
    private readonly repository: CompanyAdministrationRepository,
  ) {}

  /**
   * @param command - Versioned lifecycle request.
   * @returns The active company.
   * @throws {CompanyFailure} When unauthorized, invalid, stale, or transition is rejected.
   */
  async execute(command: CompanyLifecycleCommand): Promise<Company> {
    assertLifecycle(command);
    await this.authorization.assertCanManageCompanies(
      command,
      CompanyAdministrationOperation.Activate,
      CompanyAdministrationPermission.Update,
    );
    return assertMutationOutput(
      command.organizationId,
      command.companyId,
      await this.repository.setStatus(command, CompanyStatus.Active),
    );
  }
}

function normalizeCreate(command: CreateCompanyCommand): CreateCompanyCommand {
  const idempotencyKey = command.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new CompanyFailure("COMPANY_INVALID", "The idempotency key is invalid.");
  }
  const normalized = {
    ...command,
    idempotencyKey,
    personNature: companyPersonNature(command.personNature),
    tradeName: normalizeTradeName(command.tradeName),
    taxId: normalizeTaxId(command.taxId),
  };
  validateCandidate(normalized.organizationId, normalized.legalName, normalized.tradeName, normalized.taxId, normalized.country, normalized.operatingProfile);
  return normalized;
}

function normalizeUpdate(command: UpdateCompanyCommand): UpdateCompanyCommand {
  companyVersion(command.expectedVersion);
  if (
    command.legalName === undefined &&
    command.tradeName === undefined &&
    command.taxId === undefined &&
    command.operatingProfile === undefined
  ) {
    throw new CompanyFailure("COMPANY_INVALID", "At least one mutable company field is required.");
  }
  const normalized = {
    ...command,
    ...(command.tradeName === undefined ? {} : { tradeName: normalizeTradeName(command.tradeName) }),
    ...(command.taxId === undefined ? {} : { taxId: normalizeTaxId(command.taxId) }),
  };
  if (normalized.legalName !== undefined) {
    validateCandidate(normalized.organizationId, normalized.legalName, null, null, CompanyCountry.Venezuela, "standard");
  }
  if (normalized.tradeName !== undefined) {
    validateCandidate(normalized.organizationId, "Validation company", normalized.tradeName, null, CompanyCountry.Venezuela, "standard");
  }
  if (
    normalized.operatingProfile !== undefined &&
    normalized.operatingProfile !== "standard" &&
    normalized.operatingProfile !== "kiosk"
  ) {
    throw new CompanyFailure("COMPANY_INVALID", "The operating profile is invalid.");
  }
  return normalized;
}

function assertLifecycle(command: CompanyLifecycleCommand): void {
  companyVersion(command.expectedVersion);
}

function normalizeTaxId(value: TaxId | null): TaxId | null {
  return value === null ? null : taxId(value);
}

function normalizeTradeName(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function validateCandidate(
  organizationId: OrganizationId,
  legalName: string,
  tradeName: string | null,
  value: TaxId | null,
  country: CompanyCountry,
  operatingProfile: CompanyOperatingProfile,
): void {
  new Company({
    id: "validation" as CompanyId,
    organizationId,
    legacyCompanyId: null,
    legalName,
    tradeName,
    taxId: value,
    country,
    status: CompanyStatus.Active,
    operatingProfile,
    version: 1,
  });
}

function assertOwned(organizationId: OrganizationId, company: Company): Company {
  company.assertBelongsTo(organizationId);
  return company;
}

function assertMutationOutput(
  organizationId: OrganizationId,
  expectedCompanyId: CompanyId,
  company: Company,
): Company {
  assertOwned(organizationId, company);
  if (company.id !== expectedCompanyId) {
    throw new CompanyFailure("COMPANY_INVALID", "Company persistence returned another company.");
  }
  return company;
}

/** Scope used to read one current or immutable historical company monetary policy. */
export interface GetCompanyMonetaryPolicyQuery extends CompanyAdministrationScope {
  readonly companyId: CompanyId;
  /** Omitting this value reads the current policy without creating one. */
  readonly policyVersion?: number;
}

/** Trusted-server command that appends one immutable monetary policy revision. */
export interface ConfigureCompanyMonetaryPolicyCommand extends CompanyAdministrationScope {
  readonly companyId: CompanyId;
  /** Zero creates a policy; a positive value updates exactly that revision. */
  readonly expectedPolicyVersion: number;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly settings: CompanyMonetaryPolicySettings;
}

/** Persistence boundary for company policy revisions and idempotency receipts. */
export interface CompanyMonetaryPolicyRepository {
  /**
   * Reads the current revision or an immutable identified revision.
   * @param query - Authorized organization, company and optional revision scope.
   * @returns The policy, or null only when no current policy has been configured.
   * @throws {CompanyFailure} When a requested historical revision is absent or persistence fails.
   */
  get(query: GetCompanyMonetaryPolicyQuery): Promise<CompanyMonetaryPolicy | null>;
  /**
   * Atomically appends or replays a policy revision and its audit receipt.
   * @param command - Authorized normalized command.
   * @returns The original or newly persisted immutable policy.
   * @throws {CompanyFailure} When stale, unauthorized, invalid, or idempotency conflicts.
   */
  configure(command: ConfigureCompanyMonetaryPolicyCommand): Promise<CompanyMonetaryPolicy>;
}

/** Narrow port over the monetary resolver; technical caching remains outside company policy. */
export interface CompanyExchangeRateResolver {
  /**
   * Resolves rates effective on or before a requested local business date.
   * @param quoteCurrency - Currency in which rates are quoted.
   * @param date - Requested business date in `YYYY-MM-DD` format.
   * @returns A source result enriched with freshness evidence.
   * @throws {ExchangeRateApplicationFailure} When the provider, cache, or requested date cannot be resolved.
   */
  historical(quoteCurrency: CurrencyDefinition, date: string): Promise<ResolvedExchangeRateSet>;
}

/** Input used to resolve one immutable company monetary context. */
export interface ResolveCompanyMonetaryContextQuery extends Omit<GetCompanyMonetaryPolicyQuery, "policyVersion"> {
  readonly referenceCurrencyCode: CurrencyCode;
  readonly requestedDate: string;
}

/** Reads a company monetary policy without initializing missing settings. */
export class GetCompanyMonetaryPolicy {
  /**
   * Composes an authorized reader for current and historical company policies.
   * @param authorization - Authorization boundary for company data reads.
   * @param repository - Policy persistence boundary.
   * @returns A reader that performs no I/O until execute is called.
   */
  constructor(private readonly authorization: CompanyAdministrationAuthorization, private readonly repository: CompanyMonetaryPolicyRepository) {}

  /**
   * Reads one policy revision after checking the actor's current permission.
   * @param query - Actor, organization, company and optional historical revision.
   * @returns A policy or null only when the current policy is absent.
   * @throws {CompanyFailure} When unauthorized, malformed, or a historical revision is absent.
   */
  async execute(query: GetCompanyMonetaryPolicyQuery): Promise<CompanyMonetaryPolicy | null> {
    assertMonetaryScope(query);
    await this.authorization.assertCanManageCompanies(query, CompanyAdministrationOperation.ReadMonetaryPolicy, CompanyAdministrationPermission.Read);
    return this.repository.get(query);
  }
}

/** Appends a policy revision using independent optimistic concurrency and a durable idempotency receipt. */
export class ConfigureCompanyMonetaryPolicy {
  /**
   * Composes a versioned policy writer without accessing persistence.
   * @param authorization - Authorization boundary for company policy changes.
   * @param repository - Atomic policy persistence boundary.
   * @returns A writer that delegates atomic revision, audit, and receipt persistence.
   */
  constructor(private readonly authorization: CompanyAdministrationAuthorization, private readonly repository: CompanyMonetaryPolicyRepository) {}

  /**
   * Normalizes and authorizes a change before atomically appending or replaying it.
   * @param command - Actor, scope, expected policy revision, trace key, reason and settings.
   * @returns The replayed or newly immutable policy revision.
   * @throws {CompanyFailure} When unauthorized, invalid, stale, or idempotency conflicts.
   */
  async execute(command: ConfigureCompanyMonetaryPolicyCommand): Promise<CompanyMonetaryPolicy> {
    assertMonetaryScope(command);
    if (!Number.isSafeInteger(command.expectedPolicyVersion) || command.expectedPolicyVersion < 0) {
      throw new CompanyFailure("COMPANY_MONETARY_POLICY_INVALID", "The expected policy version is invalid.");
    }
    const idempotencyKey = command.idempotencyKey.trim();
    const reason = command.reason.trim();
    if (!idempotencyKey || idempotencyKey.length > 128 || !reason || reason.length > 500) {
      throw new CompanyFailure("COMPANY_MONETARY_POLICY_INVALID", "The idempotency key or change reason is invalid.");
    }
    const normalized = { ...command, idempotencyKey, reason, settings: companyMonetaryPolicySettings(command.settings) };
    await this.authorization.assertCanManageCompanies(normalized, CompanyAdministrationOperation.ConfigureMonetaryPolicy, CompanyAdministrationPermission.Update);
    return this.repository.configure(normalized);
  }
}

/** Resolves an exact, fresh official rate and binds it to one immutable policy revision. */
export class ResolveCompanyMonetaryContext {
  /**
   * Composes policy, lifecycle, and rate resolution for a new conversion context.
   * @param getPolicy - Authorized policy reader.
   * @param companies - Scoped company reader used to require an active company.
   * @param rates - Exchange-rate resolver whose cache behavior is independently constrained below.
   * @returns A resolver that performs no I/O until execute is called.
   */
  constructor(
    private readonly getPolicy: GetCompanyMonetaryPolicy,
    private readonly companies: CompanyRepository,
    private readonly rates: CompanyExchangeRateResolver,
  ) {}

  /**
   * Pins the current policy and an admissible rate; consumers must persist the returned context with their operation.
   * @param query - Authorized company scope, USD or EUR reference currency and requested business date.
   * @returns A JSON-safe context that can reproduce conversions after later policy edits.
   * @throws {CompanyFailure} When policy/rate data is unavailable, stale, non-exact, or incompatible.
   * @throws {ExchangeRateApplicationFailure} When the rate provider or cache cannot satisfy the request.
   */
  async execute(query: ResolveCompanyMonetaryContextQuery): Promise<CompanyMonetaryContextSnapshot> {
    const policy = await this.getPolicy.execute({ actorUserId: query.actorUserId, organizationId: query.organizationId, companyId: query.companyId });
    if (!policy) throw new CompanyFailure("COMPANY_MONETARY_POLICY_NOT_CONFIGURED", "The company monetary policy is not configured.");
    await new GetOperationalCompany(this.companies).execute(query.organizationId, query.companyId);
    const referenceCurrency = policy.referenceCurrencies.find((item) => item.code === query.referenceCurrencyCode);
    if (!referenceCurrency) throw new CompanyFailure("COMPANY_MONETARY_POLICY_INVALID", "The reference currency is not enabled.");
    const result = await this.rates.historical(policy.operatingCurrency, query.requestedDate);
    if (result.requestedDate !== query.requestedDate || result.resolution !== "exact_date" || result.effectiveDate !== query.requestedDate || result.freshness.kind !== "fresh") {
      throw new CompanyFailure("COMPANY_MONETARY_POLICY_INVALID", "The exchange rate is not admissible for the requested date.");
    }
    const rate = result.rates.find((item) => item.rate.baseCurrency.code === referenceCurrency.code && item.rate.quoteCurrency.code === policy.operatingCurrency.code);
    if (!rate || rate.effectiveDate !== query.requestedDate || rate.rate.baseCurrency.minorUnit !== referenceCurrency.minorUnit || rate.rate.quoteCurrency.minorUnit !== policy.operatingCurrency.minorUnit || rate.source.kind !== "official" || rate.source.authority !== "BCV") {
      throw new CompanyFailure("COMPANY_MONETARY_POLICY_INVALID", "No admitted official exchange rate is available.");
    }
    return companyMonetaryContextSnapshot({ policy, referenceCurrency, requestedDate: query.requestedDate, observedAt: result.observedAt, retrievedAt: result.freshness.retrievedAt, rate });
  }
}

function assertMonetaryScope(query: GetCompanyMonetaryPolicyQuery): void {
  if (!query.companyId || !query.actorUserId || !query.organizationId) {
    throw new CompanyFailure("COMPANY_MONETARY_POLICY_INVALID", "The monetary policy scope is invalid.");
  }
  if (query.policyVersion !== undefined && (!Number.isSafeInteger(query.policyVersion) || query.policyVersion < 1)) {
    throw new CompanyFailure("COMPANY_MONETARY_POLICY_INVALID", "The policy version is invalid.");
  }
}

/** Scope used to read one current or immutable historical company date-format revision. */
export interface GetCompanyDateFormatQuery extends CompanyAdministrationScope {
  readonly companyId: CompanyId;
  /** Omitting this value reads the current configured revision without creating one. */
  readonly formatVersion?: number;
}

/** Trusted-server command that appends one immutable company date-format revision. */
export interface ConfigureCompanyDateFormatCommand extends CompanyAdministrationScope {
  readonly companyId: CompanyId;
  /** Zero creates a configuration; a positive value updates exactly that revision. */
  readonly expectedFormatVersion: number;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly dateOrder: CompanyDateOrder;
}

/** Persistence boundary for company date-format revisions, audit records, and idempotency receipts. */
export interface CompanyDateFormatRepository {
  /**
   * Reads a current revision or one immutable identified revision.
   * @param query - Authorized organization, company, and optional revision scope.
   * @returns The format, or null only when no current configuration exists.
   * @throws {CompanyFailure} When a requested historical revision is absent or persistence fails.
   */
  getDateFormat(query: GetCompanyDateFormatQuery): Promise<CompanyDateFormat | null>;
  /**
   * Atomically appends or replays a date-format revision.
   * @param command - Authorized normalized command.
   * @returns The original or newly persisted immutable format.
   * @throws {CompanyFailure} When stale, unauthorized, invalid, or idempotency conflicts.
   */
  configureDateFormat(command: ConfigureCompanyDateFormatCommand): Promise<CompanyDateFormat>;
}

/** Reads a company date-format revision without initializing a missing configuration. */
export class GetCompanyDateFormat {
  /**
   * @param authorization - Authorization boundary for company data reads.
   * @param repository - Date-format persistence boundary.
   */
  constructor(private readonly authorization: CompanyAdministrationAuthorization, private readonly repository: CompanyDateFormatRepository) {}

  /**
   * Reads one configured date-format revision after checking current read permission.
   * @param query - Actor, organization, company, and optional historical revision.
   * @returns The configured format or null only when the current configuration is absent.
   * @throws {CompanyFailure} When unauthorized, malformed, or the requested revision is absent.
   */
  async execute(query: GetCompanyDateFormatQuery): Promise<CompanyDateFormat | null> {
    assertDateFormatScope(query);
    await this.authorization.assertCanManageCompanies(query, CompanyAdministrationOperation.ReadDateFormat, CompanyAdministrationPermission.Read);
    return this.repository.getDateFormat(query);
  }
}

/** Appends a company date-format revision with independent optimistic concurrency and idempotency. */
export class ConfigureCompanyDateFormat {
  /**
   * @param authorization - Authorization boundary for company configuration changes.
   * @param repository - Atomic date-format persistence boundary.
   */
  constructor(private readonly authorization: CompanyAdministrationAuthorization, private readonly repository: CompanyDateFormatRepository) {}

  /**
   * Normalizes and authorizes one configuration change before persistence appends or replays it.
   * @param command - Actor, scope, expected revision, trace key, reason, and display order.
   * @returns The replayed or newly immutable date-format revision.
   * @throws {CompanyFailure} When unauthorized, invalid, stale, or the key has another intent.
   */
  async execute(command: ConfigureCompanyDateFormatCommand): Promise<CompanyDateFormat> {
    assertDateFormatScope(command);
    if (!Number.isSafeInteger(command.expectedFormatVersion) || command.expectedFormatVersion < 0) {
      throw new CompanyFailure("COMPANY_DATE_FORMAT_INVALID", "The expected date format version is invalid.");
    }
    const idempotencyKey = command.idempotencyKey.trim();
    const reason = command.reason.trim();
    if (!idempotencyKey || idempotencyKey.length > 128 || !reason || reason.length > 500) {
      throw new CompanyFailure("COMPANY_DATE_FORMAT_INVALID", "The idempotency key or change reason is invalid.");
    }
    const normalized = { ...command, idempotencyKey, reason, dateOrder: companyDateOrder(command.dateOrder) };
    await this.authorization.assertCanManageCompanies(normalized, CompanyAdministrationOperation.ConfigureDateFormat, CompanyAdministrationPermission.Update);
    return this.repository.configureDateFormat(normalized);
  }
}

function assertDateFormatScope(query: GetCompanyDateFormatQuery): void {
  if (!query.companyId || !query.actorUserId || !query.organizationId) {
    throw new CompanyFailure("COMPANY_DATE_FORMAT_INVALID", "The company date format scope is invalid.");
  }
  if (query.formatVersion !== undefined && (!Number.isSafeInteger(query.formatVersion) || query.formatVersion < 1)) {
    throw new CompanyFailure("COMPANY_DATE_FORMAT_INVALID", "The date format version is invalid.");
  }
}

import type { OrganizationId } from "@kontave/organizations/domain";
import type {
  CompanyAdministrationRepository,
  CompanyMonetaryPolicyRepository,
  CompanyDateFormatRepository,
  CompanyLifecycleCommand,
  ConfigureCompanyMonetaryPolicyCommand,
  CompanyRepository,
  CreateCompanyCommand,
  UpdateCompanyCommand,
  SetCompanyPersonNatureCommand,
  UpdateCompanyLogoCommand,
  UpdateCompanyDocumentNumberingCommand,
  GetCompanyMonetaryPolicyQuery,
  GetCompanyDateFormatQuery,
  ConfigureCompanyDateFormatCommand,
} from "../application";
import { Company, CompanyFailure, CompanyStatus, companyDateFormat, companyId, companyMonetaryPolicy, type CompanyDateFormat, type CompanyDocumentNumberingSettings, type CompanyId, type CompanyMonetaryPolicy } from "../domain";

/** In-memory implementation of the legacy trusted-server company repository. */
export class InMemoryCompanyRepository implements CompanyRepository {
  /**
   * @param companies - Initial snapshots retained by the repository.
   */
  constructor(readonly companies: Company[] = []) {}

  /**
   * @param organizationId - Organization that owns the requested companies.
   * @returns Matching company snapshots.
   */
  async listByOrganization(organizationId: OrganizationId): Promise<readonly Company[]> {
    return this.companies.filter((company) => company.organizationId === organizationId);
  }

  /**
   * @param organizationId - Organization that owns the requested company.
   * @param id - Company identifier.
   * @returns The matching company, or null when absent.
   */
  async findById(organizationId: OrganizationId, id: CompanyId): Promise<Company | null> {
    return this.companies.find(
      (company) => company.organizationId === organizationId && company.id === id,
    ) ?? null;
  }

  /**
   * @param company - Snapshot carrying the expected version.
   * @returns Nothing when the matching snapshot is replaced.
   * @throws {CompanyFailure} When the company is absent or stale.
   */
  async save(company: Company): Promise<void> {
    const current = this.companies.findIndex(
      (item) => item.id === company.id && item.organizationId === company.organizationId,
    );
    if (current < 0) {
      throw new CompanyFailure("COMPANY_NOT_FOUND", "The company does not exist.");
    }
    if (this.companies[current]!.version !== company.version) {
      throw new CompanyFailure("COMPANY_VERSION_CONFLICT", "The company was modified by another operation.");
    }
    this.companies.splice(current, 1, new Company({ ...company, version: company.version + 1 }));
  }
}

/** In-memory administrative adapter matching the production RPC idempotency and concurrency semantics. */
export class InMemoryCompanyAdministrationRepository implements CompanyAdministrationRepository, CompanyRepository {
  private readonly creations = new Map<string, { readonly request: string; readonly company: Company }>();
  private readonly numbering = new Map<string, { salesInvoiceNextNumber: number; deliveryNoteNextNumber: number }>();

  /**
   * @param companies - Initial company snapshots.
   * @param nextId - ID generator used for every new company independently from tax identity.
   */
  constructor(
    readonly companies: Company[] = [],
    private readonly nextId: () => CompanyId = () => companyId(globalThis.crypto.randomUUID()),
  ) {}

  /**
   * @param command - Normalized creation command.
   * @returns An original idempotent receipt or new company.
   * @throws {CompanyFailure} When the intent conflicts or ID already exists.
   */
  async create(command: CreateCompanyCommand): Promise<Company> {
    const key = `${command.organizationId}:${command.idempotencyKey.trim()}`;
    const request = JSON.stringify({
      actorUserId: command.actorUserId,
      legalName: command.legalName.trim(),
      tradeName: command.tradeName?.trim() ?? null,
      taxId: command.taxId,
      country: command.country,
      operatingProfile: command.operatingProfile,
      personNature: command.personNature,
    });
    const prior = this.creations.get(key);
    if (prior) {
      if (prior.request !== request) {
        throw new CompanyFailure("COMPANY_IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request.");
      }
      return prior.company;
    }
    const id = this.nextId();
    if (this.companies.some((company) => company.organizationId === command.organizationId && company.id === id)) {
      throw new CompanyFailure("COMPANY_ALREADY_EXISTS", "A company with this identifier already exists.");
    }
    if (command.taxId && this.companies.some((company) => company.organizationId === command.organizationId && company.taxId === command.taxId)) {
      throw new CompanyFailure("COMPANY_ALREADY_EXISTS", "A company with this tax identifier already exists.");
    }
    const company = new Company({
      id,
      organizationId: command.organizationId,
      legacyCompanyId: id,
      legalName: command.legalName,
      tradeName: command.tradeName,
      taxId: command.taxId,
      country: command.country,
      status: CompanyStatus.Active,
      operatingProfile: command.operatingProfile,
      personNature: command.personNature,
      version: 1,
    });
    this.companies.push(company);
    this.creations.set(key, { request, company });
    return company;
  }

  /**
   * @param command - Versioned company identity patch.
   * @returns The updated snapshot with the next version.
   * @throws {CompanyFailure} When the company is absent or stale.
   */
  async update(command: UpdateCompanyCommand): Promise<Company> {
    const current = this.current(command.organizationId, command.companyId, command.expectedVersion);
    if (
      command.taxId !== undefined &&
      command.taxId !== null &&
      command.taxId !== current.taxId &&
      this.companies.some(
        (company) =>
          company.organizationId === command.organizationId &&
          company.id !== current.id &&
          company.taxId === command.taxId,
      )
    ) {
      throw new CompanyFailure("COMPANY_ALREADY_EXISTS", "A company with this tax identifier already exists.");
    }
    const next = new Company({
      ...current,
      legalName: command.legalName ?? current.legalName,
      tradeName: command.tradeName === undefined ? current.tradeName : command.tradeName,
      taxId: command.taxId === undefined ? current.taxId : command.taxId,
      operatingProfile: command.operatingProfile ?? current.operatingProfile,
      version: current.version + 1,
    });
    return this.replace(next);
  }

  /**
   * Stores the verified person nature under the company's optimistic revision.
   * @param command - Versioned person-nature update.
   * @returns The updated company snapshot.
   * @throws {CompanyFailure} When the company is absent or its revision is stale.
   */
  async setPersonNature(command: SetCompanyPersonNatureCommand): Promise<Company> {
    const current = this.current(command.organizationId, command.companyId, command.expectedVersion);
    return this.replace(new Company({ ...current, personNature: command.personNature, version: current.version + 1 }));
  }

  /** {@inheritDoc CompanyAdministrationRepository.updateLogo} */
  async updateLogo(command: UpdateCompanyLogoCommand): Promise<Company> {
    const current = this.current(command.organizationId, command.companyId, command.expectedVersion);
    return this.replace(new Company({ ...current, logoUrl: command.logoUrl, version: current.version + 1 }));
  }

  /** {@inheritDoc CompanyRepository.listByOrganization} */
  async listByOrganization(organizationId: OrganizationId): Promise<readonly Company[]> {
    return this.companies.filter((company) => company.organizationId === organizationId);
  }

  /** {@inheritDoc CompanyRepository.findById} */
  async findById(organizationId: OrganizationId, id: CompanyId): Promise<Company | null> {
    return this.companies.find((company) => company.organizationId === organizationId && company.id === id) ?? null;
  }

  /** {@inheritDoc CompanyRepository.save} */
  async save(company: Company): Promise<void> {
    const current = this.current(company.organizationId, company.id, company.version);
    this.replace(new Company({ ...current, ...company, version: current.version + 1 }));
  }

  /**
   * @param command - Versioned lifecycle command.
   * @param target - Requested lifecycle status.
   * @returns The transitioned snapshot with the next version.
   * @throws {CompanyFailure} When absent, stale, or the transition is invalid.
   */
  async setStatus(command: CompanyLifecycleCommand, target: CompanyStatus): Promise<Company> {
    const current = this.current(command.organizationId, command.companyId, command.expectedVersion);
    const transitioned = target === CompanyStatus.Suspended ? current.suspend() : current.activate();
    return this.replace(new Company({ ...transitioned, version: current.version + 1 }));
  }

  /** {@inheritDoc CompanyAdministrationRepository.getDocumentNumberingSettings} */
  async getDocumentNumberingSettings(command: CompanyLifecycleCommand): Promise<CompanyDocumentNumberingSettings> {
    const company = this.current(command.organizationId, command.companyId, command.expectedVersion);
    company.assertOperational();
    return this.numberingSnapshot(company);
  }

  /** {@inheritDoc CompanyAdministrationRepository.updateDocumentNumberingSettings} */
  async updateDocumentNumberingSettings(command: UpdateCompanyDocumentNumberingCommand): Promise<CompanyDocumentNumberingSettings> {
    const current = this.current(command.organizationId, command.companyId, command.expectedVersion);
    current.assertOperational();
    const old = this.numbering.get(current.id) ?? { salesInvoiceNextNumber: 1, deliveryNoteNextNumber: 1 };
    if ((command.salesInvoiceNextNumber !== undefined && command.salesInvoiceNextNumber < old.salesInvoiceNextNumber)
      || (command.deliveryNoteNextNumber !== undefined && command.deliveryNoteNextNumber < old.deliveryNoteNextNumber)) {
      throw new CompanyFailure("COMPANY_DOCUMENT_NUMBER_REWIND", "Document counters cannot be moved backwards.");
    }
    this.numbering.set(current.id, {
      salesInvoiceNextNumber: command.salesInvoiceNextNumber ?? old.salesInvoiceNextNumber,
      deliveryNoteNextNumber: command.deliveryNoteNextNumber ?? old.deliveryNoteNextNumber,
    });
    const updated = this.replace(new Company({ ...current, version: current.version + 1 }));
    return this.numberingSnapshot(updated);
  }

  private current(organizationId: OrganizationId, id: CompanyId, expectedVersion: number): Company {
    const value = this.companies.find(
      (company) => company.organizationId === organizationId && company.id === id,
    );
    if (!value) throw new CompanyFailure("COMPANY_NOT_FOUND", "The company does not exist.");
    if (value.version !== expectedVersion) {
      throw new CompanyFailure("COMPANY_VERSION_CONFLICT", "The company was modified by another operation.");
    }
    return value;
  }

  private replace(company: Company): Company {
    const index = this.companies.findIndex(
      (value) => value.organizationId === company.organizationId && value.id === company.id,
    );
    this.companies.splice(index, 1, company);
    return company;
  }

  private numberingSnapshot(company: Company): CompanyDocumentNumberingSettings {
    const values = this.numbering.get(company.id) ?? { salesInvoiceNextNumber: 1, deliveryNoteNextNumber: 1 };
    return Object.freeze({ ...values, companyVersion: company.version });
  }
}

/** In-memory immutable-policy adapter for application-level authorization, version, and retry tests. */
export class InMemoryCompanyMonetaryPolicyRepository implements CompanyMonetaryPolicyRepository {
  private readonly current = new Map<string, CompanyMonetaryPolicy>();
  private readonly revisions = new Map<string, CompanyMonetaryPolicy>();
  private readonly receipts = new Map<string, { readonly intent: string; readonly policy: CompanyMonetaryPolicy }>();

  /**
   * Seeds an isolated policy store for portable application tests.
   * @param policies - Initial immutable policy revisions.
   * @returns A store with current and historical snapshots copied from the supplied revisions.
   * @throws {CompanyFailure} When a supplied revision violates policy invariants.
   */
  constructor(policies: readonly CompanyMonetaryPolicy[] = []) {
    for (const policy of policies) {
      const valid = companyMonetaryPolicy(policy);
      this.current.set(this.key(valid.organizationId, valid.companyId), valid);
      this.revisions.set(this.revisionKey(valid.organizationId, valid.companyId, valid.version), valid);
    }
  }

  /** {@inheritDoc CompanyMonetaryPolicyRepository.get} */
  async get(query: GetCompanyMonetaryPolicyQuery): Promise<CompanyMonetaryPolicy | null> {
    if (query.policyVersion === undefined) return this.current.get(this.key(query.organizationId, query.companyId)) ?? null;
    const policy = this.revisions.get(this.revisionKey(query.organizationId, query.companyId, query.policyVersion));
    if (!policy) throw new CompanyFailure("COMPANY_MONETARY_POLICY_REVISION_NOT_FOUND", "The monetary policy revision does not exist.");
    return policy;
  }

  /** {@inheritDoc CompanyMonetaryPolicyRepository.configure} */
  async configure(command: ConfigureCompanyMonetaryPolicyCommand): Promise<CompanyMonetaryPolicy> {
    const receiptKey = `${this.key(command.organizationId, command.companyId)}:${command.idempotencyKey}`;
    const intent = JSON.stringify({ actor: command.actorUserId, expected: command.expectedPolicyVersion, reason: command.reason, settings: command.settings });
    const prior = this.receipts.get(receiptKey);
    if (prior) {
      if (prior.intent !== intent) throw new CompanyFailure("COMPANY_MONETARY_POLICY_IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another policy change.");
      return prior.policy;
    }
    const key = this.key(command.organizationId, command.companyId);
    const previous = this.current.get(key);
    const actualVersion = previous?.version ?? 0;
    if (actualVersion !== command.expectedPolicyVersion) throw new CompanyFailure("COMPANY_MONETARY_POLICY_VERSION_CONFLICT", "The monetary policy was modified by another operation.");
    const policy = companyMonetaryPolicy({
      organizationId: command.organizationId, companyId: command.companyId, version: actualVersion + 1,
      operatingCurrency: { code: command.settings.operatingCurrencyCode, minorUnit: command.settings.operatingCurrencyMinorUnit },
      referenceCurrencies: command.settings.referenceCurrencyCodes.map((code) => ({ code, minorUnit: 2 })),
      rateSource: command.settings.rateSource, roundingProfile: command.settings.roundingProfile,
      allowPreviousAvailableDate: command.settings.allowPreviousAvailableDate, maxPreviousDays: command.settings.maxPreviousDays,
      configuredAt: new Date(0).toISOString(), configuredBy: command.actorUserId,
    });
    this.current.set(key, policy);
    this.revisions.set(this.revisionKey(command.organizationId, command.companyId, policy.version), policy);
    this.receipts.set(receiptKey, { intent, policy });
    return policy;
  }

  private key(organizationId: OrganizationId, id: CompanyId): string { return `${organizationId}:${id}`; }
  private revisionKey(organizationId: OrganizationId, id: CompanyId, version: number): string { return `${this.key(organizationId, id)}:${version}`; }
}

/** In-memory date-format adapter matching production revision and retry semantics. */
export class InMemoryCompanyDateFormatRepository implements CompanyDateFormatRepository {
  private readonly current = new Map<string, CompanyDateFormat>();
  private readonly revisions = new Map<string, CompanyDateFormat>();
  private readonly receipts = new Map<string, { readonly intent: string; readonly format: CompanyDateFormat }>();

  /**
   * @param formats - Immutable format revisions used to seed this isolated store.
   * @returns A store retaining current and historical format snapshots.
   * @throws {CompanyFailure} When a supplied revision violates date-format invariants.
   */
  constructor(formats: readonly CompanyDateFormat[] = []) {
    for (const format of formats) {
      const valid = companyDateFormat(format);
      this.current.set(this.key(valid.organizationId, valid.companyId), valid);
      this.revisions.set(this.revisionKey(valid.organizationId, valid.companyId, valid.version), valid);
    }
  }

  /** {@inheritDoc CompanyDateFormatRepository.getDateFormat} */
  async getDateFormat(query: GetCompanyDateFormatQuery): Promise<CompanyDateFormat | null> {
    if (query.formatVersion === undefined) return this.current.get(this.key(query.organizationId, query.companyId)) ?? null;
    const format = this.revisions.get(this.revisionKey(query.organizationId, query.companyId, query.formatVersion));
    if (!format) throw new CompanyFailure("COMPANY_DATE_FORMAT_REVISION_NOT_FOUND", "The company date format revision does not exist.");
    return format;
  }

  /** {@inheritDoc CompanyDateFormatRepository.configureDateFormat} */
  async configureDateFormat(command: ConfigureCompanyDateFormatCommand): Promise<CompanyDateFormat> {
    const scope = this.key(command.organizationId, command.companyId);
    const receiptKey = `${scope}:${command.actorUserId}:${command.idempotencyKey}`;
    const intent = JSON.stringify({ expected: command.expectedFormatVersion, reason: command.reason, dateOrder: command.dateOrder });
    const prior = this.receipts.get(receiptKey);
    if (prior) {
      if (prior.intent !== intent) throw new CompanyFailure("COMPANY_DATE_FORMAT_IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another date format change.");
      return prior.format;
    }
    const actualVersion = this.current.get(scope)?.version ?? 0;
    if (actualVersion !== command.expectedFormatVersion) throw new CompanyFailure("COMPANY_DATE_FORMAT_VERSION_CONFLICT", "The company date format was modified by another operation.");
    const format = companyDateFormat({
      organizationId: command.organizationId, companyId: command.companyId, version: actualVersion + 1,
      dateOrder: command.dateOrder, configuredAt: new Date(0).toISOString(), configuredBy: command.actorUserId,
    });
    this.current.set(scope, format);
    this.revisions.set(this.revisionKey(command.organizationId, command.companyId, format.version), format);
    this.receipts.set(receiptKey, { intent, format });
    return format;
  }

  private key(organizationId: OrganizationId, id: CompanyId): string { return `${organizationId}:${id}`; }
  private revisionKey(organizationId: OrganizationId, id: CompanyId, version: number): string { return `${this.key(organizationId, id)}:${version}`; }
}

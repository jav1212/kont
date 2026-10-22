import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  CompanyAdministrationRepository,
  CompanyBranchConnectivityRepository,
  CompanyMonetaryPolicyRepository,
  CompanyDateFormatRepository,
  ConfigureCompanyMonetaryPolicyCommand,
  ConfigureCompanyDateFormatCommand,
  GetCompanyMonetaryPolicyQuery,
  GetCompanyDateFormatQuery,
  CompanyLifecycleCommand,
  CompanyRepository,
  CreateCompanyCommand,
  UpdateCompanyCommand,
  SetCompanyPersonNatureCommand,
  UpdateCompanyLogoCommand,
  UpdateCompanyDocumentNumberingCommand,
  ListCompanyBranchConnectivityQuery,
  CompanySecondaryTaxIdentifierRepository,
  CompanySecondaryTaxIdentifierScope,
  SetCompanySecondaryTaxIdentifierCommand,
  RemoveCompanySecondaryTaxIdentifierCommand,
  CompanyConfigurationCopyRepository,
  CopyCompanyConfigurationToExistingCommand,
  CreateCompanyFromExistingCommand,
  CompanyConfigurationCopyResult,
  CompanyFiscalProfileRepository,
  CompanyFiscalProfileScope,
  ConfigureCompanyFiscalProfileCommand,
} from "../../application";
import {
  Company,
  CompanyCountry,
  CompanyFailure,
  CompanyStatus,
  companyId,
  taxId,
  type CompanyId,
  type CompanyDocumentNumberingSettings,
  type CompanyBranchConnectivity,
  type CompanyBranchHeartbeat,
  companyMonetaryPolicy,
  type CompanyMonetaryPolicy,
  companyDateFormat,
  type CompanyDateFormat,
  CompanySecondaryTaxIdentifier,
  type CompanyConfigurationCopySection,
  CompanyFiscalProfile,
} from "../../domain";
import { organizationId, type OrganizationId } from "@kontave/organizations/domain";
import { CreateCompanyBranch, GetCompanyBranchSelection, ListCompanyBranchMemberships, ListCompanyBranches, SelectCompanyBranch, SetCompanyBranchMembership, type CompanyBranchRepository, type CreateCompanyBranchCommand, type GetCompanyBranchSelectionQuery, type ListCompanyBranchMembershipsQuery, type ListCompanyBranchesQuery, type SelectCompanyBranchCommand, type SetCompanyBranchMembershipCommand } from "../../application/company-branches";
import { ListCompanyBranchConnectivity, RecordCompanyBranchHeartbeat } from "../../application/company-branch-connectivity";
import { companyBranchMembership, companyBranchSelection, type CompanyBranch, type CompanyBranchMembership, type CompanyBranchSelection } from "../../domain/company-branch";
import { companyBranchConnectivity, companyBranchHeartbeat } from "../../domain/company-branch-connectivity";
import { companyConfigurationCopyResultSchema, companyDateFormatRowSchema, companyFiscalProfileSchema, companyMonetaryPolicyRowSchema, companyRowSchema, legacyCompanyRowSchema, type CompanyDateFormatRow, type CompanyFiscalProfileRow, type CompanyMonetaryPolicyRow, type CompanyRow } from "./persistence-codecs";
import { createSupabaseCompanyDocumentSeriesConfigurationRepository } from "./document-numbering-series";
export * from "./company-logo-storage";
export * from "./document-numbering-series";

/** Credentials required by the server-side service-role company adapter. */
export interface CompanySupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/** Minimal response shape returned by an injectable company persistence source. */
export interface CompanySourceResponse {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

/** Testable persistence boundary for direct company reads and administrative RPC calls. */
export interface CompanySupabaseSource {
  /** @param organizationId - Requested organization. @returns Database response containing rows. */
  listByOrganization(organizationId: OrganizationId): Promise<CompanySourceResponse>;
  /** @param organizationId - Requested organization. @param id - Company ID. @returns Database response containing one row or null. */
  findById(organizationId: OrganizationId, id: CompanyId): Promise<CompanySourceResponse>;
  /** @param company - Snapshot carrying its expected version. @returns Database response containing an ID or null. */
  save(company: Company): Promise<CompanySourceResponse>;
  /** @param name - Stored function name. @param args - Function arguments. @returns Database RPC response. */
  rpc(name: string, args: Record<string, unknown>): Promise<CompanySourceResponse>;
}

/**
 * Creates the legacy-compatible company repository for trusted server consumers.
 * @param configuration - Service-role Supabase configuration.
 * @returns A repository supporting read compatibility before migration 285.
 * @throws {CompanyFailure} When the configured source is unavailable during a call.
 */
export function createCompanyRepository(configuration: CompanySupabaseConfiguration): CompanyRepository {
  return new SupabaseCompanyRepository(createSource(configuration));
}

/**
 * Creates the versioned administrative company repository. Mutations require migration 285.
 * @param configuration - Service-role Supabase configuration.
 * @returns A repository for the versioned company administration use cases.
 * @throws {CompanyFailure} When the configured source is unavailable during a call.
 */
export function createCompanyAdministrationRepository(
  configuration: CompanySupabaseConfiguration,
): CompanyAdministrationRepository {
  return new SupabaseCompanyRepository(createSource(configuration));
}

/**
 * Creates the service-role adapter for immutable company monetary policy revisions.
 * @param configuration - Server-only Supabase service-role configuration.
 * @returns A policy repository backed exclusively by company-scoped RPCs.
 */
export function createCompanyMonetaryPolicyRepository(configuration: CompanySupabaseConfiguration): CompanyMonetaryPolicyRepository {
  return new SupabaseCompanyRepository(createSource(configuration));
}

/**
 * Creates the service-role adapter for immutable company date-format revisions.
 * @param configuration - Server-only Supabase service-role configuration.
 * @returns A repository backed exclusively by company-scoped RPCs.
 */
export function createCompanyDateFormatRepository(configuration: CompanySupabaseConfiguration): CompanyDateFormatRepository {
  return new SupabaseCompanyRepository(createSource(configuration));
}

/**
 * Creates the service-role adapter for a company's typed fiscal address and taxpayer classification.
 * @param configuration - Server-only Supabase credentials.
 * @returns A fiscal-profile repository backed exclusively by company-scoped RPCs.
 * @throws {CompanyFailure} When a query or update cannot reach the configured source.
 */
export function createCompanyFiscalProfileRepository(configuration: CompanySupabaseConfiguration): CompanyFiscalProfileRepository {
  return new SupabaseCompanyFiscalProfileRepository(createSource(configuration));
}

/** Creates a service-role repository for atomic ADM-004 and ADM-006 configuration transfers. @param configuration - Server-only Supabase credentials. @returns Atomic configuration-copy repository. @throws {CompanyFailure} When the source is unavailable. */
export function createCompanyConfigurationCopyRepository(configuration: CompanySupabaseConfiguration): CompanyConfigurationCopyRepository {
  return new SupabaseCompanyRepository(createSource(configuration));
}

/**
 * Creates the service-role adapter for configuring document series and selection rules.
 * Number allocation is intentionally absent: it requires an atomic sales-document issuance adapter.
 * @param configuration - Server-only Supabase credentials.
 * @returns Configuration-only document-series repository.
 * @throws {CompanyFailure} When the Supabase source is unavailable.
 */
export function createCompanyDocumentSeriesConfigurationRepository(
  configuration: CompanySupabaseConfiguration,
): import("../../application").CompanyDocumentSeriesConfigurationRepository {
  return createSupabaseCompanyDocumentSeriesConfigurationRepository(configuration);
}

/**
 * Creates the service-role adapter for secondary company tax identifiers.
 * @param configuration - Server-only Supabase credentials.
 * @returns A repository backed only by company-scoped tax identifier RPCs.
 * @throws {CompanyFailure} When an operation fails or returns invalid data.
 */
export function createCompanySecondaryTaxIdentifierRepository(configuration: CompanySupabaseConfiguration): CompanySecondaryTaxIdentifierRepository {
  return new SupabaseCompanyRepository(createSource(configuration));
}

/** Creates a service-role repository for scoped company branches. @param configuration - Server-only Supabase credentials. @returns Branch persistence port. @throws {CompanyFailure} When an operation fails. */
export function createCompanyBranchRepository(configuration: CompanySupabaseConfiguration): CompanyBranchRepository {
  return new SupabaseCompanyBranchRepository(createSource(configuration));
}

/** Server-only Supabase adapter for company branch creation and listing. */
export class SupabaseCompanyBranchRepository implements CompanyBranchRepository {
  /** @param source - Injected Supabase RPC source. @returns Adapter. */
  constructor(private readonly source: CompanySupabaseSource) {}

  /** @param command - Authenticated idempotent branch creation request. @returns Stored branch. @throws {CompanyFailure} On authorization, conflict, or persistence errors. */
  async createBranch(command: CreateCompanyBranchCommand): Promise<CompanyBranch> {
    try {
      const result = await this.source.rpc("create_native_company_branch", {
        p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId,
        p_company_id: command.companyId, p_idempotency_key: command.idempotencyKey,
        p_code: command.code, p_name: command.name,
      });
      if (result.error) throw mapRpcError(result.error);
      return decodeBranch(result.data);
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** @param query - Authenticated company read scope. @returns Branches ordered by code. @throws {CompanyFailure} On authorization or persistence errors. */
  async listBranches(query: ListCompanyBranchesQuery): Promise<readonly CompanyBranch[]> {
    try {
      const result = await this.source.rpc("list_native_company_branches", {
        p_actor_user_id: query.actorUserId, p_organization_id: query.organizationId, p_company_id: query.companyId,
      });
      if (result.error) throw mapRpcError(result.error);
      if (!Array.isArray(result.data)) throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Branch response is invalid.");
      return Object.freeze(result.data.map(decodeBranch));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** @param query - Authenticated company and user scope. @returns Current choice or the empty version-zero choice. @throws {CompanyFailure} On authorization or persistence errors. */
  async getSelection(query: GetCompanyBranchSelectionQuery): Promise<CompanyBranchSelection> {
    try {
      const result = await this.source.rpc("get_native_company_branch_selection", {
        p_actor_user_id: query.actorUserId, p_organization_id: query.organizationId, p_company_id: query.companyId,
      });
      if (result.error) throw mapRpcError(result.error);
      return decodeBranchSelection(result.data, query);
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** @param command - Authenticated target and expected selection version. @returns The authoritative new choice. @throws {CompanyFailure} On stale or cross-company selection, denied access, or persistence error. */
  async select(command: SelectCompanyBranchCommand): Promise<CompanyBranchSelection> {
    try {
      const result = await this.source.rpc("select_native_company_branch", {
        p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId,
        p_company_id: command.companyId, p_branch_id: command.branchId,
        p_expected_version: command.expectedVersion,
      });
      if (result.error) throw mapRpcError(result.error);
      return decodeBranchSelection(result.data, command);
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** @param query - Authenticated actor and company scope. @returns Assignment snapshots. @throws {CompanyFailure} When branch assignment administration is denied or unavailable. */
  async listMemberships(query: ListCompanyBranchMembershipsQuery): Promise<readonly CompanyBranchMembership[]> {
    try {
      const result = await this.source.rpc("list_native_company_branch_memberships", {
        p_actor_user_id: query.actorUserId, p_organization_id: query.organizationId, p_company_id: query.companyId,
      });
      if (result.error) throw mapRpcError(result.error);
      if (!Array.isArray(result.data)) throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Branch membership response is invalid.");
      return Object.freeze(result.data.map(decodeBranchMembership));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** @param command - Scoped assignment or revocation with expected revision. @returns Persisted membership. @throws {CompanyFailure} When access, target scope or concurrency validation fails. */
  async setMembership(command: SetCompanyBranchMembershipCommand): Promise<CompanyBranchMembership> {
    try {
      const result = await this.source.rpc("set_native_company_branch_membership", {
        p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId,
        p_company_id: command.companyId, p_branch_id: command.branchId, p_user_id: command.userId,
        p_status: command.status, p_expected_version: command.expectedVersion,
      });
      if (result.error) throw mapRpcError(result.error);
      return decodeBranchMembership(result.data);
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }
}

/** Creates branch use cases backed by the server-only Supabase persistence adapter. @param configuration - Server-only Supabase credentials. @returns Branch registration and listing operations. @throws {CompanyFailure} When Supabase credentials cannot create a client. */
export function createCompanyBranchActions(configuration: CompanySupabaseConfiguration): { readonly create: CreateCompanyBranch; readonly list: ListCompanyBranches; readonly getSelection: GetCompanyBranchSelection; readonly select: SelectCompanyBranch; readonly listMemberships: ListCompanyBranchMemberships; readonly setMembership: SetCompanyBranchMembership } {
  const repository = createCompanyBranchRepository(configuration);
  return Object.freeze({ create: new CreateCompanyBranch(repository), list: new ListCompanyBranches(repository), getSelection: new GetCompanyBranchSelection(repository), select: new SelectCompanyBranch(repository), listMemberships: new ListCompanyBranchMemberships(repository), setMembership: new SetCompanyBranchMembership(repository) });
}

/** Creates the server-only repository for authorized branch heartbeat and status RPCs. @param configuration - Server-only Supabase credentials. @returns Branch connectivity persistence port. @throws {CompanyFailure} When an operation fails. */
export function createCompanyBranchConnectivityRepository(configuration: CompanySupabaseConfiguration): CompanyBranchConnectivityRepository {
  return new SupabaseCompanyBranchConnectivityRepository(createSource(configuration));
}

/** Creates use cases for branch heartbeat and connectivity reads. @param configuration - Server-only Supabase credentials. @returns Heartbeat and list operations. @throws {CompanyFailure} When Supabase credentials cannot create a client. */
export function createCompanyBranchConnectivityActions(configuration: CompanySupabaseConfiguration): { readonly heartbeat: RecordCompanyBranchHeartbeat; readonly list: ListCompanyBranchConnectivity } {
  const repository = createCompanyBranchConnectivityRepository(configuration);
  return Object.freeze({ heartbeat: new RecordCompanyBranchHeartbeat(repository), list: new ListCompanyBranchConnectivity(repository) });
}

/** Service-role Supabase adapter for branch presence; it never accesses the table directly. */
export class SupabaseCompanyBranchConnectivityRepository implements CompanyBranchConnectivityRepository {
  /** @param source - Injectable server-side Supabase RPC source. @returns Adapter. */
  constructor(private readonly source: CompanySupabaseSource) {}

  /** {@inheritDoc CompanyBranchConnectivityRepository.recordHeartbeat} */
  async recordHeartbeat(command: Parameters<CompanyBranchConnectivityRepository["recordHeartbeat"]>[0]): Promise<CompanyBranchHeartbeat> {
    try {
      const result = await this.source.rpc("record_native_company_branch_heartbeat", {
        p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId,
        p_company_id: command.companyId, p_branch_id: command.branchId,
        p_client_instance_id: command.clientInstanceId,
      });
      if (result.error) throw mapRpcError(result.error);
      const row = z.object({ branchId: z.string().uuid(), clientInstanceId: z.string().uuid(), lastSeenAt: z.string().datetime({ offset: true }) }).safeParse(result.data);
      if (!row.success) throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Branch heartbeat response is invalid.", { cause: row.error });
      return companyBranchHeartbeat(row.data);
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure && cause.code !== "COMPANY_BRANCH_CONNECTIVITY_INVALID") throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** {@inheritDoc CompanyBranchConnectivityRepository.listStatuses} */
  async listStatuses(query: ListCompanyBranchConnectivityQuery): Promise<readonly CompanyBranchConnectivity[]> {
    try {
      const result = await this.source.rpc("get_native_company_branch_connectivity", {
        p_actor_user_id: query.actorUserId, p_organization_id: query.organizationId, p_company_id: query.companyId,
      });
      if (result.error) throw mapRpcError(result.error);
      if (!Array.isArray(result.data)) throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Branch connectivity response is invalid.");
      return Object.freeze(result.data.map((value) => {
        const row = z.object({ branchId: z.string().uuid(), online: z.boolean(), connectedClientCount: z.number().int().nonnegative(), lastSeenAt: z.string().datetime({ offset: true }).nullable() }).safeParse(value);
        if (!row.success) throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Branch connectivity response is invalid.", { cause: row.error });
        return companyBranchConnectivity(row.data);
      }));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure && cause.code !== "COMPANY_BRANCH_CONNECTIVITY_INVALID") throw cause;
      throw repositoryFailure(cause);
    }
  }
}

/** Supabase adapter with legacy-safe reads and SQL-owned administrative mutations. */
export class SupabaseCompanyRepository implements CompanyRepository, CompanyAdministrationRepository, CompanyMonetaryPolicyRepository, CompanyDateFormatRepository, CompanySecondaryTaxIdentifierRepository, CompanyConfigurationCopyRepository {
  /**
   * @param source - Injectable persistence source.
   */
  constructor(private readonly source: CompanySupabaseSource) {}

  /** {@inheritDoc CompanyRepository.listByOrganization} */
  async listByOrganization(target: OrganizationId): Promise<readonly Company[]> {
    try {
      const response = await this.source.listByOrganization(target);
      if (response.error) throw repositoryFailure(response.error);
      if (!Array.isArray(response.data)) throw repositoryFailure(new TypeError("Company list is malformed."));
      return response.data.map(decodeReadRow).map(mapCompany);
    } catch (cause: unknown) {
      throw sourceFailure(cause);
    }
  }

  /** {@inheritDoc CompanyRepository.findById} */
  async findById(targetOrganizationId: OrganizationId, id: CompanyId): Promise<Company | null> {
    try {
      const response = await this.source.findById(targetOrganizationId, id);
      if (response.error) throw repositoryFailure(response.error);
      return response.data === null ? null : mapCompany(decodeReadRow(response.data));
    } catch (cause: unknown) {
      throw sourceFailure(cause);
    }
  }

  /** {@inheritDoc CompanyRepository.save} */
  async save(company: Company): Promise<void> {
    try {
      const response = await this.source.save(company);
      if (response.error) throw repositoryFailure(response.error);
      if (response.data === null) throw await this.noRowFailure(company.organizationId, company.id);
      if (!hasMatchingSaveId(response.data, company.id)) {
        throw repositoryFailure(new TypeError("Company save returned an invalid row."));
      }
    } catch (cause: unknown) {
      throw sourceFailure(cause);
    }
  }

  /** {@inheritDoc CompanyAdministrationRepository.create} */
  create(command: CreateCompanyCommand): Promise<Company> {
    return this.rpcCompany("create_native_company_with_person_nature", {
      p_actor_user_id: command.actorUserId,
      p_organization_id: command.organizationId,
      p_idempotency_key: command.idempotencyKey,
      p_legal_name: command.legalName,
      p_trade_name: command.tradeName,
      p_tax_id: command.taxId,
      p_country: command.country,
      p_operating_profile: command.operatingProfile,
      p_person_nature: command.personNature,
    });
  }

  /** {@inheritDoc CompanyAdministrationRepository.setPersonNature} */
  setPersonNature(command: SetCompanyPersonNatureCommand): Promise<Company> {
    return this.rpcCompany("set_native_company_person_nature", {
      p_actor_user_id: command.actorUserId,
      p_organization_id: command.organizationId,
      p_company_id: command.companyId,
      p_expected_version: command.expectedVersion,
      p_person_nature: command.personNature,
    });
  }

  /** {@inheritDoc CompanyAdministrationRepository.update} */
  update(command: UpdateCompanyCommand): Promise<Company> {
    const changes: Record<string, unknown> = {};
    if (command.legalName !== undefined) changes.legalName = command.legalName;
    if (command.tradeName !== undefined) changes.tradeName = command.tradeName;
    if (command.taxId !== undefined) changes.taxId = command.taxId;
    if (command.operatingProfile !== undefined) changes.operatingProfile = command.operatingProfile;
    return this.rpcCompany("update_native_company", {
      p_actor_user_id: command.actorUserId,
      p_organization_id: command.organizationId,
      p_company_id: command.companyId,
      p_expected_version: command.expectedVersion,
      p_changes: changes,
    });
  }

  /** {@inheritDoc CompanyAdministrationRepository.updateLogo} */
  updateLogo(command: UpdateCompanyLogoCommand): Promise<Company> {
    return this.rpcCompany("update_native_company_logo", {
      p_actor_user_id: command.actorUserId,
      p_organization_id: command.organizationId,
      p_company_id: command.companyId,
      p_expected_version: command.expectedVersion,
      p_logo_url: command.logoUrl,
    });
  }

  /** {@inheritDoc CompanyAdministrationRepository.setStatus} */
  setStatus(command: CompanyLifecycleCommand, target: CompanyStatus): Promise<Company> {
    return this.rpcCompany("set_native_company_status", {
      p_actor_user_id: command.actorUserId,
      p_organization_id: command.organizationId,
      p_company_id: command.companyId,
      p_expected_version: command.expectedVersion,
      p_status: target,
    });
  }

  /** {@inheritDoc CompanyAdministrationRepository.getDocumentNumberingSettings} */
  getDocumentNumberingSettings(command: CompanyLifecycleCommand): Promise<CompanyDocumentNumberingSettings> {
    return this.rpcNumbering("get_native_company_document_numbering", {
      p_actor_user_id: command.actorUserId,
      p_organization_id: command.organizationId,
      p_company_id: command.companyId,
      p_expected_version: command.expectedVersion,
    });
  }

  /** {@inheritDoc CompanyAdministrationRepository.updateDocumentNumberingSettings} */
  updateDocumentNumberingSettings(command: UpdateCompanyDocumentNumberingCommand): Promise<CompanyDocumentNumberingSettings> {
    return this.rpcNumbering("update_native_company_document_numbering", {
      p_actor_user_id: command.actorUserId,
      p_organization_id: command.organizationId,
      p_company_id: command.companyId,
      p_expected_version: command.expectedVersion,
      p_sales_invoice_next_number: command.salesInvoiceNextNumber ?? null,
      p_delivery_note_next_number: command.deliveryNoteNextNumber ?? null,
    });
  }

  /** {@inheritDoc CompanySecondaryTaxIdentifierRepository.list} */
  async list(scope: CompanySecondaryTaxIdentifierScope): Promise<readonly CompanySecondaryTaxIdentifier[]> {
    try {
      const response = await this.source.rpc("get_native_company_secondary_tax_identifiers", {
        p_actor_user_id: scope.actorUserId, p_organization_id: scope.organizationId, p_company_id: scope.companyId,
      });
      if (response.error) throw mapRpcError(response.error);
      if (!Array.isArray(response.data)) throw repositoryFailure(new TypeError("Secondary tax identifiers response is invalid."));
      return Object.freeze(response.data.map(mapSecondaryTaxIdentifier));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** {@inheritDoc CompanySecondaryTaxIdentifierRepository.set} */
  async set(command: SetCompanySecondaryTaxIdentifierCommand): Promise<CompanySecondaryTaxIdentifier> {
    try {
      const response = await this.source.rpc("set_native_company_secondary_tax_identifier", {
        p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId,
        p_company_id: command.companyId, p_jurisdiction: command.jurisdiction,
        p_scheme: command.scheme, p_identifier_value: command.value, p_expected_version: command.expectedVersion,
      });
      if (response.error) throw mapRpcError(response.error);
      return mapSecondaryTaxIdentifier(response.data);
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** {@inheritDoc CompanySecondaryTaxIdentifierRepository.remove} */
  async remove(command: RemoveCompanySecondaryTaxIdentifierCommand): Promise<void> {
    try {
      const response = await this.source.rpc("remove_native_company_secondary_tax_identifier", {
        p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId,
        p_company_id: command.companyId, p_jurisdiction: command.jurisdiction,
        p_scheme: command.scheme, p_expected_version: command.expectedVersion,
      });
      if (response.error) throw mapRpcError(response.error);
      if (response.data !== true) throw repositoryFailure(new TypeError("Secondary tax identifier removal was not confirmed."));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** {@inheritDoc CompanyMonetaryPolicyRepository.get} */
  async get(query: GetCompanyMonetaryPolicyQuery): Promise<CompanyMonetaryPolicy | null> {
    try {
      const response = await this.source.rpc("get_native_company_monetary_policy", {
        p_actor_user_id: query.actorUserId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_policy_version: query.policyVersion ?? null,
      });
      if (response.error) throw mapRpcError(response.error);
      if (response.data === null) return null;
      return mapMonetaryPolicy(decodeMonetaryPolicyRow(response.data));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** {@inheritDoc CompanyMonetaryPolicyRepository.configure} */
  async configure(command: ConfigureCompanyMonetaryPolicyCommand): Promise<CompanyMonetaryPolicy> {
    try {
      const response = await this.source.rpc("configure_native_company_monetary_policy", {
        p_actor_user_id: command.actorUserId,
        p_organization_id: command.organizationId,
        p_company_id: command.companyId,
        p_expected_policy_version: command.expectedPolicyVersion,
        p_idempotency_key: command.idempotencyKey,
        p_reason: command.reason,
        p_policy: {
          operatingCurrency: { code: command.settings.operatingCurrencyCode, minorUnit: command.settings.operatingCurrencyMinorUnit },
          referenceCurrencyCodes: command.settings.referenceCurrencyCodes,
          rateSource: command.settings.rateSource,
          roundingProfile: command.settings.roundingProfile,
          allowPreviousAvailableDate: command.settings.allowPreviousAvailableDate,
          maxPreviousDays: command.settings.maxPreviousDays,
        },
      });
      if (response.error) throw mapRpcError(response.error);
      return mapMonetaryPolicy(decodeMonetaryPolicyRow(response.data));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** {@inheritDoc CompanyDateFormatRepository.getDateFormat} */
  async getDateFormat(query: GetCompanyDateFormatQuery): Promise<CompanyDateFormat | null> {
    try {
      const response = await this.source.rpc("get_native_company_date_format", {
        p_actor_user_id: query.actorUserId,
        p_organization_id: query.organizationId,
        p_company_id: query.companyId,
        p_format_version: query.formatVersion ?? null,
      });
      if (response.error) throw mapRpcError(response.error);
      if (response.data === null) return null;
      return mapDateFormat(decodeDateFormatRow(response.data));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** {@inheritDoc CompanyDateFormatRepository.configureDateFormat} */
  async configureDateFormat(command: ConfigureCompanyDateFormatCommand): Promise<CompanyDateFormat> {
    try {
      const response = await this.source.rpc("configure_native_company_date_format", {
        p_actor_user_id: command.actorUserId,
        p_organization_id: command.organizationId,
        p_company_id: command.companyId,
        p_expected_format_version: command.expectedFormatVersion,
        p_idempotency_key: command.idempotencyKey,
        p_reason: command.reason,
        p_date_order: command.dateOrder,
      });
      if (response.error) throw mapRpcError(response.error);
      return mapDateFormat(decodeDateFormatRow(response.data));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** {@inheritDoc CompanyConfigurationCopyRepository.copyToExisting} */
  async copyToExisting(command: CopyCompanyConfigurationToExistingCommand): Promise<CompanyConfigurationCopyResult> {
    if (command.selection.sections.includes("fiscal_profile")) {
      throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Fiscal configuration copy requires a validated persistence migration.");
    }
    return this.rpcConfigurationCopy("copy_native_company_configuration", {
      p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId,
      p_source_company_id: command.sourceCompanyId, p_expected_source_company_version: command.expectedSourceCompanyVersion,
      p_destination_company_id: command.destinationCompanyId, p_expected_destination_company_version: command.expectedDestinationCompanyVersion,
      p_expected_source_date_format_version: command.selection.expectedSourceDateFormatVersion ?? null,
      p_expected_source_monetary_policy_version: command.selection.expectedSourceMonetaryPolicyVersion ?? null,
      p_expected_destination_date_format_version: command.expectedDestinationDateFormatVersion ?? null,
      p_expected_destination_monetary_policy_version: command.expectedDestinationMonetaryPolicyVersion ?? null,
      p_idempotency_key: command.idempotencyKey, p_sections: command.selection.sections,
    });
  }

  /** {@inheritDoc CompanyConfigurationCopyRepository.createFromExisting} */
  async createFromExisting(command: CreateCompanyFromExistingCommand): Promise<CompanyConfigurationCopyResult> {
    if (command.selection.sections.includes("fiscal_profile")) {
      throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Fiscal configuration copy requires a validated persistence migration.");
    }
    return this.rpcConfigurationCopy("create_native_company_from_existing", {
      p_actor_user_id: command.actorUserId, p_organization_id: command.organizationId,
      p_source_company_id: command.sourceCompanyId, p_expected_source_company_version: command.expectedSourceCompanyVersion,
      p_expected_source_date_format_version: command.selection.expectedSourceDateFormatVersion ?? null,
      p_expected_source_monetary_policy_version: command.selection.expectedSourceMonetaryPolicyVersion ?? null,
      p_idempotency_key: command.idempotencyKey, p_sections: command.selection.sections,
      p_target: { legalName: command.target.legalName, tradeName: command.target.tradeName, taxId: command.target.taxId, country: command.target.country, personNature: command.target.personNature },
    });
  }

  private async rpcConfigurationCopy(name: string, args: Record<string, unknown>): Promise<CompanyConfigurationCopyResult> {
    try {
      const response = await this.source.rpc(name, args);
      if (response.error) throw mapConfigurationCopyRpcError(response.error);
      const parsed = companyConfigurationCopyResultSchema.safeParse(response.data);
      if (!parsed.success) throw repositoryFailure(parsed.error);
      return Object.freeze({ company: mapCompany(parsed.data.company), copiedSections: Object.freeze([...parsed.data.copied_sections]) as readonly CompanyConfigurationCopySection[] });
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  private async rpcCompany(name: string, args: Record<string, unknown>): Promise<Company> {
    try {
      const response = await this.source.rpc(name, args);
      if (response.error) throw mapRpcError(response.error);
      return mapCompany(decodeStrictRow(response.data));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  private async rpcNumbering(name: string, args: Record<string, unknown>): Promise<CompanyDocumentNumberingSettings> {
    try {
      const response = await this.source.rpc(name, args);
      if (response.error) throw mapRpcError(response.error);
      return decodeNumberingSettings(response.data);
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  private async noRowFailure(target: OrganizationId, id: CompanyId): Promise<CompanyFailure> {
    const current = await this.findById(target, id);
    return current
      ? new CompanyFailure("COMPANY_VERSION_CONFLICT", "The company was modified by another operation.")
      : new CompanyFailure("COMPANY_NOT_FOUND", "The company does not exist.");
  }
}

/** Server-only adapter for the typed fiscal fields kept on the company record. */
export class SupabaseCompanyFiscalProfileRepository implements CompanyFiscalProfileRepository {
  /**
   * @param source - Injected RPC source for deterministic adapter tests.
   * @returns A fiscal-profile persistence adapter.
   */
  constructor(private readonly source: CompanySupabaseSource) {}

  /** {@inheritDoc CompanyFiscalProfileRepository.get} */
  async get(scope: CompanyFiscalProfileScope): Promise<CompanyFiscalProfile> {
    try {
      const response = await this.source.rpc("get_native_company_fiscal_profile", {
        p_actor_user_id: scope.actorUserId,
        p_organization_id: scope.organizationId,
        p_company_id: scope.companyId,
      });
      if (response.error) throw mapFiscalProfileRpcError(response.error);
      return mapFiscalProfile(decodeFiscalProfileRow(response.data));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }

  /** {@inheritDoc CompanyFiscalProfileRepository.configure} */
  async configure(command: ConfigureCompanyFiscalProfileCommand): Promise<CompanyFiscalProfile> {
    try {
      const response = await this.source.rpc("configure_native_company_fiscal_profile", {
        p_actor_user_id: command.actorUserId,
        p_organization_id: command.organizationId,
        p_company_id: command.companyId,
        p_expected_version: command.expectedCompanyVersion,
        p_idempotency_key: command.idempotencyKey,
        p_reason: command.reason,
        p_fiscal_address: command.fiscalAddress,
        p_taxpayer_type: command.taxpayerType,
      });
      if (response.error) throw mapFiscalProfileRpcError(response.error);
      return mapFiscalProfile(decodeFiscalProfileRow(response.data));
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw repositoryFailure(cause);
    }
  }
}

class SupabaseClientCompanySource implements CompanySupabaseSource {
  constructor(private readonly client: SupabaseClient) {}
  async listByOrganization(organizationId: OrganizationId): Promise<CompanySourceResponse> {
    return response(await this.client.from("shared_companies").select("*").eq("organization_id", organizationId).order("name"));
  }
  async findById(organizationId: OrganizationId, id: CompanyId): Promise<CompanySourceResponse> {
    return response(await this.client.from("shared_companies").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle());
  }
  async save(company: Company): Promise<CompanySourceResponse> {
    return response(await this.client.from("shared_companies").update({ name: company.legalName, rif: company.taxId, trade_name: company.tradeName, operating_profile: company.operatingProfile, status: company.status }).eq("id", company.id).eq("organization_id", company.organizationId).eq("version", company.version).select("id").maybeSingle());
  }
  async rpc(name: string, args: Record<string, unknown>): Promise<CompanySourceResponse> { return response(await this.client.rpc(name, args)); }
}

function createSource(configuration: CompanySupabaseConfiguration): CompanySupabaseSource {
  return new SupabaseClientCompanySource(createClient(configuration.url, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
}
function response(value: { readonly data: unknown; readonly error: { readonly message: string } | null }): CompanySourceResponse { return value; }
function decodeBranch(value: unknown): CompanyBranch {
  const row = z.object({ id: z.string().uuid(), tenant_id: z.string().uuid(), organization_id: z.string().uuid(), company_id: z.string().min(1), code: z.string().min(1), name: z.string().min(1), created_by: z.string().uuid(), created_at: z.string().datetime({ offset: true }) }).safeParse(value);
  if (!row.success) throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Branch response is invalid.", { cause: row.error });
  return Object.freeze({ id: row.data.id, tenantId: row.data.tenant_id, organizationId: organizationId(row.data.organization_id), companyId: companyId(row.data.company_id), code: row.data.code, name: row.data.name, createdBy: row.data.created_by as import("@kontave/organizations/domain").UserId, createdAt: row.data.created_at });
}
function decodeBranchSelection(value: unknown, expected: GetCompanyBranchSelectionQuery): CompanyBranchSelection {
  const row = z.object({ user_id: z.string().uuid(), organization_id: z.string().uuid(), company_id: z.string().min(1), branch_id: z.string().uuid().nullable(), version: z.number().int().nonnegative(), updated_at: z.string().datetime({ offset: true }).nullable() }).safeParse(value);
  if (!row.success) throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Branch selection response is invalid.", { cause: row.error });
  if (row.data.user_id !== expected.actorUserId || row.data.organization_id !== expected.organizationId || row.data.company_id !== expected.companyId) {
    throw new CompanyFailure("COMPANY_BRANCH_SELECTION_ACCESS_DENIED", "Branch selection belongs to another workspace.");
  }
  return companyBranchSelection({ actorUserId: row.data.user_id as import("@kontave/organizations/domain").UserId, organizationId: organizationId(row.data.organization_id), companyId: companyId(row.data.company_id), branchId: row.data.branch_id, version: row.data.version, updatedAt: row.data.updated_at });
}
function decodeBranchMembership(value: unknown): CompanyBranchMembership {
  const row = z.object({ organization_id: z.string().uuid(), company_id: z.string().min(1), branch_id: z.string().uuid(), user_id: z.string().uuid(), status: z.enum(["active", "revoked"]), version: z.number().int().positive(), changed_by: z.string().uuid(), updated_at: z.string().datetime({ offset: true }) }).safeParse(value);
  if (!row.success) throw new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "Branch membership response is invalid.", { cause: row.error });
  return companyBranchMembership({ organizationId: organizationId(row.data.organization_id), companyId: companyId(row.data.company_id), branchId: row.data.branch_id, userId: row.data.user_id as import("@kontave/organizations/domain").UserId, status: row.data.status, version: row.data.version, changedBy: row.data.changed_by as import("@kontave/organizations/domain").UserId, updatedAt: row.data.updated_at });
}
function decodeReadRow(value: unknown): CompanyRow {
  if (hasNoAdministrationFields(value)) {
    const legacy = legacyCompanyRowSchema.safeParse(value);
    if (legacy.success) return { ...legacy.data, trade_name: null, country: "VE", status: "active", version: 1, logo_url: legacy.data.logo_url ?? null };
  }
  return decodeStrictRow(value);
}
function hasNoAdministrationFields(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !("trade_name" in value) && !("country" in value) && !("status" in value) && !("version" in value); }
function decodeStrictRow(value: unknown): CompanyRow { const parsed = companyRowSchema.safeParse(value); if (!parsed.success) throw repositoryFailure(parsed.error); return parsed.data; }
function mapCompany(row: CompanyRow): Company { return new Company({ id: companyId(row.id), organizationId: organizationId(row.organization_id), legacyCompanyId: row.id, legalName: row.name, tradeName: row.trade_name, taxId: readLegacyTaxId(row.rif), country: CompanyCountry.Venezuela, status: row.status as CompanyStatus, operatingProfile: row.operating_profile, personNature: row.person_nature, logoUrl: row.logo_url, version: row.version }); }
function readLegacyTaxId(value: string | null) { if (!value) return null; try { return taxId(value); } catch (cause: unknown) { if (cause instanceof CompanyFailure && cause.code === "COMPANY_INVALID") return null; throw cause; } }
function decodeNumberingSettings(value: unknown): CompanyDocumentNumberingSettings {
  if (typeof value !== "object" || value === null) throw repositoryFailure(new TypeError("Numbering settings are malformed."));
  const row = value as Record<string, unknown>;
  if (![row.sales_invoice_next_number, row.delivery_note_next_number, row.company_version].every((item) => typeof item === "number" && Number.isSafeInteger(item) && item >= 1)) {
    throw repositoryFailure(new TypeError("Numbering settings are malformed."));
  }
  return Object.freeze({
    salesInvoiceNextNumber: row.sales_invoice_next_number as number,
    deliveryNoteNextNumber: row.delivery_note_next_number as number,
    companyVersion: row.company_version as number,
  });
}
function decodeMonetaryPolicyRow(value: unknown): CompanyMonetaryPolicyRow { const parsed = companyMonetaryPolicyRowSchema.safeParse(value); if (!parsed.success) throw repositoryFailure(parsed.error); return parsed.data; }
function decodeDateFormatRow(value: unknown): CompanyDateFormatRow { const parsed = companyDateFormatRowSchema.safeParse(value); if (!parsed.success) throw repositoryFailure(parsed.error); return parsed.data; }
function decodeFiscalProfileRow(value: unknown): CompanyFiscalProfileRow { const parsed = companyFiscalProfileSchema.safeParse(value); if (!parsed.success) throw repositoryFailure(parsed.error); return parsed.data; }
function mapFiscalProfile(row: CompanyFiscalProfileRow): CompanyFiscalProfile {
  return new CompanyFiscalProfile({
    companyId: companyId(row.companyId), legalName: row.legalName, taxId: row.taxId,
    personNature: row.personNature, fiscalAddress: row.fiscalAddress,
    taxpayerType: row.taxpayerType, companyVersion: row.companyVersion,
  });
}
function mapSecondaryTaxIdentifier(value: unknown): CompanySecondaryTaxIdentifier {
  const parsed = z.object({
    id: z.string().uuid(), organization_id: z.string().uuid(), company_id: z.string().min(1),
    jurisdiction: z.string().regex(/^[A-Z]{2}$/), scheme: z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/),
    identifier_value: z.string().min(1).max(128), version: z.number().int().positive(),
    created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
  }).safeParse(value);
  if (!parsed.success) throw repositoryFailure(parsed.error);
  return new CompanySecondaryTaxIdentifier({
    id: parsed.data.id, organizationId: organizationId(parsed.data.organization_id),
    companyId: companyId(parsed.data.company_id), jurisdiction: parsed.data.jurisdiction,
    scheme: parsed.data.scheme, value: parsed.data.identifier_value, version: parsed.data.version,
    createdAt: parsed.data.created_at, updatedAt: parsed.data.updated_at,
  });
}
function mapMonetaryPolicy(row: CompanyMonetaryPolicyRow): CompanyMonetaryPolicy {
  return companyMonetaryPolicy({
    organizationId: organizationId(row.organization_id), companyId: companyId(row.company_id), version: row.policy_version,
    operatingCurrency: { code: row.operating_currency_code as never, minorUnit: row.operating_currency_minor_unit },
    referenceCurrencies: row.reference_currency_codes.map((code) => ({ code: code as never, minorUnit: 2 })),
    rateSource: row.rate_source, roundingProfile: row.rounding_profile,
    allowPreviousAvailableDate: row.allow_previous_available_date, maxPreviousDays: row.max_previous_days,
    configuredAt: row.configured_at, configuredBy: row.configured_by as never,
  });
}
function mapDateFormat(row: CompanyDateFormatRow): CompanyDateFormat {
  return companyDateFormat({
    organizationId: organizationId(row.organization_id), companyId: companyId(row.company_id), version: row.format_version,
    dateOrder: row.date_order, configuredAt: row.configured_at, configuredBy: row.configured_by as never,
  });
}
function mapConfigurationCopyRpcError(error: { readonly message: string }): CompanyFailure {
  const codes = ["COMPANY_CONFIGURATION_COPY_IDEMPOTENCY_CONFLICT", "COMPANY_CONFIGURATION_COPY_VERSION_CONFLICT", "COMPANY_CONFIGURATION_SOURCE_SETTINGS_ABSENT", "COMPANY_CONFIGURATION_COPY_INVALID"] as const;
  const code = codes.find((candidate) => error.message.includes(candidate));
  return code ? new CompanyFailure(code, error.message, { cause: error }) : mapRpcError(error);
}
/** Converts fiscal RPC errors to stable public messages while retaining the original cause for server diagnostics. */
function mapFiscalProfileRpcError(error: { readonly message: string }): CompanyFailure {
  const mapped = mapRpcError(error);
  return new CompanyFailure(mapped.code, "The fiscal profile request was rejected.", { cause: error });
}
function mapRpcError(error: { readonly message: string }): CompanyFailure { const codes = ["COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT", "COMPANY_SECONDARY_TAX_IDENTIFIER_NOT_FOUND", "COMPANY_SECONDARY_TAX_IDENTIFIER_INVALID", "COMPANY_FISCAL_PROFILE_INVALID", "COMPANY_FISCAL_PROFILE_IDEMPOTENCY_CONFLICT", "COMPANY_FISCAL_PROFILE_UNCHANGED", "COMPANY_ORGANIZATION_NOT_READY", "COMPANY_IDEMPOTENCY_CONFLICT", "COMPANY_ALREADY_EXISTS", "COMPANY_VERSION_CONFLICT", "COMPANY_ACCESS_DENIED", "COMPANY_NOT_FOUND", "COMPANY_TRANSITION_INVALID", "COMPANY_INVALID", "COMPANY_DOCUMENT_NUMBER_INVALID", "COMPANY_DOCUMENT_NUMBER_REWIND", "COMPANY_DOCUMENT_NUMBER_IN_USE", "COMPANY_MONETARY_POLICY_INVALID", "COMPANY_MONETARY_POLICY_NOT_CONFIGURED", "COMPANY_MONETARY_POLICY_REVISION_NOT_FOUND", "COMPANY_MONETARY_POLICY_VERSION_CONFLICT", "COMPANY_MONETARY_POLICY_IDEMPOTENCY_CONFLICT", "COMPANY_DATE_FORMAT_INVALID", "COMPANY_DATE_FORMAT_REVISION_NOT_FOUND", "COMPANY_DATE_FORMAT_VERSION_CONFLICT", "COMPANY_DATE_FORMAT_IDEMPOTENCY_CONFLICT", "COMPANY_LOGO_INVALID", "COMPANY_LOGO_EVENT_IMMUTABLE", "COMPANY_BRANCH_INVALID", "COMPANY_BRANCH_ALREADY_EXISTS", "COMPANY_BRANCH_IDEMPOTENCY_CONFLICT", "COMPANY_BRANCH_COMPANY_NOT_FOUND", "COMPANY_BRANCH_COMPANY_NOT_OPERATIONAL", "COMPANY_BRANCH_NOT_FOUND", "COMPANY_BRANCH_SELECTION_INVALID", "COMPANY_BRANCH_SELECTION_VERSION_CONFLICT", "COMPANY_BRANCH_SELECTION_ACCESS_DENIED", "COMPANY_BRANCH_MEMBERSHIP_INVALID", "COMPANY_BRANCH_MEMBER_NOT_FOUND", "COMPANY_BRANCH_MEMBERSHIP_NOT_FOUND", "COMPANY_BRANCH_MEMBERSHIP_VERSION_CONFLICT", "COMPANY_BRANCH_ASSIGNMENT_REQUIRED", "COMPANY_BRANCH_CONNECTIVITY_INVALID", "COMPANY_BRANCH_CONNECTIVITY_ACCESS_DENIED"] as const; const code = codes.find((candidate) => error.message.includes(candidate)); return new CompanyFailure(code ?? "COMPANY_REPOSITORY_UNAVAILABLE", code ? error.message : "Company repository is unavailable.", { cause: error }); }
function repositoryFailure(cause: unknown): CompanyFailure { return new CompanyFailure("COMPANY_REPOSITORY_UNAVAILABLE", "No se pudo acceder a las empresas.", { cause }); }
function sourceFailure(cause: unknown): CompanyFailure { return cause instanceof CompanyFailure ? cause : repositoryFailure(cause); }
function hasMatchingSaveId(value: unknown, id: CompanyId): boolean { return typeof value === "object" && value !== null && "id" in value && value.id === id; }

import { PERMISSIONS, permissionCode, type PermissionCode } from "@kontave/access-control-domain";
import type {
  DelegatedOrganizationAccess,
  OrganizationDelegationRepository,
} from "@kontave/organization-delegations-application";
import {
  DelegatedScope,
  DelegationAssignmentStatus,
  OrganizationAccessFailure,
  OrganizationAccessPathKind,
  isDelegationEffective,
  type AccessibleOrganization,
  type OrganizationAccessPath,
  type OrganizationDelegation,
} from "@kontave/organization-delegations-domain";
import { OrganizationRelationship, type CompanyId as OrganizationCompanyId, type OrganizationCompany, type OrganizationId, type UserId } from "@kontave/organizations-domain";
import type { OrganizationPresentationDirectory } from "@kontave/organizations-application";
import type { CompanyRepository } from "@kontave/companies-application";
import { CompanyFailure, type Company, type CompanyId } from "@kontave/companies-domain";
import type { AvailableOrganizationModule } from "@kontave/modules-application";
import type { ModuleCapability, ModuleCode } from "@kontave/modules-domain";

export interface CompanyExecutionContext {
  readonly actorUserId: UserId;
  readonly actingOrganizationId: OrganizationId;
  readonly targetOrganizationId: OrganizationId;
  readonly company: Company;
  readonly accessPath: OrganizationAccessPath;
}

export interface CompanyCapabilityRequirement {
  execute(companyId: CompanyId, capability: ModuleCapability): Promise<void>;
}

export class ResolveCompanyExecutionContext {
  constructor(
    private readonly accessPaths: ResolveWorkspaceAccessPath,
    private readonly companies: CompanyRepository,
    private readonly capabilities: CompanyCapabilityRequirement,
  ) {}
  async execute(input: {
    readonly userId: UserId;
    readonly actingOrganizationId: OrganizationId;
    readonly targetOrganizationId: OrganizationId;
    readonly companyId: CompanyId;
    readonly capability: ModuleCapability;
    readonly occurredAt: string;
  }): Promise<CompanyExecutionContext> {
    const accessPath = await this.accessPaths.execute(input);
    const company = await this.companies.findById(input.targetOrganizationId, input.companyId);
    if (!company) throw new CompanyFailure("COMPANY_NOT_FOUND", "The company does not exist.");
    company.assertBelongsTo(input.targetOrganizationId);
    company.assertOperational();
    await this.capabilities.execute(company.id, input.capability);
    return { actorUserId: input.userId, actingOrganizationId: input.actingOrganizationId, targetOrganizationId: input.targetOrganizationId, company, accessPath };
  }
}

export interface DirectOrganizationAccess {
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly relationship: "personal" | "member";
}

export interface DirectOrganizationAccessDirectory {
  listForUser(userId: UserId): Promise<readonly DirectOrganizationAccess[]>;
  findForUser(userId: UserId, organizationId: OrganizationId): Promise<DirectOrganizationAccess | null>;
}

export interface WorkspacePortfolioEntry extends AccessibleOrganization {
  readonly avatarUrl: string | null;
  readonly relationship: OrganizationRelationship;
}

export interface WorkspacePortfolioSource {
  list(): Promise<readonly WorkspacePortfolioEntry[]>;
}

export interface ActiveWorkspaceSelectionStore {
  read(): Promise<OrganizationId | null>;
  write(organizationId: OrganizationId | null): Promise<void>;
}

export interface ActiveWorkspaceContext {
  readonly portfolio: readonly WorkspacePortfolioEntry[];
  readonly active: WorkspacePortfolioEntry | null;
}

const EMPTY_WORKSPACE_CONTEXT: ActiveWorkspaceContext = Object.freeze({
  portfolio: Object.freeze([]),
  active: null,
});

/**
 * Owns portable workspace selection policy. Fetching and persistence remain
 * ports because credentials and storage are platform concerns.
 */
export class WorkspaceContextSession {
  private context: ActiveWorkspaceContext = EMPTY_WORKSPACE_CONTEXT;

  constructor(
    private readonly portfolioSource: WorkspacePortfolioSource,
    private readonly selectionStore: ActiveWorkspaceSelectionStore,
  ) {}

  get current(): ActiveWorkspaceContext { return this.context; }

  async restore(): Promise<ActiveWorkspaceContext> {
    const portfolio = Object.freeze([...(await this.portfolioSource.list())]);
    const storedOrganizationId = await this.selectionStore.read();
    const active = selectRestoredWorkspace(portfolio, storedOrganizationId);
    this.context = Object.freeze({ portfolio, active });
    await this.selectionStore.write(active?.organizationId ?? null);
    return this.context;
  }

  async select(organizationId: OrganizationId): Promise<ActiveWorkspaceContext> {
    const active = this.context.portfolio.find((entry) => entry.organizationId === organizationId);
    if (!active) {
      throw new OrganizationAccessFailure("ACCESS_PATH_NOT_FOUND", "El espacio de trabajo no está disponible.");
    }
    this.context = Object.freeze({ portfolio: this.context.portfolio, active });
    await this.selectionStore.write(active.organizationId);
    return this.context;
  }

  async clear(): Promise<ActiveWorkspaceContext> {
    this.context = EMPTY_WORKSPACE_CONTEXT;
    await this.selectionStore.write(null);
    return this.context;
  }
}

export interface WorkspaceCompanySource {
  listByOrganization(organizationId: OrganizationId): Promise<readonly OrganizationCompany[]>;
}

export interface ActiveWorkspaceCompanyStore {
  read(organizationId: OrganizationId): Promise<OrganizationCompanyId | null>;
  write(organizationId: OrganizationId, companyId: OrganizationCompanyId | null): Promise<void>;
}

export interface ActiveWorkspaceCompanyContext {
  readonly organizationId: OrganizationId | null;
  readonly companies: readonly OrganizationCompany[];
  readonly active: OrganizationCompany | null;
}

export class WorkspaceCompanySelectionFailure extends Error {
  readonly code = "COMPANY_NOT_FOUND";
  constructor(message: string) { super(message); this.name = "WorkspaceCompanySelectionFailure"; }
}

const EMPTY_WORKSPACE_COMPANY_CONTEXT: ActiveWorkspaceCompanyContext = Object.freeze({
  organizationId: null,
  companies: Object.freeze([]),
  active: null,
});

/** Owns company selection inside one organization; client organizations remain workspace entries. */
export class WorkspaceCompanyContextSession {
  private context: ActiveWorkspaceCompanyContext = EMPTY_WORKSPACE_COMPANY_CONTEXT;

  constructor(
    private readonly source: WorkspaceCompanySource,
    private readonly store: ActiveWorkspaceCompanyStore,
  ) {}

  get current(): ActiveWorkspaceCompanyContext { return this.context; }

  async restore(organizationId: OrganizationId | null): Promise<ActiveWorkspaceCompanyContext> {
    if (!organizationId) return this.clear();
    const companies = Object.freeze([...(await this.source.listByOrganization(organizationId))]);
    if (companies.some((company) => company.organizationId !== organizationId)) {
      throw new WorkspaceCompanySelectionFailure("Una empresa no pertenece a la organización activa.");
    }
    const storedCompanyId = await this.store.read(organizationId);
    const active = companies.find((company) => company.id === storedCompanyId) ?? companies[0] ?? null;
    this.context = Object.freeze({ organizationId, companies, active });
    await this.store.write(organizationId, active?.id ?? null);
    return this.context;
  }

  async select(companyId: OrganizationCompanyId): Promise<ActiveWorkspaceCompanyContext> {
    const organizationId = this.context.organizationId;
    if (!organizationId) throw new WorkspaceCompanySelectionFailure("No hay una organización activa.");
    const active = this.context.companies.find((company) => company.id === companyId);
    if (!active) throw new WorkspaceCompanySelectionFailure("La empresa no pertenece a la organización activa.");
    this.context = Object.freeze({ ...this.context, active });
    await this.store.write(organizationId, active.id);
    return this.context;
  }

  async clear(): Promise<ActiveWorkspaceCompanyContext> {
    this.context = EMPTY_WORKSPACE_COMPANY_CONTEXT;
    return this.context;
  }
}

export interface WorkspaceModuleSource {
  listAvailable(organizationId: OrganizationId): Promise<readonly AvailableOrganizationModule[]>;
}

export interface ActiveWorkspaceModuleStore {
  read(organizationId: OrganizationId): Promise<ModuleCode | null>;
  write(organizationId: OrganizationId, moduleCode: ModuleCode | null): Promise<void>;
}

export interface ActiveWorkspaceModuleContext {
  readonly organizationId: OrganizationId | null;
  readonly modules: readonly AvailableOrganizationModule[];
  readonly active: AvailableOrganizationModule | null;
}

export class WorkspaceModuleSelectionFailure extends Error {
  readonly code = "MODULE_NOT_ACTIVE";
  constructor(message: string) { super(message); this.name = "WorkspaceModuleSelectionFailure"; }
}

const EMPTY_WORKSPACE_MODULE_CONTEXT: ActiveWorkspaceModuleContext = Object.freeze({
  organizationId: null,
  modules: Object.freeze([]),
  active: null,
});

/** Owns module selection within the active organization; module availability remains owned by modules. */
export class WorkspaceModuleContextSession {
  private context: ActiveWorkspaceModuleContext = EMPTY_WORKSPACE_MODULE_CONTEXT;

  constructor(
    private readonly source: WorkspaceModuleSource,
    private readonly store: ActiveWorkspaceModuleStore,
  ) {}

  get current(): ActiveWorkspaceModuleContext { return this.context; }

  async restore(organization: OrganizationId | null): Promise<ActiveWorkspaceModuleContext> {
    if (!organization) return this.clear();
    const modules = Object.freeze([...(await this.source.listAvailable(organization))]);
    const storedCode = await this.store.read(organization);
    const active = modules.find((module) => module.code === storedCode) ?? modules[0] ?? null;
    this.context = Object.freeze({ organizationId: organization, modules, active });
    await this.store.write(organization, active?.code ?? null);
    return this.context;
  }

  async select(moduleCode: ModuleCode): Promise<ActiveWorkspaceModuleContext> {
    const organization = this.context.organizationId;
    if (!organization) {
      throw new WorkspaceModuleSelectionFailure("No hay una organización activa para seleccionar el módulo.");
    }
    const active = this.context.modules.find((module) => module.code === moduleCode);
    if (!active) throw new WorkspaceModuleSelectionFailure("El módulo no está disponible en este espacio de trabajo.");
    this.context = Object.freeze({ ...this.context, active });
    await this.store.write(organization, active.code);
    return this.context;
  }

  async clear(): Promise<ActiveWorkspaceModuleContext> {
    this.context = EMPTY_WORKSPACE_MODULE_CONTEXT;
    return this.context;
  }
}

export class ListWorkspacePortfolio {
  constructor(
    private readonly directAccess: DirectOrganizationAccessDirectory,
    private readonly delegations: OrganizationDelegationRepository,
    private readonly presentations: OrganizationPresentationDirectory,
  ) {}

  async execute(userId: UserId, occurredAt: string): Promise<readonly WorkspacePortfolioEntry[]> {
    const [direct, delegated] = await Promise.all([
      this.directAccess.listForUser(userId),
      this.delegations.listAssignedToUser(userId),
    ]);
    const portfolio = [
      ...direct.map((item) => directWorkspace(userId, item)),
      ...delegated.filter((item) => isAssignedAndEffective(item, occurredAt)).map((item) => delegatedWorkspace(userId, item)),
    ];
    const presentations = new Map(
      (await this.presentations.listByOrganizationIds(portfolio.map((item) => item.organizationId)))
        .map((item) => [item.organizationId, item.avatarUrl]),
    );
    return portfolio
      .map((item) => ({ ...item, avatarUrl: presentations.get(item.organizationId) ?? null }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }
}

export class ResolveWorkspaceAccessPath {
  constructor(
    private readonly directAccess: DirectOrganizationAccessDirectory,
    private readonly delegations: OrganizationDelegationRepository,
  ) {}

  async execute(input: {
    readonly userId: UserId;
    readonly actingOrganizationId: OrganizationId;
    readonly targetOrganizationId: OrganizationId;
    readonly occurredAt: string;
  }): Promise<OrganizationAccessPath> {
    if (input.actingOrganizationId === input.targetOrganizationId) {
      const direct = await this.directAccess.findForUser(input.userId, input.actingOrganizationId);
      if (direct) return directPath(input.userId, direct.organizationId);
    }
    const delegated = await this.delegations.findAssigned(
      input.userId,
      input.actingOrganizationId,
      input.targetOrganizationId,
    );
    if (delegated && isAssignedAndEffective(delegated, input.occurredAt)) {
      return delegatedPath(input.userId, delegated.delegation);
    }
    throw new OrganizationAccessFailure("ACCESS_PATH_NOT_FOUND", "No existe una ruta de acceso vigente.");
  }
}

export class DelegatedPermissionScopePolicy {
  private readonly scopesByPermission = new Map<PermissionCode, DelegatedScope>([
    [permissionCode(PERMISSIONS.ACCOUNTING_READ), DelegatedScope.Accounting],
    [permissionCode(PERMISSIONS.ACCOUNTING_CREATE), DelegatedScope.Accounting],
    [permissionCode(PERMISSIONS.ACCOUNTING_UPDATE), DelegatedScope.Accounting],
    [permissionCode(PERMISSIONS.ACCOUNTING_POST), DelegatedScope.Accounting],
    [permissionCode(PERMISSIONS.ACCOUNTING_CLOSE), DelegatedScope.Accounting],
    [permissionCode(PERMISSIONS.PAYROLL_READ), DelegatedScope.Payroll],
    [permissionCode(PERMISSIONS.PAYROLL_CREATE), DelegatedScope.Payroll],
    [permissionCode(PERMISSIONS.PAYROLL_CONFIRM), DelegatedScope.Payroll],
    [permissionCode(PERMISSIONS.PAYROLL_DELETE), DelegatedScope.Payroll],
    [permissionCode(PERMISSIONS.INVENTORY_READ), DelegatedScope.Inventory],
    [permissionCode(PERMISSIONS.INVENTORY_CREATE), DelegatedScope.Inventory],
    [permissionCode(PERMISSIONS.INVENTORY_UPDATE), DelegatedScope.Inventory],
    [permissionCode(PERMISSIONS.INVENTORY_DELETE), DelegatedScope.Inventory],
    [permissionCode(PERMISSIONS.PURCHASES_READ), DelegatedScope.Purchases],
    [permissionCode(PERMISSIONS.PURCHASES_CREATE), DelegatedScope.Purchases],
    [permissionCode(PERMISSIONS.PURCHASES_CONFIRM), DelegatedScope.Purchases],
    [permissionCode(PERMISSIONS.PURCHASES_CANCEL), DelegatedScope.Purchases],
    [permissionCode(PERMISSIONS.DOCUMENTS_READ), DelegatedScope.Documents],
    [permissionCode(PERMISSIONS.DOCUMENTS_CREATE), DelegatedScope.Documents],
    [permissionCode(PERMISSIONS.DOCUMENTS_UPDATE), DelegatedScope.Documents],
    [permissionCode(PERMISSIONS.DOCUMENTS_DELETE), DelegatedScope.Documents],
  ]);

  permits(path: OrganizationAccessPath, permission: PermissionCode): boolean {
    if (path.kind === OrganizationAccessPathKind.DirectMembership) return true;
    const requiredScope = this.scopesByPermission.get(permission);
    return requiredScope !== undefined && path.scopes.includes(requiredScope);
  }
}

function isAssignedAndEffective(access: DelegatedOrganizationAccess, occurredAt: string): boolean {
  return access.assignmentStatus === DelegationAssignmentStatus.Active
    && isDelegationEffective(access.delegation, occurredAt);
}

function selectRestoredWorkspace(
  portfolio: readonly WorkspacePortfolioEntry[],
  storedOrganizationId: OrganizationId | null,
): WorkspacePortfolioEntry | null {
  if (storedOrganizationId) {
    const stored = portfolio.find((entry) => entry.organizationId === storedOrganizationId);
    if (stored) return stored;
  }
  return portfolio.find((entry) => entry.relationship === OrganizationRelationship.Personal)
    ?? portfolio.find((entry) => entry.relationship === OrganizationRelationship.Member)
    ?? portfolio.find((entry) => entry.relationship === OrganizationRelationship.Delegated)
    ?? null;
}

function directWorkspace(userId: UserId, access: DirectOrganizationAccess): AccessibleOrganization & { readonly relationship: "personal" | "member" } {
  return { organizationId: access.organizationId, name: access.name, relationship: access.relationship, accessPath: directPath(userId, access.organizationId) };
}

function delegatedWorkspace(userId: UserId, access: DelegatedOrganizationAccess): AccessibleOrganization & { readonly relationship: "delegated" } {
  return {
    relationship: OrganizationRelationship.Delegated,
    organizationId: access.delegation.clientOrganizationId,
    name: access.clientOrganizationName,
    accessPath: delegatedPath(userId, access.delegation),
  };
}

function directPath(userId: UserId, organizationId: OrganizationId): OrganizationAccessPath {
  return { kind: OrganizationAccessPathKind.DirectMembership, actorUserId: userId, actingOrganizationId: organizationId, targetOrganizationId: organizationId, delegationId: null, scopes: [] };
}

function delegatedPath(userId: UserId, delegation: OrganizationDelegation): OrganizationAccessPath {
  return { kind: OrganizationAccessPathKind.DelegatedOrganization, actorUserId: userId, actingOrganizationId: delegation.providerOrganizationId, targetOrganizationId: delegation.clientOrganizationId, delegationId: delegation.id, scopes: delegation.scopes };
}

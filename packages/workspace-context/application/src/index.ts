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
import type { OrganizationId, UserId } from "@kontave/organizations-domain";
import type { CompanyRepository } from "@kontave/companies-application";
import { CompanyFailure, type Company, type CompanyId } from "@kontave/companies-domain";
import type { ModuleCapability } from "@kontave/modules-domain";

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
    const company = await this.companies.findById(input.companyId);
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
}

export interface DirectOrganizationAccessDirectory {
  listForUser(userId: UserId): Promise<readonly DirectOrganizationAccess[]>;
  findForUser(userId: UserId, organizationId: OrganizationId): Promise<DirectOrganizationAccess | null>;
}

export class ListWorkspacePortfolio {
  constructor(
    private readonly directAccess: DirectOrganizationAccessDirectory,
    private readonly delegations: OrganizationDelegationRepository,
  ) {}

  async execute(userId: UserId, occurredAt: string): Promise<readonly AccessibleOrganization[]> {
    const [direct, delegated] = await Promise.all([
      this.directAccess.listForUser(userId),
      this.delegations.listAssignedToUser(userId),
    ]);
    return [
      ...direct.map((item) => directWorkspace(userId, item)),
      ...delegated.filter((item) => isAssignedAndEffective(item, occurredAt)).map((item) => delegatedWorkspace(userId, item)),
    ].sort((left, right) => left.name.localeCompare(right.name));
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

function directWorkspace(userId: UserId, access: DirectOrganizationAccess): AccessibleOrganization {
  return { organizationId: access.organizationId, name: access.name, accessPath: directPath(userId, access.organizationId) };
}

function delegatedWorkspace(userId: UserId, access: DelegatedOrganizationAccess): AccessibleOrganization {
  return {
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

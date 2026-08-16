import type { AvailableOrganizationModule } from "@kontave/modules-application";
import { ModuleCode, type ModuleId } from "@kontave/modules-domain";
import type { NativeAccessibleOrganizationDto, NativeCompanyDto, NativeOrganizationCompanyDto } from "@kontave/native-api-contracts";
import { DelegatedScope, OrganizationAccessPathKind, organizationDelegationId } from "@kontave/organization-delegations-domain";
import { companyId, organizationId, userId, type OrganizationCompany, type OrganizationId } from "@kontave/organizations-domain";
import type { WorkspaceCompanySource, WorkspaceModuleSource, WorkspacePortfolioEntry, WorkspacePortfolioSource } from "@kontave/workspace-context-application";
import type { PersistedWorkspaceContext, WorkspaceContextStore } from "@kontave/workspace-context-application/coordinator";
import type { createMobileApi } from "../api/mobile-api";
import { readMobileSelection, writeMobileSelection } from "./mobile-selection-storage";

type MobileApi = ReturnType<typeof createMobileApi>;

export class MobileWorkspacePortfolioSource implements WorkspacePortfolioSource {
  constructor(private readonly api: MobileApi) {}
  async list(): Promise<readonly WorkspacePortfolioEntry[]> {
    return (await this.api.get<readonly NativeAccessibleOrganizationDto[]>("/api/native/v1/organization-access")).map(mapWorkspace);
  }
}

export class MobileWorkspaceCompanySource implements WorkspaceCompanySource {
  constructor(private readonly api: MobileApi) {}
  async listByOrganization(targetOrganizationId: OrganizationId): Promise<readonly OrganizationCompany[]> {
    const basePath = `/api/native/v1/organizations/${encodeURIComponent(targetOrganizationId)}`;
    const [values, presentations] = await Promise.all([
      this.api.get<readonly NativeCompanyDto[]>(`${basePath}/operational-companies`),
      this.api.get<readonly NativeOrganizationCompanyDto[]>(`${basePath}/companies`),
    ]);
    const presentationById = new Map(presentations.map((value) => [value.id, value]));
    const presentationByRif = new Map(presentations.filter((value) => value.rif).map((value) => [value.rif, value]));
    return values.map((value) => ({
      id: companyId(value.id),
      organizationId: organizationId(value.organizationId),
      name: value.tradeName ?? value.legalName,
      rif: value.taxId,
      logoUrl: (value.legacyCompanyId ? presentationById.get(value.legacyCompanyId)?.logoUrl : null)
        ?? (value.taxId ? presentationByRif.get(value.taxId)?.logoUrl : null)
        ?? null,
    }));
  }
}

export class MobileWorkspaceModuleSource implements WorkspaceModuleSource {
  constructor(private readonly api: MobileApi) {}
  async listAvailable(targetOrganizationId: OrganizationId): Promise<readonly AvailableOrganizationModule[]> {
    const values = await this.api.get<readonly { readonly id: string; readonly code: string; readonly name: string }[]>(`/api/native/v1/organizations/${encodeURIComponent(targetOrganizationId)}/modules/available?platform=mobile`);
    return values.map((value) => ({ id: value.id as ModuleId, code: readModuleCode(value.code), name: value.name }));
  }
}

export class MobileWorkspaceContextStore implements WorkspaceContextStore {
  private readonly key = "kontave.mobile.workspace-context-v2";
  async read(): Promise<PersistedWorkspaceContext> {
    const stored = await readMobileSelection(this.key);
    if (!stored) return emptyContext();
    try {
      const value: unknown = JSON.parse(stored);
      if (!value || typeof value !== "object" || Array.isArray(value)) return emptyContext();
      const record = value as Record<string, unknown>;
      return {
        organizationId: typeof record.organizationId === "string" ? organizationId(record.organizationId) : null,
        companyId: typeof record.companyId === "string" ? companyId(record.companyId) : null,
        moduleCode: typeof record.moduleCode === "string" ? readOptionalModuleCode(record.moduleCode) : null,
      };
    } catch { return emptyContext(); }
  }
  write(context: PersistedWorkspaceContext): Promise<void> { return writeMobileSelection(this.key, JSON.stringify(context)); }
}

function emptyContext(): PersistedWorkspaceContext { return { organizationId: null, companyId: null, moduleCode: null }; }
function mapWorkspace(dto: NativeAccessibleOrganizationDto): WorkspacePortfolioEntry {
  return { organizationId: organizationId(dto.organizationId), name: dto.name, avatarUrl: dto.avatarUrl, relationship: dto.relationship, accessPath: {
    kind: readAccessPathKind(dto.accessPath.kind), actorUserId: userId(dto.accessPath.actorUserId), actingOrganizationId: organizationId(dto.accessPath.actingOrganizationId), targetOrganizationId: organizationId(dto.accessPath.targetOrganizationId),
    delegationId: dto.accessPath.delegationId ? organizationDelegationId(dto.accessPath.delegationId) : null, scopes: dto.accessPath.scopes.map(readScope),
  } };
}
function readAccessPathKind(value: string): OrganizationAccessPathKind {
  if (value === OrganizationAccessPathKind.DirectMembership || value === OrganizationAccessPathKind.DelegatedOrganization) return value;
  throw new Error("Ruta de acceso organizacional inválida.");
}
function readScope(value: string): DelegatedScope {
  const scope = Object.values(DelegatedScope).find((candidate) => candidate === value);
  if (!scope) throw new Error("Alcance delegado inválido.");
  return scope;
}
function readOptionalModuleCode(value: string): ModuleCode | null { return Object.values(ModuleCode).find((candidate) => candidate === value) ?? null; }
function readModuleCode(value: string): ModuleCode {
  const code = readOptionalModuleCode(value);
  if (!code) throw new Error("El código del módulo no es compatible con Mobile.");
  return code;
}

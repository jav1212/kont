import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { NativeAccessibleOrganizationDto, NativeCurrentUserDto, NativeEmployeeDto, NativeOrganizationCompanyDto } from "@kontave/native-api-contracts";
import { DelegatedScope, OrganizationAccessPathKind, organizationDelegationId } from "@kontave/organization-delegations-domain";
import { organizationId, userId, type OrganizationId } from "@kontave/organizations-domain";
import { WorkspaceContextSession, type ActiveWorkspaceContext, type ActiveWorkspaceSelectionStore, type WorkspacePortfolioEntry, type WorkspacePortfolioSource } from "@kontave/workspace-context-application";
import { createMobileApi } from "../api/mobile-api";
import { useAuth } from "../auth/auth-context";
import { readMobileSelection, writeMobileSelection } from "./mobile-selection-storage";

type WorkspaceState = { readonly status: "loading" } | { readonly status: "unavailable" } | { readonly status: "ready"; readonly context: ActiveWorkspaceContext; readonly user: NativeCurrentUserDto | null; readonly companies: readonly NativeOrganizationCompanyDto[]; readonly selectedCompanyId: string | null; readonly employees: readonly NativeEmployeeDto[]; readonly employeesLoading: boolean };
interface WorkspaceValue { readonly state: WorkspaceState; readonly select: (id: string) => Promise<void>; readonly selectCompany: (id: string) => Promise<void>; readonly refresh: () => Promise<void>; }
const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function MobileWorkspaceProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const auth = useAuth();
  const api = useMemo(() => createMobileApi(auth.authenticatedFetch), [auth.authenticatedFetch]);
  const session = useMemo(() => new WorkspaceContextSession(new MobilePortfolioSource(api), new MobileSelectionStore()), [api]);
  const [state, setState] = useState<WorkspaceState>({ status: "loading" });

  const loadContext = useCallback(async (context: ActiveWorkspaceContext) => {
    const [user, companies] = await Promise.all([
      api.get<NativeCurrentUserDto>("/api/native/v1/me"),
      context.active ? api.get<readonly NativeOrganizationCompanyDto[]>(`/api/native/v1/organizations/${encodeURIComponent(context.active.organizationId)}/companies`) : Promise.resolve([]),
    ]);
    setState({ status: "ready", context, user, companies, selectedCompanyId: null, employees: [], employeesLoading: false });
  }, [api]);
  const refresh = useCallback(async () => { setState({ status: "loading" }); try { await loadContext(await session.restore()); } catch { setState({ status: "unavailable" }); } }, [loadContext, session]);
  const select = useCallback(async (id: string) => { setState({ status: "loading" }); try { await loadContext(await session.select(organizationId(id))); } catch { setState({ status: "unavailable" }); } }, [loadContext, session]);
  const selectCompany = useCallback(async (id: string) => {
    if (state.status !== "ready" || !state.context.active) return;
    const current = state;
    const activeOrganizationId = state.context.active.organizationId;
    setState({ ...current, selectedCompanyId: id, employees: [], employeesLoading: true });
    try {
      const employees = await api.get<readonly NativeEmployeeDto[]>(`/api/native/v1/organizations/${encodeURIComponent(activeOrganizationId)}/operational-companies/${encodeURIComponent(id)}/employees`);
      setState({ ...current, selectedCompanyId: id, employees, employeesLoading: false });
    } catch { setState({ ...current, selectedCompanyId: id, employees: [], employeesLoading: false }); }
  }, [api, state]);
  useEffect(() => {
    let active = true;
    session.restore().then((context) => active ? loadContext(context) : undefined).catch(() => active && setState({ status: "unavailable" }));
    return () => { active = false; };
  }, [loadContext, session]);
  return <WorkspaceContext.Provider value={{ state, select, selectCompany, refresh }}>{children}</WorkspaceContext.Provider>;
}

export function useMobileWorkspace(): WorkspaceValue { const value = useContext(WorkspaceContext); if (!value) throw new Error("useMobileWorkspace requiere MobileWorkspaceProvider."); return value; }

class MobileSelectionStore implements ActiveWorkspaceSelectionStore {
  private readonly key = "kontave.mobile.active-workspace";
  async read(): Promise<OrganizationId | null> { const value = await readMobileSelection(this.key); return value ? organizationId(value) : null; }
  write(value: OrganizationId | null): Promise<void> { return writeMobileSelection(this.key, value); }
}

class MobilePortfolioSource implements WorkspacePortfolioSource {
  constructor(private readonly api: ReturnType<typeof createMobileApi>) {}
  async list(): Promise<readonly WorkspacePortfolioEntry[]> {
    return (await this.api.get<readonly NativeAccessibleOrganizationDto[]>("/api/native/v1/organization-access")).map(mapWorkspace);
  }
}

function mapWorkspace(dto: NativeAccessibleOrganizationDto): WorkspacePortfolioEntry {
  const kind = dto.accessPath.kind === OrganizationAccessPathKind.DirectMembership ? OrganizationAccessPathKind.DirectMembership : dto.accessPath.kind === OrganizationAccessPathKind.DelegatedOrganization ? OrganizationAccessPathKind.DelegatedOrganization : invalidAccessPath();
  return { organizationId: organizationId(dto.organizationId), name: dto.name, avatarUrl: dto.avatarUrl, relationship: dto.relationship, accessPath: {
    kind, actorUserId: userId(dto.accessPath.actorUserId), actingOrganizationId: organizationId(dto.accessPath.actingOrganizationId), targetOrganizationId: organizationId(dto.accessPath.targetOrganizationId),
    delegationId: dto.accessPath.delegationId ? organizationDelegationId(dto.accessPath.delegationId) : null, scopes: dto.accessPath.scopes.map(readScope),
  } };
}
function readScope(value: string): DelegatedScope { const scope = Object.values(DelegatedScope).find((candidate) => candidate === value); if (!scope) throw new Error("Alcance delegado inválido."); return scope; }
function invalidAccessPath(): never { throw new Error("Ruta de acceso organizacional inválida."); }

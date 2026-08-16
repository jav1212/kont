import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ModuleCode } from "@kontave/modules-domain";
import type { NativeCurrentUserDto } from "@kontave/native-api-contracts";
import { companyId, organizationId } from "@kontave/organizations-domain";
import { WorkspaceContextCoordinator, type WorkspaceContextStatus } from "@kontave/workspace-context-application/coordinator";
import { createMobileApi } from "../api/mobile-api";
import { useAuth } from "../auth/auth-context";
import { useClientExperience } from "../client-experience/mobile-client-experience";
import { MobileWorkspaceCompanySource, MobileWorkspaceContextStore, MobileWorkspaceModuleSource, MobileWorkspacePortfolioSource } from "./mobile-workspace-adapters";

interface WorkspaceValue {
  readonly state: WorkspaceContextStatus;
  readonly user: NativeCurrentUserDto | null;
  readonly selectWorkspace: (id: string) => Promise<boolean>;
  readonly selectCompany: (id: string) => Promise<boolean>;
  readonly selectModule: (code: ModuleCode) => Promise<boolean>;
  readonly refresh: () => Promise<void>;
}
const MobileWorkspaceContext = createContext<WorkspaceValue | null>(null);

export function MobileWorkspaceProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const auth = useAuth();
  const { feedback, interaction } = useClientExperience();
  const api = useMemo(() => createMobileApi(auth.authenticatedFetch), [auth.authenticatedFetch]);
  const coordinator = useMemo(() => new WorkspaceContextCoordinator(new MobileWorkspacePortfolioSource(api), new MobileWorkspaceCompanySource(api), new MobileWorkspaceModuleSource(api), new MobileWorkspaceContextStore()), [api]);
  const [state, setState] = useState<WorkspaceContextStatus>(coordinator.current);
  const [user, setUser] = useState<NativeCurrentUserDto | null>(null);

  useEffect(() => coordinator.subscribe(setState), [coordinator]);
  useEffect(() => {
    if (state.status !== "failed") return;
    feedback.execute({
      intent: "error",
      message: state.error.message,
      description: `Código: ${state.error.code}`,
      referenceCode: state.error.code,
      deduplicationKey: `workspace-context-${state.error.code}`,
    });
  }, [feedback, state]);
  useEffect(() => {
    let active = true;
    void Promise.all([coordinator.restore(), api.get<NativeCurrentUserDto>("/api/native/v1/me")]).then(([, value]) => { if (active) setUser(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [api, coordinator]);

  const selectWorkspace = useCallback(async (id: string) => {
    const lease = interaction.acquire({ kind: "exclusive_operation", state: "working", priority: 500, message: "Cambiando workspace", description: "Estamos preparando empresas, módulos y permisos." });
    try {
      const result = await coordinator.selectWorkspace(organizationId(id));
      const selected = result.status === "ready" && result.snapshot.activeWorkspace?.organizationId === id;
      if (selected) feedback.execute({ intent: "success", message: "Workspace actualizado", description: null, referenceCode: null, deduplicationKey: "workspace-selected" });
      return selected;
    } finally { lease.release(); }
  }, [coordinator, feedback, interaction]);
  const selectCompany = useCallback(async (id: string) => {
    const lease = interaction.acquire({ kind: "exclusive_operation", state: "working", priority: 500, message: "Cambiando empresa" });
    try {
      const result = await coordinator.selectCompany(companyId(id));
      const selected = result.status === "ready" && result.snapshot.activeCompany?.id === id;
      if (selected) feedback.execute({ intent: "success", message: "Empresa actualizada", description: null, referenceCode: null, deduplicationKey: "company-selected" });
      return selected;
    } finally { lease.release(); }
  }, [coordinator, feedback, interaction]);
  const selectModule = useCallback(async (code: ModuleCode) => {
    const lease = interaction.acquire({ kind: "exclusive_operation", state: "working", priority: 500, message: "Cambiando módulo" });
    try {
      const result = await coordinator.selectModule(code);
      const selected = result.status === "ready" && result.snapshot.activeModule?.code === code;
      if (selected) feedback.execute({ intent: "success", message: "Módulo actualizado", description: null, referenceCode: null, deduplicationKey: "module-selected" });
      return selected;
    } finally { lease.release(); }
  }, [coordinator, feedback, interaction]);
  const refresh = useCallback(async () => { await coordinator.refresh(); }, [coordinator]);
  const value = useMemo<WorkspaceValue>(() => ({ state, user, selectWorkspace, selectCompany, selectModule, refresh }), [refresh, selectCompany, selectModule, selectWorkspace, state, user]);
  return <MobileWorkspaceContext.Provider value={value}>{children}</MobileWorkspaceContext.Provider>;
}

export function useMobileWorkspace(): WorkspaceValue {
  const value = useContext(MobileWorkspaceContext);
  if (!value) throw new Error("useMobileWorkspace requiere MobileWorkspaceProvider.");
  return value;
}

import type { PermissionCode } from "@kontave/access-control/domain";

/** Organization workspace available to the authenticated user. */
export interface DesktopWorkspaceEntry {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly access: "direct" | "delegated";
  readonly relationship: "personal" | "member" | "delegated";
  /** Delegation scope metadata used for access-path presentation. */
  readonly scopes: readonly string[];
  /** Effective role or delegated grants resolved by the server. */
  readonly permissions: readonly PermissionCode[];
}

/** Business module available within the active workspace. */
export interface DesktopWorkspaceModuleEntry {
  readonly id: string;
  readonly name: string;
}

/** Company available within the active workspace. */
export interface DesktopWorkspaceCompanyEntry {
  readonly id: string;
  readonly name: string;
  readonly rif: string | null;
  readonly logoUrl?: string;
}

/** Coherent organization, module, and company selection. */
export type DesktopWorkspaceState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | {
      readonly status: "ready";
      readonly workspaces: readonly DesktopWorkspaceEntry[];
      readonly activeWorkspaceId: string | null;
      readonly modules: readonly DesktopWorkspaceModuleEntry[];
      readonly activeModuleId: string | null;
      readonly companies: readonly DesktopWorkspaceCompanyEntry[];
      readonly activeCompanyId: string | null;
    };

/** Result returned by workspace selection commands. */
export type DesktopWorkspaceResult =
  | { readonly ok: true; readonly value: DesktopWorkspaceState }
  | {
      readonly ok: false;
      readonly error: { readonly code: string; readonly message: string };
    };

/** Workspace capability exposed by preload. */
export interface DesktopWorkspaceApi {
  getState(): Promise<DesktopWorkspaceState>;
  refresh(): Promise<DesktopWorkspaceResult>;
  select(workspaceId: string): Promise<DesktopWorkspaceResult>;
  selectModule(moduleId: string): Promise<DesktopWorkspaceResult>;
  selectCompany(companyId: string): Promise<DesktopWorkspaceResult>;
  subscribe(listener: (state: DesktopWorkspaceState) => void): () => void;
}

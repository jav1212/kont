"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { OrganizationWorkspace } from "../../contracts";

export interface OrganizationContextValue {
  readonly organizations: readonly OrganizationWorkspace[];
  readonly organization: OrganizationWorkspace | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly selectOrganization: (id: string) => void;
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null);

/** Compatibility boundary over the session-owned Web workspace.
 * @param props - Content sharing the committed organization.
 * @returns Content without another directory fetch or selection owner.
 * @throws Error when the global provider is missing.
 */
export function OrganizationProvider({ children }: { children: ReactNode }): React.JSX.Element {
    useOrganization();
    return <>{children}</>;
}

/** Reads the canonical organization projection of the committed Web workspace.
 * @returns Directory, selection, readiness, errors and commands.
 * @throws Error when called outside WebApplicationProvider.
 */
export function useOrganization(): OrganizationContextValue {
    const context = useContext(OrganizationContext);
    if (!context) throw new Error("useOrganization requiere WebApplicationProvider.");
    return context;
}

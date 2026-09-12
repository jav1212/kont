"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UseActiveTenantResult } from "../hooks/use-active-tenant";

export const ActiveTenantContext = createContext<UseActiveTenantResult | null>(null);

/** Compatibility boundary over the global workspace's tenant projection.
 * @param props - Content sharing the selected tenant.
 * @returns Content without independent URL or storage synchronization.
 * @throws Error when the global provider is missing.
 */
export function ActiveTenantProvider({ children }: { children: ReactNode }) {
    useActiveTenantContext();
    return <>{children}</>;
}

/** Reads legacy tenant scope from the global Web workspace.
 * @returns Tenant metadata, canonical permissions and selection commands.
 * @throws Error when called outside WebApplicationProvider.
 */
export function useActiveTenantContext(): UseActiveTenantResult {
    const context = useContext(ActiveTenantContext);
    if (!context) throw new Error("useActiveTenantContext requiere WebApplicationProvider.");
    return context;
}

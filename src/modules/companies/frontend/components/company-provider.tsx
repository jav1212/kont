"use client";

import { useContext } from "react";
import { CompanyContext, useCompanyState } from "../hooks/use-companies";
import { ActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
    // Read activeTenantId from context if available (inside ActiveTenantProvider)
    const activeTenantCtx = useContext(ActiveTenantContext);
    const activeTenantId  = activeTenantCtx?.activeTenantId ?? null;

    const value = useCompanyState(activeTenantId);
    return (
        <CompanyContext.Provider value={value}>
            {children}
        </CompanyContext.Provider>
    );
}

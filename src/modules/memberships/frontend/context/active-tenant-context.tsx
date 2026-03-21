"use client";

import { createContext, useContext } from "react";
import { useActiveTenant, UseActiveTenantResult } from "../hooks/use-active-tenant";

export const ActiveTenantContext = createContext<UseActiveTenantResult | null>(null);

export function ActiveTenantProvider({ children }: { children: React.ReactNode }) {
    const value = useActiveTenant();
    return (
        <ActiveTenantContext.Provider value={value}>
            {children}
        </ActiveTenantContext.Provider>
    );
}

export function useActiveTenantContext(): UseActiveTenantResult {
    const ctx = useContext(ActiveTenantContext);
    if (!ctx) throw new Error("useActiveTenantContext must be used inside <ActiveTenantProvider>");
    return ctx;
}

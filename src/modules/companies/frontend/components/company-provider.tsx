"use client";

import { CompanyContext, useCompanyState } from "../hooks/use-companies";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
    const value = useCompanyState();
    return (
        <CompanyContext.Provider value={value}>
            {children}
        </CompanyContext.Provider>
    );
}

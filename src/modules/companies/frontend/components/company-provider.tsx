"use client";

// CompanyProvider — bridges URL-based company context (?cid=) with the
// useCompanyState hook. Keeps the URL's cid param in sync with the actually
// resolved company — critical when the tenant switches and the old cid becomes
// stale. When the user manually switches company, the URL is also updated.

import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { CompanyContext, useCompanyState, UseCompanyResult } from "../hooks/use-companies";
import { ActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { useUrlContext } from "@/src/shared/frontend/hooks/use-url-context";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { urlCompanyId, buildReplaceUrl } = useUrlContext();

    // Read activeTenantId from context if available (inside ActiveTenantProvider)
    const activeTenantCtx = useContext(ActiveTenantContext);
    const activeTenantId  = activeTenantCtx?.activeTenantId ?? null;

    const company = useCompanyState(activeTenantId, urlCompanyId);

    // Keep the URL's cid in sync with the resolved companyId.
    // This covers auto-selection after tenant switch, initial load, and
    // any case where the hook resolves a different company than the URL shows.
    const didMount = useRef(false);
    useEffect(() => {
        // Skip the initial mount to avoid unnecessary URL replace on first render
        if (!didMount.current) { didMount.current = true; return; }
        // Only sync when not loading (resolution is complete) and companyId differs from URL
        if (company.loading) return;
        if (company.companyId === urlCompanyId) return;
        router.replace(buildReplaceUrl({ cid: company.companyId }));
    }, [company.companyId, company.loading, urlCompanyId, router, buildReplaceUrl]);

    // Wrap selectCompany to also update the URL query param
    const selectCompany = useCallback((id: string) => {
        company.selectCompany(id);
        router.replace(buildReplaceUrl({ cid: id }));
    }, [company, router, buildReplaceUrl]);

    const value: UseCompanyResult = useMemo(() => ({
        ...company,
        selectCompany,
    }), [company, selectCompany]);

    return (
        <CompanyContext.Provider value={value}>
            {children}
        </CompanyContext.Provider>
    );
}

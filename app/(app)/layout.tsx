// Server Component layout for the (app) route group.
// Interactive chrome (drawer state, resize listener) lives in <AppShell>.
// Providers are client components but can be rendered from RSC — the runtime
// boundary is at the provider's "use client" pragma, not here.

import { Suspense } from "react";
import { AppShell }              from "@/src/shared/frontend/components/app-shell";
import { CompanyProvider }       from "@/src/modules/companies/frontend/components/company-provider";
import { ActiveTenantProvider }  from "@/src/modules/memberships/frontend/context/active-tenant-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    // Suspense boundary required because useSearchParams() is used inside
    // ActiveTenantProvider and CompanyProvider for URL-based context params.
    return (
        <Suspense>
            <ActiveTenantProvider>
                <CompanyProvider>
                    <AppShell>{children}</AppShell>
                </CompanyProvider>
            </ActiveTenantProvider>
        </Suspense>
    );
}

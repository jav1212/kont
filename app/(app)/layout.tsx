"use client";

import { Suspense, useEffect, useState } from "react";
import { AppSidebar }           from "@/src/shared/frontend/components/app-sidebar";
import { MobileTopBar }         from "@/src/shared/frontend/components/mobile-topbar";
import { CompanyProvider }      from "@/src/modules/companies/frontend/components/company-provider";
import { ActiveTenantProvider } from "@/src/modules/memberships/frontend/context/active-tenant-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Close drawer automatically when viewport enters desktop (xl) breakpoint
    useEffect(() => {
        const mq = window.matchMedia("(min-width: 1280px)");
        function handleChange(e: MediaQueryListEvent) {
            if (e.matches) setSidebarOpen(false);
        }
        mq.addEventListener("change", handleChange);
        return () => mq.removeEventListener("change", handleChange);
    }, []);

    // Suspense boundary required because useSearchParams() is used inside
    // ActiveTenantProvider and CompanyProvider for URL-based context params.
    return (
        <Suspense>
        <ActiveTenantProvider>
            <CompanyProvider>
                <div className="flex h-dvh bg-surface-2 overflow-hidden">

                    {/* Drawer overlay — mobile/tablet only */}
                    <div
                        aria-hidden="true"
                        onClick={() => setSidebarOpen(false)}
                        className={[
                            "fixed inset-0 z-40 bg-black/50 xl:hidden transition-opacity duration-300",
                            sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
                        ].join(" ")}
                    />

                    <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

                    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                        <MobileTopBar onMenuClick={() => setSidebarOpen(true)} />
                        <main className="flex-1 min-w-0 overflow-y-auto flex flex-col">
                            {children}
                        </main>
                    </div>

                </div>
            </CompanyProvider>
        </ActiveTenantProvider>
        </Suspense>
    );
}

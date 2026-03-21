"use client";

import { useState } from "react";
import { AppSidebar }    from "@/src/shared/frontend/components/app-sidebar";
import { MobileTopBar }  from "@/src/shared/frontend/components/mobile-topbar";
import { CompanyProvider } from "@/src/modules/companies/frontend/components/company-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
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
    );
}

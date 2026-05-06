"use client";

// Client shell for the (app) route group. Owns the mobile drawer state and the
// resize listener that auto-closes the drawer when entering the desktop
// breakpoint. The (app) layout itself is a Server Component — providers are
// rendered there so this file only deals with interactive chrome.

import { useEffect, useState } from "react";
import { AppSidebar }    from "@/src/shared/frontend/components/app-sidebar";
import { MobileTopBar }  from "@/src/shared/frontend/components/mobile-topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
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

    return (
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
    );
}

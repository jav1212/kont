// Server Component layout for the (app) route group.
// Interactive chrome (drawer state, resize listener) lives in <AppShell>.
// Providers are client components but can be rendered from RSC — the runtime
// boundary is at the provider's "use client" pragma, not here.

import { Suspense } from "react";
import { AppShell }              from "@/src/shared/frontend/components/app-shell";
import { WebApplicationProvider } from "@/src/modules/workspace/frontend/web-application-provider";
import { WebApplicationStartupBoundary } from "@/src/modules/workspace/frontend/web-application-startup-boundary";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    // Suspense boundary required because useSearchParams() is used inside
    // WebApplicationProvider for URL-based context parameters.
    return (
        <Suspense fallback={<WebApplicationStartupBoundary />}>
            <WebApplicationProvider><AppShell>{children}</AppShell></WebApplicationProvider>
        </Suspense>
    );
}

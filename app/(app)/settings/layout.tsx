"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { MODULE_SUBNAV } from "@/src/shared/frontend/navigation";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { getOrganizationRouteAccess } from "@/src/modules/organizations/frontend/module-access-policy";

const FALLBACK_SUBTITLE = "Gestiona la organización, sus empresas y las preferencias de este espacio de trabajo.";

/**
 * Renders settings content within the application shell's primary navigation.
 * @param props - Settings page content selected by the active route.
 * @returns The settings page header and content without a second navigation rail.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { can } = useOrganizationModuleAccess(pathname);
    const visibleLinks = MODULE_SUBNAV.settings.filter((item) => {
        const routeAccess = getOrganizationRouteAccess(item.href);
        return routeAccess.kind === "authenticated" || (routeAccess.kind === "protected" && routeAccess.permissions.every(can));
    });
    const active = visibleLinks.find(({ href }) => pathname.startsWith(href));

    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-surface-2">
            <PageHeader title="Configuración" subtitle={active?.subtitle ?? FALLBACK_SUBTITLE} />
            <main className="w-full px-4 pt-6 pb-16 sm:px-6 lg:pt-10">
                {children}
            </main>
        </div>
    );
}

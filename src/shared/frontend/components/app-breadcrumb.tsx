"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { APP_MODULES, MODULE_SUBNAV } from "@/src/shared/frontend/navigation";

type BreadcrumbItem = { href?: string; label: string };

function getBreadcrumbItems(pathname: string, pageTitle?: string): BreadcrumbItem[] {
    const normalizedPath = pathname.replace(/\/$/, "") || "/";
    const matchedModule = APP_MODULES.find((module) => {
        const moduleId = "parentId" in module ? module.parentId ?? module.id : module.id;
        return normalizedPath === `/${moduleId}` || normalizedPath.startsWith(`/${moduleId}/`);
    });
    if (!matchedModule) return [{ label: pageTitle ?? "Página" }];
    const moduleId = "parentId" in matchedModule ? matchedModule.parentId ?? matchedModule.id : matchedModule.id;
    const moduleDefinition = APP_MODULES.find((module) => module.id === moduleId) ?? matchedModule;
    const matchingSubnav = (MODULE_SUBNAV[moduleId] ?? [])
        .filter((item) => normalizedPath === item.href || normalizedPath.startsWith(`${item.href}/`))
        .sort((a, b) => b.href.length - a.href.length)[0];
    const currentLabel = matchingSubnav && normalizedPath === matchingSubnav.href
        ? matchingSubnav.label
        : (pageTitle ?? matchingSubnav?.label ?? "Detalle");
    return [
        { label: "Inicio", href: "/" },
        { label: moduleDefinition.label, href: moduleDefinition.href },
        { label: currentLabel },
    ];
}

export function AppBreadcrumb({ pageTitle }: { pageTitle?: string }) {
    const items = getBreadcrumbItems(usePathname(), pageTitle);
    return (
        <nav aria-label="Migas de pan" className="min-w-0 flex-1 overflow-hidden">
            <ol className="flex min-w-0 items-center gap-1 text-[12px]">
                {items.map((item, index) => {
                    const current = index === items.length - 1;
                    return (
                        <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
                            {index > 0 && <ChevronRight size={13} className="shrink-0 text-[var(--text-tertiary)]" aria-hidden />}
                            {item.href && !current ? (
                                <Link href={item.href} className="shrink-0 text-[var(--text-tertiary)] transition-colors hover:text-foreground">{item.label}</Link>
                            ) : (
                                <span aria-current={current ? "page" : undefined} className={current ? "min-w-0 truncate font-medium text-foreground" : "min-w-0 truncate text-[var(--text-tertiary)]"}>{item.label}</span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}



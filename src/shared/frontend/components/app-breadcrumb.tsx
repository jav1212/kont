"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Archive, BookOpen, Briefcase, Building2, CalendarDays, BarChart3, ClipboardList, Coins, CreditCard, FileText, Folder, Home, Package, Users, Receipt, Settings, Shield, ShoppingCart, Wrench, Truck, UserRound, Wallet, ChevronRight, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { APP_MODULES, MODULE_SUBNAV, WEB_SETTINGS_MODULE, navigationDestinationFor } from "@/src/shared/frontend/navigation";

type BreadcrumbItem = { href?: string; label: string; iconKey?: string };

const SEMANTIC_ICONS: Readonly<Record<string, LucideIcon>> = {
    activity: Activity, archive: Archive, book: BookOpen, briefcase: Briefcase, building: Building2,
    calendar: CalendarDays, chart: BarChart3, clipboard: ClipboardList, coins: Coins,
    "credit-card": CreditCard, document: FileText, folder: Folder, home: Home, inventory: Package,
    people: Users, receipt: Receipt, settings: Settings, shield: Shield, "shopping-cart": ShoppingCart,
    tool: Wrench, truck: Truck, user: UserRound, wallet: Wallet,
};

function getBreadcrumbItems(pathname: string, pageTitle: string | undefined, labels: Readonly<Record<string, string>>, icons: Readonly<Record<string, string>>): BreadcrumbItem[] {
    const normalizedPath = pathname.replace(/\/$/, "") || "/";
    const matchedModule = APP_MODULES.find((module) => {
        const moduleId = "parentId" in module ? module.parentId ?? module.id : module.id;
        return normalizedPath === `/${moduleId}` || normalizedPath.startsWith(`/${moduleId}/`);
    });
    const isSettingsPath = normalizedPath === "/profile" || normalizedPath === "/settings" || normalizedPath.startsWith("/settings/");
    if (!matchedModule && !isSettingsPath) return [{ label: pageTitle ?? "Página" }];

    const moduleId = isSettingsPath ? "settings" : ("parentId" in matchedModule! ? matchedModule!.parentId ?? matchedModule!.id : matchedModule!.id);
    const moduleDefinition = isSettingsPath
        ? WEB_SETTINGS_MODULE
        : APP_MODULES.find((module) => module.id === moduleId) ?? matchedModule!;
    const matchingSubnav = (MODULE_SUBNAV[moduleId] ?? [])
        .filter((item) => normalizedPath === item.href || normalizedPath.startsWith(`${item.href}/`))
        .sort((a, b) => b.href.length - a.href.length)[0];
    const destination = matchingSubnav ? navigationDestinationFor(moduleId, matchingSubnav.href) : undefined;
    const subnavLabel = destination ? labels[destination] ?? matchingSubnav?.label : matchingSubnav?.label;
    const exactSubnav = Boolean(matchingSubnav && normalizedPath === matchingSubnav.href);

    const items: BreadcrumbItem[] = [
        { label: "Inicio", href: "/" },
        { label: labels[moduleId] ?? moduleDefinition.label, href: moduleDefinition.href },
    ];
    if (matchingSubnav && exactSubnav) items.push({ label: subnavLabel ?? pageTitle ?? "Página" });
    else if (matchingSubnav && matchingSubnav.href !== moduleDefinition.href && normalizedPath.startsWith(`${matchingSubnav.href}/`)) {
        items.push({ label: subnavLabel ?? matchingSubnav.label, href: matchingSubnav.href });
        items.push({ label: pageTitle ?? "Detalle" });
    } else items.push({ label: pageTitle ?? subnavLabel ?? "Detalle" });
    if (icons[moduleId]) items[1] = { ...items[1], iconKey: icons[moduleId] };
    if (matchingSubnav && destination && icons[destination]) {
        const isNestedDestination = !exactSubnav
            && matchingSubnav.href !== moduleDefinition.href
            && normalizedPath.startsWith(`${matchingSubnav.href}/`);
        const destinationIndex = isNestedDestination ? items.length - 2 : items.length - 1;
        items[destinationIndex] = { ...items[destinationIndex], iconKey: icons[destination] };
    }
    return items;
}

/**
 * Renders route breadcrumbs with the signed-in user's navigation label overrides.
 * @param props - Optional page title used for dynamic detail routes.
 * @returns Responsive breadcrumb navigation without changing canonical routes.
 */
export function AppBreadcrumb({ pageTitle }: { readonly pageTitle?: string }) {
    const pathname = usePathname();
    const [navigationLabels, setNavigationLabels] = useState<Record<string, string>>({});
    const [navigationIcons, setNavigationIcons] = useState<Record<string, string>>({});

    useEffect(() => {
        let current = true;
        const loadLabels = () => void fetch("/api/preferences/navigation-labels", { cache: "no-store" })
            .then(async (response) => response.ok ? response.json() : null)
            .then((payload) => { if (current && payload?.data?.labels) setNavigationLabels(payload.data.labels); })
            .catch(() => undefined);
        loadLabels();
        window.addEventListener("kontave:navigation-labels-updated", loadLabels);
        return () => { current = false; window.removeEventListener("kontave:navigation-labels-updated", loadLabels); };
    }, []);

    useEffect(() => {
        let current = true;
        const loadIcons = () => void fetch("/api/preferences/navigation-icons", { cache: "no-store" })
            .then(async (response) => response.ok ? response.json() : null)
            .then((payload) => { if (current && payload?.data?.icons) setNavigationIcons(payload.data.icons); })
            .catch(() => undefined);
        loadIcons();
        window.addEventListener("kontave:navigation-icons-updated", loadIcons);
        return () => { current = false; window.removeEventListener("kontave:navigation-icons-updated", loadIcons); };
    }, []);

    const items = getBreadcrumbItems(pathname, pageTitle, navigationLabels, navigationIcons);
    return (
        <nav aria-label="Migas de pan" className="min-w-0 flex-1 overflow-hidden">
            <ol className="flex min-w-0 items-center gap-1 text-[12px]">
                {items.map((item, index) => {
                    const current = index === items.length - 1;
                    const Icon = item.iconKey ? SEMANTIC_ICONS[item.iconKey] : undefined;
                    return (
                        <li key={`${item.label}-${index}`} className={["min-w-0 items-center gap-1", current ? "flex" : "hidden sm:flex"].join(" ")}>
                            {index > 0 && <ChevronRight size={13} className="hidden shrink-0 text-[var(--text-tertiary)] sm:block" aria-hidden />}
                            {Icon && <Icon size={12} className="shrink-0" aria-hidden="true" />}
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

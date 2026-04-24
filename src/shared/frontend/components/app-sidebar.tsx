"use client";

// AppSidebar — main navigation shell for desktop (inline) and mobile (drawer).
// Orchestrates layout, collapsed/resize state, and module/subnav selection.
// Business UI is delegated to TenantSwitcher, SidebarCompanySelector, SidebarModuleSelector,
// and SidebarSubnav. This file contains only structural and state concerns.

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_MODULES, MODULE_SUBNAV } from "@/src/shared/frontend/navigation";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { useTheme } from "@/src/shared/frontend/components/theme-provider";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useModuleAccess, usePlanName } from "@/src/modules/billing/frontend/hooks/use-module-access";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { useIsDesktop } from "@/src/shared/frontend/hooks/use-is-desktop";
import { PWAInstallButton } from "@/src/shared/frontend/components/pwa-install-button";
import { TenantSwitcher } from "@/src/modules/memberships/frontend/components/tenant-switcher";
import { LogoMark } from "@/src/shared/frontend/components/logo";
import { useProfile } from "@/src/shared/frontend/hooks/use-profile";
import { SidebarCompanySelector } from "@/src/shared/frontend/components/sidebar-company-selector";
import { SidebarModuleSelector } from "@/src/shared/frontend/components/sidebar-module-selector";
import { SidebarSubnav } from "@/src/shared/frontend/components/sidebar-subnav";
import { useUrlContext } from "@/src/shared/frontend/hooks/use-url-context";

// ── Small icon helpers (used only inside this file) ────────────────────────────

const SignOutIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M9 9l3-3-3-3M12 6.5H5" />
    </svg>
);

// ── Nav item class constants ───────────────────────────────────────────────────
// `relative` and `overflow-hidden` are required on NAV_ITEM_BASE for the
// absolute-positioned ActiveBar (2 px orange left edge on active state).

const NAV_ITEM_BASE =
    `relative overflow-hidden flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 font-mono ${APP_SIZES.nav.item} border`;

const NAV_ITEM_IDLE =
    "text-sidebar-fg border-transparent hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border";

// Active: full token (no /40 wash), warm border, subtle shadow.
const NAV_ITEM_ACTIVE =
    "text-sidebar-active-fg bg-sidebar-active-bg border-sidebar-active-border shadow-sm";

// Icon-only button for the collapsed bottom section
// ── ActiveBar — 2 px orange left edge that marks the active nav item ──────────

function ActiveBar({ visible }: { visible: boolean }) {
    if (!visible) return null;
    return (
        <span
            aria-hidden="true"
            className="absolute left-0 inset-y-0 w-0.5 rounded-full bg-sidebar-active-fg"
        />
    );
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const STORAGE_WIDTH = "sidebar-width";
const STORAGE_MODULE = "sidebar-module";
const STORAGE_COLLAPSED = "sidebar-collapsed";

// ── Size constants ────────────────────────────────────────────────────────────

const MIN_WIDTH = 160;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 208;
const COLLAPSED_WIDTH = 48;

// ============================================================================
// COMPONENT
// ============================================================================

interface AppSidebarProps {
    open: boolean;
    onClose: () => void;
}

export function AppSidebar({ open, onClose }: AppSidebarProps) {
    const pathname = usePathname();
    const router = useRouter();

    const { signOut } = useAuth();
    useTheme();
    const { companies, companyId, selectCompany, loading: companyLoading } = useCompany();
    const { hasAccess: hasInventory } = useModuleAccess("inventory");
    const { hasAccess: hasPayroll } = useModuleAccess("payroll");
    const { hasAccess: hasAccounting } = useModuleAccess("accounting");
    useActiveTenantContext();
    const { buildContextHref } = useUrlContext();
    const { profile, email: userEmail } = useProfile();
    const planName = usePlanName();
    const isDesktop = useIsDesktop();

    // ── Collapsed rail (desktop only) ─────────────────────────────────────────
    const [collapsed, setCollapsed] = useState<boolean>(false);

    const isCollapsed = collapsed && isDesktop;

    // ── Module selection ──────────────────────────────────────────────────────
    const [storedModuleId, setStoredModuleId] = useState<string | null>(null);

    const derivedModuleId = useMemo(() => {
        const match = APP_MODULES.find((mod) => {
            const base = "/" + mod.href.split("/").filter(Boolean)[0];
            return pathname.startsWith(base);
        });
        return match?.id ?? null;
    }, [pathname]);

    // Pathname match always wins over the stored preference
    const resolvedModuleId = derivedModuleId ?? storedModuleId;
    const subnav = resolvedModuleId ? MODULE_SUBNAV[resolvedModuleId] : undefined;

    // Modules available in the picker — excludes child modules and inaccessible paid ones
    const paidAccess: Record<string, boolean> = {
        payroll: hasPayroll, inventory: hasInventory, accounting: hasAccounting,
    };

    const selectableModules = useMemo(() =>
        APP_MODULES
            .filter((mod) => {
                if ("parentId" in mod) return false;
                if (mod.paid && !paidAccess[mod.id]) return false;
                if (mod.desktopOnly && !isDesktop) return false;
                return true;
            })
            .map((mod) => ({ id: mod.id, label: mod.label, href: mod.href })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hasPayroll, hasInventory, hasAccounting, isDesktop]);

    function handleSelectModule(id: string, href: string) {
        setStoredModuleId(id);
        localStorage.setItem(STORAGE_MODULE, id);
        router.push(buildContextHref(href));
    }

    // ── Resizable sidebar (desktop only, disabled when collapsed) ─────────────
    const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_WIDTH);
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(DEFAULT_WIDTH);
    const widthRef = useRef(DEFAULT_WIDTH);

    useEffect(() => { widthRef.current = sidebarWidth; }, [sidebarWidth]);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        startX.current = e.clientX;
        startWidth.current = widthRef.current;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }, []);

    // ── Sync with localStorage on mount ───────────────────────────────────
    useEffect(() => {
        const savedCollapsed = localStorage.getItem(STORAGE_COLLAPSED);
        if (savedCollapsed !== null) {
            setCollapsed(savedCollapsed === "true");
        }

        const savedModule = localStorage.getItem(STORAGE_MODULE);
        if (savedModule !== null) {
            setStoredModuleId(savedModule);
        }

        const savedWidth = localStorage.getItem(STORAGE_WIDTH);
        if (savedWidth !== null) {
            const w = parseInt(savedWidth, 10);
            if (!isNaN(w)) {
                setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));
            }
        }
    }, []);

    useEffect(() => {
        function onMouseMove(e: MouseEvent) {
            if (!isResizing.current) return;
            setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + (e.clientX - startX.current))));
        }
        function onMouseUp() {
            if (!isResizing.current) return;
            isResizing.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            localStorage.setItem(STORAGE_WIDTH, String(widthRef.current));
        }
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

    // ── Drawer auto-close on route change (mobile) ────────────────────────────
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });
    useEffect(() => { onCloseRef.current(); }, [pathname]);

    // ── Sign out ──────────────────────────────────────────────────────────────
    async function handleSignOut() {
        await signOut();
        router.replace("/sign-in");
    }

    // ── Render ────────────────────────────────────────────────────────────────

    const profileActive = pathname.startsWith("/settings/profile");
    return (
        <aside
            aria-label="Navegación principal"
            style={isDesktop ? { width: isCollapsed ? COLLAPSED_WIDTH : sidebarWidth } : undefined}
            className={[
                "flex-shrink-0 flex flex-col bg-sidebar-bg border-r border-sidebar-border overflow-hidden",
                "fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-300 ease-in-out",
                open ? "translate-x-0" : "-translate-x-full",
                "xl:relative xl:inset-auto xl:z-auto xl:translate-x-0 xl:transition-[width] xl:duration-200",
            ].join(" ")}
        >
            {/* ── Logo ──────────────────────────────────────────────────── */}
            <div
                style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top))" }}
                className={[
                    "flex items-center gap-3",
                    isCollapsed ? "justify-center pb-6 px-2" : "px-6 pb-6",
                ].join(" ")}>
                <LogoMark size={isCollapsed ? 36 : 44} className="text-primary-500" />
            </div>

            {/* ── Sections ────────────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-h-0 overflow-visible">

                {/* ── Bloque superior: Cuenta / Empresa / Módulo ──────────
                    Sin separadores internos entre estas tres — forman un grupo
                    visual cohesivo. El único border-t es el que separa el logo
                    de este bloque. ──────────────────────────────────────── */}
                <div className="border-t border-sidebar-border px-4 pt-3 pb-2 flex flex-col gap-1">
                    {/* Cuenta */}
                    {!isCollapsed && (
                        <p className={`px-2 mb-1 font-mono ${APP_SIZES.nav.sectionLabel} text-sidebar-label`}>
                            Cuenta
                        </p>
                    )}
                    <div className={isCollapsed ? "flex justify-center" : ""}>
                        <TenantSwitcher />
                    </div>

                    {/* Empresa */}
                    {!isCollapsed && (
                        <p className={`px-2 mt-2 mb-1 font-mono ${APP_SIZES.nav.sectionLabel} text-sidebar-label`}>
                            Empresa
                        </p>
                    )}
                    {isCollapsed && <div className="h-1" />}
                    <div className={isCollapsed ? "flex justify-center" : ""}>
                        <SidebarCompanySelector
                            companies={companies}
                            selectedId={companyId}
                            loading={companyLoading}
                            isCollapsed={isCollapsed}
                            onSelect={selectCompany}
                        />
                    </div>

                    {/* Módulo */}
                    {!isCollapsed && (
                        <p className={`px-2 mt-2 mb-1 font-mono ${APP_SIZES.nav.sectionLabel} text-sidebar-label`}>
                            Módulo
                        </p>
                    )}
                    {isCollapsed && <div className="h-1" />}
                    <div className={isCollapsed ? "flex justify-center" : ""}>
                        <SidebarModuleSelector
                            modules={selectableModules}
                            activeModuleId={resolvedModuleId}
                            isCollapsed={isCollapsed}
                            onSelect={handleSelectModule}
                        />
                    </div>
                </div>

                {/* ── Sub-navigation ─────────────────────────────────────── */}
                {!isCollapsed && (
                    <nav
                        className="flex-1 px-3 py-4 overflow-y-auto"
                        style={{ scrollbarGutter: "stable" }}
                        aria-label="Secciones del módulo"
                    >
                        <SidebarSubnav subnav={subnav ?? []} pathname={pathname} />
                    </nav>
                )}
            </div>

            {/* Spacer — keeps bottom section flush to the bottom when collapsed */}
            {isCollapsed && <div className="flex-1" />}

            {/* ── Ajustes ─────────────────────────────────────────────────
                Separador más visible que los internos del bloque superior —
                marca la transición entre navegación primaria y configuración. */}
            {!isCollapsed && (
                <div className="px-4 py-2 border-t border-sidebar-border">
                    <p className={`px-2 mb-2 font-mono ${APP_SIZES.nav.sectionLabel} text-sidebar-label`}>
                        Ajustes
                    </p>
                    <Link
                        href={buildContextHref("/settings/members")}
                        className={[NAV_ITEM_BASE, pathname.startsWith("/settings") ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE].join(" ")}
                    >
                        <ActiveBar visible={pathname.startsWith("/settings")} />
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="5" cy="4" r="1.8" />
                            <path d="M1.5 11c0-2 1.6-3 3.5-3s3.5 1 3.5 3" />
                            <circle cx="9.5" cy="4.5" r="1.4" />
                            <path d="M9.5 7.5c1.2 0 2 .7 2 2" />
                        </svg>
                        Miembros
                    </Link>
                </div>
            )}

            {/* ── Bottom actions ─────────────────────────────────────────── */}
            <div
                style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
                className="px-4 pt-4 space-y-3 border-t border-sidebar-border"
            >
                <Link href={buildContextHref("/profile")}
                    aria-current={profileActive ? "page" : undefined}
                    className="block group outline-none font-mono">
                    <ProfileSection
                        profile={profile}
                        email={userEmail}
                        active={profileActive}
                        isCollapsed={isCollapsed}
                        planName={planName}
                    />
                </Link>

                {!isCollapsed ? (
                    <div className="space-y-1">
                        <PWAInstallButton navItemBase={NAV_ITEM_BASE} navItemIdle={NAV_ITEM_IDLE} />

                        <button
                            onClick={handleSignOut}
                            aria-label="Cerrar sesión"
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 font-mono ${APP_SIZES.nav.item} border border-transparent text-sidebar-fg hover:text-red-500 hover:bg-red-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40`}
                        >
                            <SignOutIcon />
                            Cerrar sesión
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={handleSignOut}
                            aria-label="Cerrar sesión"
                            title="Cerrar sesión"
                            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 text-sidebar-fg hover:text-red-500 hover:bg-red-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                        >
                            <SignOutIcon />
                        </button>
                    </div>
                )}
            </div>

            {/* ── Resize handle (desktop, hidden when collapsed) ─────────── */}
            {isDesktop && !isCollapsed && (
                <div
                    aria-hidden="true"
                    onMouseDown={handleResizeStart}
                    className="absolute inset-y-0 right-0 w-2 cursor-col-resize group z-10"
                >
                    <div className="absolute inset-y-0 right-0 w-px bg-sidebar-border transition-colors duration-150 group-hover:bg-primary-500/50 group-active:bg-primary-500" />
                </div>
            )}
        </aside>
    );
}

// ── UserAvatar ────────────────────────────────────────────────────────────────

function UserAvatar({ avatarUrl, email, size = 32 }: { avatarUrl?: string | null; email?: string | null; size?: number }) {
    const initial = (email?.[0] ?? "?").toUpperCase();
    return (
        <div aria-hidden="true" style={{ width: size, height: size }}
            className="relative rounded-full bg-primary-500/10 border border-primary-500/20 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
            {avatarUrl
                ? <Image src={avatarUrl} alt="" fill unoptimized sizes="32px" className="object-cover" />
                : <span className="font-mono text-xs font-bold text-primary-500 uppercase">{initial}</span>}
        </div>
    );
}

interface SidebarProfile {
    name?: string | null;
    avatarUrl?: string | null;
}

function ProfileSection({ profile, email, active, isCollapsed, planName }: { profile: SidebarProfile; email?: string | null; active: boolean; isCollapsed: boolean; planName?: string | null }) {
    if (isCollapsed) {
        return (
            <div className="relative flex justify-center py-2">
                <UserAvatar avatarUrl={profile.avatarUrl} email={email} size={32} />
            </div>
        );
    }

    return (
        <div className={[
            "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150 border border-transparent",
            active ? "bg-sidebar-active-bg border-sidebar-active-border shadow-sm" : "hover:bg-sidebar-bg-hover"
        ].join(" ")}>
            <ActiveBar visible={active} />
            <UserAvatar avatarUrl={profile.avatarUrl} email={email} size={32} />
            <div className="flex-1 min-w-0">
                <p className={`font-mono ${APP_SIZES.nav.item} font-semibold text-sidebar-fg truncate`}>
                    {profile.name ?? email?.split("@")[0] ?? "Usuario"}
                </p>
                {planName && (
                    <span className="inline-flex items-center mt-0.5 px-1.5 py-px rounded-sm font-mono text-[9px] uppercase tracking-[0.12em] bg-sidebar-bg-hover text-sidebar-label border border-sidebar-border/60">
                        {planName}
                    </span>
                )}
            </div>
        </div>
    );
}

"use client";

// AppSidebar — main navigation shell for desktop (inline) and mobile (drawer).
// Orchestrates layout, collapsed/resize state, and module/subnav selection.
// Business UI is delegated to TenantSwitcher, SidebarCompanySelector, SidebarModuleSelector,
// and SidebarSubnav. This file contains only structural and state concerns.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_MODULES, MODULE_SUBNAV } from "@/src/shared/frontend/navigation";
import { useAuth }          from "@/src/modules/auth/frontend/hooks/use-auth";
import { useTheme }         from "@/src/shared/frontend/components/theme-provider";
import { useCompany }       from "@/src/modules/companies/frontend/hooks/use-companies";
import { useModuleAccess }  from "@/src/modules/billing/frontend/hooks/use-module-access";
import { APP_SIZES }        from "@/src/shared/frontend/sizes";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { useIsDesktop }     from "@/src/shared/frontend/hooks/use-is-desktop";
import { PWAInstallButton } from "@/src/shared/frontend/components/pwa-install-button";
import { TenantSwitcher }   from "@/src/modules/memberships/frontend/components/tenant-switcher";
import { LogoFull, LogoMark } from "@/src/shared/frontend/components/logo";
import { useProfile }       from "@/src/shared/frontend/hooks/use-profile";
import { SidebarCompanySelector } from "@/src/shared/frontend/components/sidebar-company-selector";
import { SidebarModuleSelector }  from "@/src/shared/frontend/components/sidebar-module-selector";
import { SidebarSubnav }          from "@/src/shared/frontend/components/sidebar-subnav";

// ── Small icon helpers (used only inside this file) ────────────────────────────

const SunIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="2.5" />
        <path d="M6.5 1v1M6.5 11v1M1 6.5h1M11 6.5h1M2.9 2.9l.7.7M9.4 9.4l.7.7M2.9 10.1l.7-.7M9.4 3.6l.7-.7" />
    </svg>
);

const MoonIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 7.5A5 5 0 0 1 5.5 2a5 5 0 1 0 5.5 5.5z" />
    </svg>
);

const CollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {collapsed
            ? <path d="M3 2.5l4 4-4 4M9 6.5H7" />
            : <path d="M10 2.5l-4 4 4 4M4 6.5h2" />
        }
    </svg>
);

const SignOutIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M9 9l3-3-3-3M12 6.5H5" />
    </svg>
);

const MembersIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="5" cy="4" r="2.5" />
        <path d="M1 11c0-2.2 1.8-4 4-4s4 1.8 4 4" />
        <path d="M10 5v4M12 7H8" />
    </svg>
);

// ── Nav item class constants ───────────────────────────────────────────────────
// `relative` is required on NAV_ITEM_BASE for the absolute-positioned ActiveBar.

const NAV_ITEM_BASE =
    `relative flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 font-mono ${APP_SIZES.nav.item} border`;

const NAV_ITEM_IDLE =
    "text-sidebar-fg border-transparent hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border";

const NAV_ITEM_ACTIVE =
    "text-sidebar-active-fg bg-sidebar-active-bg/60 border-transparent";

// Icon-only button for the collapsed bottom section
const ICON_BTN =
    "flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 text-sidebar-fg hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border";

// ── Active bar — 2px left accent for bottom-section active items ───────────────

function ActiveBar() {
    return <span aria-hidden="true" className="absolute left-0 inset-y-1.5 w-0.5 rounded-full bg-primary-500" />;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const STORAGE_WIDTH     = "sidebar-width";
const STORAGE_MODULE    = "sidebar-module";
const STORAGE_COLLAPSED = "sidebar-collapsed";

// ── Size constants ────────────────────────────────────────────────────────────

const MIN_WIDTH       = 160;
const MAX_WIDTH       = 400;
const DEFAULT_WIDTH   = 208;
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
    const router   = useRouter();

    const { signOut }            = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { companies, companyId, selectCompany, loading: companyLoading } = useCompany();
    const { hasAccess: hasInventory  } = useModuleAccess("inventory");
    const { hasAccess: hasPayroll    } = useModuleAccess("payroll");
    const { hasAccess: hasAccounting } = useModuleAccess("accounting");
    const { activeTenantRole } = useActiveTenantContext();
    const { profile, email: userEmail } = useProfile();
    const isDesktop = useIsDesktop();

    // ── Collapsed rail (desktop only) ─────────────────────────────────────────
    const [collapsed, setCollapsed] = useState<boolean>(false);

    const isCollapsed = collapsed && isDesktop;

    function handleToggleCollapse() {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem(STORAGE_COLLAPSED, String(next));
    }

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
        router.push(href);
    }

    // ── Resizable sidebar (desktop only, disabled when collapsed) ─────────────
    const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_WIDTH);
    const isResizing = useRef(false);
    const startX     = useRef(0);
    const startWidth = useRef(DEFAULT_WIDTH);
    const widthRef   = useRef(DEFAULT_WIDTH);

    useEffect(() => { widthRef.current = sidebarWidth; }, [sidebarWidth]);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current  = true;
        startX.current      = e.clientX;
        startWidth.current  = widthRef.current;
        document.body.style.cursor     = "col-resize";
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
            isResizing.current             = false;
            document.body.style.cursor     = "";
            document.body.style.userSelect = "";
            localStorage.setItem(STORAGE_WIDTH, String(widthRef.current));
        }
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup",   onMouseUp);
        return () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup",   onMouseUp);
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
    const membersActive = pathname.startsWith("/settings/members");

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
            <div className={[
                "border-b border-sidebar-border flex items-center",
                isCollapsed ? "justify-center py-[18px] px-2" : "px-5 py-[18px]",
            ].join(" ")}>
                {isCollapsed
                    ? <LogoMark size={20} className="text-sidebar-fg" />
                    : <LogoFull  size={24} className="text-sidebar-fg" />
                }
            </div>

            {/* ── Tenant switcher — hidden when collapsed ────────────────── */}
            {!isCollapsed && <TenantSwitcher />}

            {/* ── Company selector ──────────────────────────────────────── */}
            <div className={[
                "border-b border-sidebar-border overflow-visible",
                isCollapsed ? "py-2 flex justify-center" : "px-3 py-3",
            ].join(" ")}>
                {!isCollapsed && (
                    <p className={`px-2 mb-1.5 font-mono ${APP_SIZES.nav.sectionLabel} uppercase text-sidebar-label`}>
                        Empresa
                    </p>
                )}
                <SidebarCompanySelector
                    companies={companies}
                    selectedId={companyId}
                    loading={companyLoading}
                    isCollapsed={isCollapsed}
                    onSelect={selectCompany}
                />
            </div>

            {/* ── Module selector ───────────────────────────────────────── */}
            <div className={[
                "border-b border-sidebar-border overflow-visible",
                isCollapsed ? "py-2 flex justify-center" : "px-3 py-3",
            ].join(" ")}>
                {!isCollapsed && (
                    <p className={`px-2 mb-1.5 font-mono ${APP_SIZES.nav.sectionLabel} uppercase text-sidebar-label`}>
                        Módulo
                    </p>
                )}
                <SidebarModuleSelector
                    modules={selectableModules}
                    activeModuleId={resolvedModuleId}
                    isCollapsed={isCollapsed}
                    onSelect={handleSelectModule}
                />
            </div>

            {/* ── Module subnav — hidden in collapsed mode ──────────────── */}
            {!isCollapsed && (
                <nav className="flex-1 px-3 py-4 overflow-y-auto" aria-label="Secciones del módulo">
                    <SidebarSubnav subnav={subnav ?? []} pathname={pathname} />
                </nav>
            )}

            {/* Spacer — keeps bottom section flush to the bottom when collapsed */}
            {isCollapsed && <div className="flex-1" />}

            {/* ── Bottom actions ─────────────────────────────────────────── */}
            {isCollapsed ? (
                <div className="py-3 flex flex-col items-center gap-1 border-t border-sidebar-border">
                    <Link href="/settings/profile" aria-label="Perfil"
                        aria-current={profileActive ? "page" : undefined}
                        className={[ICON_BTN, profileActive ? "text-sidebar-active-fg bg-sidebar-active-bg/60" : ""].join(" ")}>
                        <UserAvatar avatarUrl={profile.avatarUrl} email={userEmail} size={18} />
                    </Link>

                    {activeTenantRole !== "contable" && (
                        <Link href="/settings/members" aria-label="Miembros"
                            aria-current={membersActive ? "page" : undefined}
                            className={[ICON_BTN, membersActive ? "text-sidebar-active-fg bg-sidebar-active-bg/60" : ""].join(" ")}>
                            <MembersIcon />
                        </Link>
                    )}

                    <button onClick={toggleTheme}
                        aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                        className={ICON_BTN}>
                        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                    </button>

                    <button onClick={handleSignOut} aria-label="Cerrar sesión"
                        className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 text-sidebar-fg hover:text-red-500 hover:bg-red-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40">
                        <SignOutIcon />
                    </button>

                    <button onClick={handleToggleCollapse} aria-label="Expandir barra lateral" className={ICON_BTN}>
                        <CollapseIcon collapsed={true} />
                    </button>
                </div>
            ) : (
                <div className="px-3 py-4 space-y-1 border-t border-sidebar-border">
                    <Link href="/settings/profile"
                        aria-current={profileActive ? "page" : undefined}
                        className={[NAV_ITEM_BASE, profileActive ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE].join(" ")}>
                        {profileActive && <ActiveBar />}
                        <UserAvatar avatarUrl={profile.avatarUrl} email={userEmail} size={18} />
                        <span className="truncate flex-1 text-left">
                            {profile.name ?? userEmail?.split("@")[0] ?? "Perfil"}
                        </span>
                    </Link>

                    {activeTenantRole !== "contable" && (
                        <Link href="/settings/members"
                            aria-current={membersActive ? "page" : undefined}
                            className={[NAV_ITEM_BASE, membersActive ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE].join(" ")}>
                            {membersActive && <ActiveBar />}
                            <MembersIcon />
                            Miembros
                        </Link>
                    )}

                    <PWAInstallButton navItemBase={NAV_ITEM_BASE} navItemIdle={NAV_ITEM_IDLE} />

                    <button onClick={toggleTheme}
                        aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                        className={[NAV_ITEM_BASE, NAV_ITEM_IDLE].join(" ")}>
                        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                        {theme === "dark" ? "Modo claro" : "Modo oscuro"}
                    </button>

                    <button onClick={handleSignOut} aria-label="Cerrar sesión"
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 font-mono ${APP_SIZES.nav.item} border border-transparent text-sidebar-fg hover:text-red-500 hover:bg-red-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40`}>
                        <SignOutIcon />
                        Cerrar sesión
                    </button>

                    <button onClick={handleToggleCollapse} aria-label="Colapsar barra lateral"
                        className={[NAV_ITEM_BASE, NAV_ITEM_IDLE].join(" ")}>
                        <CollapseIcon collapsed={false} />
                        Colapsar
                    </button>
                </div>
            )}

            {/* ── Resize handle (desktop, hidden when collapsed) ─────────── */}
            {isDesktop && !isCollapsed && (
                <div aria-hidden="true" onMouseDown={handleResizeStart}
                    className="absolute inset-y-0 right-0 w-1 cursor-col-resize group z-10">
                    <div className="absolute inset-y-0 right-0 w-px bg-sidebar-border transition-colors duration-150 group-hover:bg-primary-500/50 group-active:bg-primary-500" />
                </div>
            )}
        </aside>
    );
}

// ── UserAvatar ────────────────────────────────────────────────────────────────

function UserAvatar({ avatarUrl, email, size = 18 }: { avatarUrl?: string | null; email?: string | null; size?: number }) {
    const initial = (email?.[0] ?? "?").toUpperCase();
    return (
        <div aria-hidden="true" style={{ width: size, height: size }}
            className="rounded-full bg-primary-500/20 overflow-hidden flex items-center justify-center shrink-0">
            {avatarUrl
                ? <img src={avatarUrl} alt="" className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                : <span className="font-mono text-[9px] font-bold text-primary-400 uppercase">{initial}</span>}
        </div>
    );
}

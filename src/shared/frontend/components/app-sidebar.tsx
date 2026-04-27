"use client";

// AppSidebar — main navigation shell for desktop (inline) and mobile (drawer).
// Layout, per the Konta sidebar rules:
//
//   ┌─ konta. wordmark ───────── [⌕ search] ─┐
//   │ MÓDULO                                  │
//   │ [card ▸ avatar ▸ name+meta ▸ chevron]   │
//   │ EMPRESA                                 │
//   │ [card ▸ avatar·dot ▸ name+meta ▸ chev]  │
//   │ WORKSPACE · {MODULE}                    │
//   │   …subnav…                              │
//   ├─────────────────────────────────────────┤
//   │ ⚙ Configuración  ? Ayuda   (utility)    │
//   │ [account card ▸ avatar·dot ▸ email ▸ ⇵] │
//   └─────────────────────────────────────────┘
//
// Business UI is delegated to sub-components; this file owns structure + state.

import Link from "next/link";
import Image from "next/image";
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
import { LogoFull, LogoMark } from "@/src/shared/frontend/components/logo";
import { useProfile } from "@/src/shared/frontend/hooks/use-profile";
import { SidebarCompanySelector } from "@/src/shared/frontend/components/sidebar-company-selector";
import { SidebarModuleSelector } from "@/src/shared/frontend/components/sidebar-module-selector";
import { SidebarSubnav } from "@/src/shared/frontend/components/sidebar-subnav";
import { useUrlContext } from "@/src/shared/frontend/hooks/use-url-context";

// ── Storage keys ──────────────────────────────────────────────────────────────

const STORAGE_WIDTH     = "sidebar-width";
const STORAGE_MODULE    = "sidebar-module";
const STORAGE_COLLAPSED = "sidebar-collapsed";

// ── Size constants ────────────────────────────────────────────────────────────

const MIN_WIDTH       = 200;
const MAX_WIDTH       = 400;
const DEFAULT_WIDTH   = 256;
const COLLAPSED_WIDTH = 56;

// ── Small helpers ─────────────────────────────────────────────────────────────

const MONTHS_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function currentQuincenaLabel(d: Date = new Date()): string {
    const q     = d.getDate() <= 15 ? "Quincena 1" : "Quincena 2";
    const month = MONTHS_ES[d.getMonth()];
    return `${q} · ${month} ${d.getFullYear()}`;
}

function buildModuleSubtitle(moduleId: string | null, planName?: string | null): string | null {
    switch (moduleId) {
        case "payroll":     return currentQuincenaLabel();
        case "inventory":   return "Productos · Movimientos";
        case "accounting":  return "Libro diario";
        case "companies":   return "Directorio";
        case "documents":   return "Archivos y contratos";
        case "tools":       return "BCV · SENIAT";
        case "billing":     return planName ?? "Suscripción";
        default:            return null;
    }
}

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
    const { hasAccess: hasInventory  } = useModuleAccess("inventory");
    const { hasAccess: hasPayroll    } = useModuleAccess("payroll");
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

    const resolvedModuleId = derivedModuleId ?? storedModuleId;
    const subnav = resolvedModuleId ? MODULE_SUBNAV[resolvedModuleId] : undefined;

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

    const activeModuleLabel = useMemo(() => {
        return selectableModules.find((m) => m.id === resolvedModuleId)?.label ?? "Workspace";
    }, [selectableModules, resolvedModuleId]);

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

    useEffect(() => {
        const savedCollapsed = localStorage.getItem(STORAGE_COLLAPSED);
        if (savedCollapsed !== null) setCollapsed(savedCollapsed === "true");

        const savedModule = localStorage.getItem(STORAGE_MODULE);
        if (savedModule !== null) setStoredModuleId(savedModule);

        const savedWidth = localStorage.getItem(STORAGE_WIDTH);
        if (savedWidth !== null) {
            const w = parseInt(savedWidth, 10);
            if (!isNaN(w)) setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));
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

    async function handleSignOut() {
        await signOut();
        router.replace("/sign-in");
    }

    // ── Render ────────────────────────────────────────────────────────────────

    const moduleSubtitle = buildModuleSubtitle(resolvedModuleId, planName);

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
            {/* ── Brand row: konta. wordmark + search affordance ───────── */}
            <div
                style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
                className={[
                    "flex items-center",
                    isCollapsed ? "justify-center pb-4 px-2" : "justify-between pb-4 px-5",
                ].join(" ")}
            >
                {isCollapsed ? (
                    <LogoMark size={28} className="text-sidebar-fg-hover" />
                ) : (
                    <>
                        <LogoFull size={26} className="text-sidebar-fg-hover" />
                        <SearchButton />
                    </>
                )}
            </div>

            {/* ── Top block: Módulo + Empresa (paired cards) ──────────── */}
            <div className={[
                "border-t border-sidebar-border",
                isCollapsed ? "px-2 pt-3 pb-2 flex flex-col items-center gap-3" : "px-4 pt-4 pb-2 flex flex-col gap-3",
            ].join(" ")}>
                {/* Módulo */}
                <div className={isCollapsed ? "flex justify-center" : "flex flex-col gap-1.5"}>
                    {!isCollapsed && (
                        <p className={`px-1 font-mono ${APP_SIZES.nav.sectionLabel} text-sidebar-label`}>
                            Módulo
                        </p>
                    )}
                    <SidebarModuleSelector
                        modules={selectableModules}
                        activeModuleId={resolvedModuleId}
                        isCollapsed={isCollapsed}
                        onSelect={handleSelectModule}
                        subtitle={moduleSubtitle}
                    />
                </div>

                {/* Empresa */}
                <div className={isCollapsed ? "flex justify-center" : "flex flex-col gap-1.5"}>
                    {!isCollapsed && (
                        <p className={`px-1 font-mono ${APP_SIZES.nav.sectionLabel} text-sidebar-label`}>
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
            </div>

            {/* ── Sub-navigation (workspace) ────────────────────────── */}
            <div className="flex-1 flex flex-col min-h-0 overflow-visible">
                {!isCollapsed && (
                    <nav
                        className="flex-1 px-4 pt-3 pb-4 overflow-y-auto"
                        style={{ scrollbarGutter: "stable" }}
                        aria-label="Secciones del módulo"
                    >
                        {/* Combined "WORKSPACE · NÓMINA" header — 10px / 0.18em per rules */}
                        <div className="flex items-center gap-2 px-1 pb-2">
                            <span className={`font-mono ${APP_SIZES.nav.sectionLabel} text-sidebar-label`}>
                                Workspace
                            </span>
                            <span aria-hidden="true" className="text-sidebar-label/60 text-[10px]">·</span>
                            <span className={`font-mono ${APP_SIZES.nav.sectionLabel} text-sidebar-fg-hover`}>
                                {activeModuleLabel}
                            </span>
                        </div>

                        <SidebarSubnav subnav={subnav ?? []} pathname={pathname} />
                    </nav>
                )}

                {isCollapsed && <div className="flex-1" />}
            </div>

            {/* ── Utility shortcuts (Config / Help) ─────────────────── */}
            {!isCollapsed && (
                <div className="px-4 pt-2 pb-1 border-t border-sidebar-border flex flex-col gap-0.5">
                    <UtilityShortcut
                        href={buildContextHref("/settings/members")}
                        active={pathname.startsWith("/settings")}
                        label="Configuración"
                        icon={<GearIcon />}
                    />
                    <UtilityShortcut
                        href={buildContextHref("/help")}
                        active={pathname.startsWith("/help")}
                        label="Ayuda"
                        icon={<HelpIcon />}
                    />
                </div>
            )}

            {/* ── Bottom: account card ───────────────────────────────── */}
            <div
                style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
                className={[
                    "pt-2",
                    isCollapsed ? "px-2 flex flex-col items-center gap-2" : "px-4",
                ].join(" ")}
            >
                <AccountCard
                    email={userEmail}
                    name={profile?.name}
                    avatarUrl={profile?.avatarUrl}
                    planName={planName}
                    isCollapsed={isCollapsed}
                    onSignOut={handleSignOut}
                    profileHref={buildContextHref("/profile")}
                />
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

// ────────────────────────────────────────────────────────────────────────────
// SearchButton — square icon button paired with the wordmark in the brand row
// ────────────────────────────────────────────────────────────────────────────

function SearchButton() {
    return (
        <button
            type="button"
            aria-label="Buscar (⌘K)"
            title="Buscar"
            className="flex items-center justify-center w-8 h-8 rounded-md bg-sidebar-bg-hover text-sidebar-fg hover:bg-sidebar-bg-hover hover:text-sidebar-fg-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
        >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M10.3 10.3L13.5 13.5" />
            </svg>
        </button>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// UtilityShortcut — Config / Help rows
// ────────────────────────────────────────────────────────────────────────────

function UtilityShortcut({ href, active, label, icon }: { href: string; active: boolean; label: string; icon: React.ReactNode }) {
    return (
        <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
                "group flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors duration-150",
                "font-mono text-[11px] uppercase tracking-[0.14em]",
                active
                    ? "text-sidebar-active-fg bg-sidebar-active-bg/60"
                    : "text-sidebar-fg hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover",
            ].join(" ")}
        >
            <span className="shrink-0 w-4 h-4 flex items-center justify-center text-sidebar-label group-hover:text-sidebar-fg-hover">
                {icon}
            </span>
            <span>{label}</span>
        </Link>
    );
}

function GearIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="2.2" />
            <path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1.06 1.06M4.46 11.54L3.4 12.6M12.6 12.6l-1.06-1.06M4.46 4.46L3.4 3.4" />
        </svg>
    );
}

function HelpIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6.2" />
            <path d="M6 6.2a2 2 0 1 1 2.6 1.9c-.6.2-.8.6-.8 1.2v.3" />
            <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
        </svg>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// AccountCard — bottom card: avatar + status dot + email + double chevrons
// ────────────────────────────────────────────────────────────────────────────

interface AccountCardProps {
    email?:       string | null;
    name?:        string | null;
    avatarUrl?:   string | null;
    planName?:    string | null;
    isCollapsed:  boolean;
    onSignOut:    () => void | Promise<void>;
    profileHref:  string;
}

function AccountCard({ email, name, avatarUrl, planName, isCollapsed, onSignOut, profileHref }: AccountCardProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const { allTenants, activeTenantId, switchTenant } = useActiveTenantContext();
    const router = useRouter();

    useEffect(() => {
        if (!open) return;
        function handle(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        function handle(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("keydown", handle);
        return () => document.removeEventListener("keydown", handle);
    }, [open]);

    const initial = (name?.[0] ?? email?.[0] ?? "?").toUpperCase();
    const displayName = name ?? email?.split("@")[0] ?? "Usuario";

    if (isCollapsed) {
        return (
            <div className="relative" ref={ref}>
                <button
                    onClick={() => setOpen((v) => !v)}
                    aria-label={`Cuenta: ${displayName}. Abrir menú`}
                    aria-expanded={open}
                    aria-haspopup="menu"
                    className="relative flex items-center justify-center w-9 h-9 rounded-md bg-sidebar-bg-hover/60 border border-transparent hover:border-sidebar-border hover:bg-sidebar-bg-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
                >
                    <Avatar avatarUrl={avatarUrl} initial={initial} size={28} />
                    <StatusDot />
                </button>

                {open && (
                    <AccountMenu
                        className="absolute left-full bottom-0 ml-2 w-60"
                        email={email}
                        displayName={displayName}
                        planName={planName}
                        allTenants={allTenants}
                        activeTenantId={activeTenantId}
                        onSwitchTenant={(id) => { switchTenant(id); setOpen(false); router.refresh(); }}
                        onProfileClick={() => { setOpen(false); router.push(profileHref); }}
                        onSignOut={async () => { setOpen(false); await onSignOut(); }}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                aria-label={`Cuenta: ${displayName}. Abrir menú`}
                aria-expanded={open}
                aria-haspopup="menu"
                className={[
                    "w-full flex items-center gap-2.5 p-2 rounded-lg border transition-colors duration-150 text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border",
                    open
                        ? "bg-sidebar-bg-hover border-border-medium"
                        : "bg-sidebar-bg-hover/60 border-sidebar-border hover:bg-sidebar-bg-hover hover:border-border-medium",
                ].join(" ")}
            >
                <span className="relative shrink-0">
                    <Avatar avatarUrl={avatarUrl} initial={initial} size={32} />
                    <StatusDot />
                </span>

                <span className="flex-1 min-w-0 flex flex-col leading-tight">
                    <span className="font-mono text-[12px] font-semibold text-sidebar-fg-hover truncate">
                        {displayName}
                    </span>
                    {email && email !== displayName && (
                        <span className="font-mono text-[10px] tracking-[0.02em] text-sidebar-label truncate mt-0.5">
                            {email}
                        </span>
                    )}
                </span>

                <DoubleChevron />
            </button>

            {open && (
                <AccountMenu
                    className="absolute left-0 right-0 bottom-full mb-2"
                    email={email}
                    displayName={displayName}
                    planName={planName}
                    allTenants={allTenants}
                    activeTenantId={activeTenantId}
                    onSwitchTenant={(id) => { switchTenant(id); setOpen(false); router.refresh(); }}
                    onProfileClick={() => { setOpen(false); router.push(profileHref); }}
                    onSignOut={async () => { setOpen(false); await onSignOut(); }}
                />
            )}
        </div>
    );
}

function Avatar({ avatarUrl, initial, size }: { avatarUrl?: string | null; initial: string; size: number }) {
    return (
        <span
            aria-hidden="true"
            style={{ width: size, height: size }}
            className="relative rounded-full bg-primary-500/10 border border-primary-500/20 overflow-hidden flex items-center justify-center shrink-0 shadow-sm"
        >
            {avatarUrl ? (
                <Image src={avatarUrl} alt="" fill unoptimized sizes="32px" className="object-cover" />
            ) : (
                <span className="font-mono text-[11px] font-bold text-primary-500 uppercase">{initial}</span>
            )}
        </span>
    );
}

function StatusDot() {
    return (
        <span
            aria-hidden="true"
            className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar-bg"
        />
    );
}

/**
 * Double chevron (up + down) — signals "this opens upward and contains more."
 * Referenced in the rules as "chevrons dobles que abren el menú de cuentas/logout."
 */
function DoubleChevron() {
    return (
        <svg
            aria-hidden="true"
            className="shrink-0 text-sidebar-label"
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
        >
            <path d="M3 4.5L6 2l3 2.5" />
            <path d="M3 7.5L6 10l3-2.5" />
        </svg>
    );
}

// ── Account menu (tenants + profile + sign out) ──────────────────────────

interface AccountMenuProps {
    className:      string;
    email?:         string | null;
    displayName:    string;
    planName?:      string | null;
    allTenants:     Array<{ tenantId: string; tenantEmail: string; tenantAvatarUrl: string | null; isOwn: boolean; role: string }>;
    activeTenantId: string | null;
    onSwitchTenant: (id: string) => void;
    onProfileClick: () => void;
    onSignOut:      () => void;
}

function AccountMenu({ className, email, displayName, planName, allTenants, activeTenantId, onSwitchTenant, onProfileClick, onSignOut }: AccountMenuProps) {
    const hasMultipleTenants = allTenants.length > 1;

    return (
        <div
            role="menu"
            className={[
                "rounded-lg overflow-hidden z-50 shadow-lg bg-sidebar-bg border border-sidebar-border",
                className,
            ].join(" ")}
            style={{ boxShadow: "var(--shadow-lg)" }}
        >
            {/* Header with name, email, plan */}
            <div className="px-3 py-2.5 border-b border-sidebar-border">
                <p className="font-mono text-[12px] font-semibold text-sidebar-fg-hover truncate">{displayName}</p>
                {email && (
                    <p className="font-mono text-[10px] text-sidebar-label truncate mt-0.5">{email}</p>
                )}
                {planName && (
                    <span className="inline-flex items-center mt-1.5 px-1.5 py-px rounded-sm font-mono text-[9px] uppercase tracking-[0.12em] bg-sidebar-bg-hover text-sidebar-label border border-sidebar-border">
                        {planName}
                    </span>
                )}
            </div>

            {/* Tenant switcher (only when multiple tenants) */}
            {hasMultipleTenants && (
                <div className="py-1 border-b border-sidebar-border">
                    <p className={`px-3 pt-1.5 pb-1 font-mono ${APP_SIZES.nav.sectionLabel} text-sidebar-label`}>
                        Cambiar cuenta
                    </p>
                    <ul>
                        {allTenants.map((t) => {
                            const isSelected = t.tenantId === activeTenantId;
                            return (
                                <li key={t.tenantId}>
                                    <button
                                        role="menuitemradio"
                                        aria-checked={isSelected}
                                        onClick={() => onSwitchTenant(t.tenantId)}
                                        className={[
                                            "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors duration-100",
                                            `font-mono ${APP_SIZES.nav.companyName}`,
                                            isSelected ? "text-sidebar-active-fg bg-sidebar-active-bg" : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                        ].join(" ")}
                                    >
                                        <span className="w-5 h-5 rounded-md bg-primary-500/10 border border-primary-500/20 flex items-center justify-center overflow-hidden shrink-0">
                                            {t.tenantAvatarUrl ? (
                                                <Image src={t.tenantAvatarUrl} alt="" width={20} height={20} unoptimized className="object-cover" />
                                            ) : (
                                                <span className="font-mono text-[10px] font-bold text-primary-500 uppercase">
                                                    {t.tenantEmail[0] ?? "?"}
                                                </span>
                                            )}
                                        </span>
                                        <span className="truncate flex-1">{t.isOwn ? "Mi cuenta" : t.tenantEmail}</span>
                                        {!t.isOwn && (
                                            <span className={`font-mono ${APP_SIZES.nav.sectionLabel} px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400 uppercase shrink-0`}>
                                                {t.role}
                                            </span>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* Actions */}
            <div className="py-1">
                <button
                    role="menuitem"
                    onClick={onProfileClick}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-100 font-mono text-[12px] text-sidebar-fg hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover"
                >
                    <span className="w-4 h-4 flex items-center justify-center text-sidebar-label">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="8" cy="5.5" r="2.5" />
                            <path d="M2.5 13.5c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" />
                        </svg>
                    </span>
                    Mi perfil
                </button>
                <button
                    role="menuitem"
                    onClick={onSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-100 font-mono text-[12px] text-sidebar-fg hover:text-red-500 hover:bg-red-500/5"
                >
                    <span className="w-4 h-4 flex items-center justify-center">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M11 11l3-3-3-3M14 8H7" />
                        </svg>
                    </span>
                    Cerrar sesión
                </button>
            </div>
        </div>
    );
}

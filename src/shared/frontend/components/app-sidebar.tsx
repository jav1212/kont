"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_MODULES } from "@/src/shared/frontend/navigation";
import { useAuth }     from "@/src/modules/auth/frontend/hooks/use-auth";
import { useTheme }    from "@/src/shared/frontend/components/theme-provider";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useModuleAccess } from "@/src/modules/billing/frontend/hooks/use-module-access";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { useIsDesktop } from "@/src/shared/frontend/hooks/use-is-desktop";
import { PWAInstallButton } from "@/src/shared/frontend/components/pwa-install-button";
import { TenantSwitcher } from "@/src/modules/memberships/frontend/components/tenant-switcher";
import { LogoFull } from "@/src/shared/frontend/components/logo";

// ── Module icons ──────────────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, React.ReactNode> = {
    payroll: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="1" y="1" width="11" height="11" rx="1.5" />
            <path d="M4 5h5M4 7.5h3" />
        </svg>
    ),
    employees: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="6.5" cy="4" r="2.5" />
            <path d="M1.5 12c0-2.8 2.2-5 5-5s5 2.2 5 5" />
        </svg>
    ),
    companies: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="1" y="4" width="11" height="8" rx="1" />
            <path d="M4 4V2.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5V4" />
            <path d="M5 8h3M6.5 6.5v3" />
        </svg>
    ),
    inventory: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 4l5.5-3 5.5 3v5l-5.5 3L1 9V4z" />
            <path d="M6.5 1v11M1 4l5.5 3 5.5-3" />
        </svg>
    ),
    billing: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="1" y="3" width="11" height="7" rx="1" />
            <path d="M1 6h11M4.5 8.5h2" />
        </svg>
    ),
    documents: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 1h5l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" />
            <path d="M8 1v3h3M5 7h3M5 9.5h2" />
        </svg>
    ),
};

// ── Sub-navigation per module ─────────────────────────────────────────────────

const MODULE_SUBNAV: Record<string, { href: string; label: string; group?: string | null }[]> = {
    payroll: [
        { href: "/payroll",               label: "Calculadora"   },
        { href: "/payroll/history",        label: "Historial"     },
        { href: "/payroll/vacaciones",     label: "Vacaciones"    },
        { href: "/payroll/utilidades",     label: "Utilidades"    },
        { href: "/payroll/prestaciones",   label: "Prestaciones"  },
        { href: "/payroll/liquidaciones",  label: "Liquidaciones" },
    ],
    inventory: [
        { href: "/inventory", label: "Dashboard", group: null },

        { href: "/inventory/productos",         label: "Productos",     group: "Catálogos" },
        { href: "/inventory/proveedores",       label: "Proveedores",   group: "Catálogos" },
        { href: "/inventory/departamentos",     label: "Departamentos", group: "Catálogos" },

        { href: "/inventory/entradas",            label: "Entradas",      group: "Operaciones" },
        { href: "/inventory/salidas",           label: "Salidas",       group: "Operaciones" },
        { href: "/inventory/ajustes",           label: "Ajustes",       group: "Operaciones" },
        { href: "/inventory/devoluciones",      label: "Devoluciones",  group: "Operaciones" },
        { href: "/inventory/autoconsumo",       label: "Autoconsumo",   group: "Operaciones" },
        { href: "/inventory/produccion",        label: "Producción",    group: "Operaciones" },

        { href: "/inventory/kardex",            label: "Kardex",                group: "Reportes" },
        { href: "/inventory/libro-entradas",    label: "Libro de Entradas",     group: "Reportes" },
        { href: "/inventory/libro-salidas",     label: "Libro de Salidas",      group: "Reportes" },
        { href: "/inventory/libro-inventarios", label: "Libro de Inventarios", group: "Reportes" },
        { href: "/inventory/reporte",           label: "Reporte Período",      group: "Reportes" },
        { href: "/inventory/reporte-saldo",     label: "Reporte SALDO",        group: "Reportes" },
        { href: "/inventory/reporte-islr",      label: "Reporte ISLR 177",     group: "Reportes" },
    ],
};

// ── Sun / Moon icons ──────────────────────────────────────────────────────────

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

// ── Chevron icon ──────────────────────────────────────────────────────────────

const ChevronIcon = ({ open }: { open: boolean }) => (
    <svg
        width="10" height="10" viewBox="0 0 10 10" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true"
        className={`flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : "rotate-0"}`}
    >
        <path d="M2 4l3 3 3-3" />
    </svg>
);

// ── Sidebar nav item base classes ─────────────────────────────────────────────
// Shared so hover/focus states stay consistent across Link and button elements.

const NAV_ITEM_BASE =
    `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 font-mono ${APP_SIZES.nav.item} border`;

const NAV_ITEM_IDLE =
    "text-sidebar-fg border-transparent hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border";

const NAV_ITEM_ACTIVE =
    "text-sidebar-active-fg bg-sidebar-active-bg border-sidebar-active-border";

// ============================================================================
// COMPONENT
// ============================================================================

interface AppSidebarProps {
    open: boolean;
    onClose: () => void;
}

const MIN_WIDTH = 160;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 208; // xl:w-52

export function AppSidebar({ open, onClose }: AppSidebarProps) {
    const pathname         = usePathname();
    const router           = useRouter();
    const { signOut }      = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { companies, company, companyId, selectCompany, loading: companyLoading } = useCompany();
    const [companyOpen,   setCompanyOpen]   = useState(false);
    const [companySearch, setCompanySearch] = useState("");
    const { hasAccess: hasInventory } = useModuleAccess("inventory");
    const { activeTenantRole } = useActiveTenantContext();
    const companyDropdownRef = useRef<HTMLDivElement>(null);
    const isDesktop = useIsDesktop();

    // ── Resizable sidebar (desktop only) ──────────────────────────────────────
    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
    const isResizing    = useRef(false);
    const startX        = useRef(0);
    const startWidth    = useRef(DEFAULT_WIDTH);
    const widthRef      = useRef(DEFAULT_WIDTH);

    useEffect(() => {
        const saved = localStorage.getItem("sidebar-width");
        if (saved) {
            const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(saved, 10)));
            setSidebarWidth(w);
            widthRef.current = w;
        }
    }, []);

    useEffect(() => { widthRef.current = sidebarWidth; }, [sidebarWidth]);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current  = true;
        startX.current      = e.clientX;
        startWidth.current  = widthRef.current;
        document.body.style.cursor     = "col-resize";
        document.body.style.userSelect = "none";
    }, []);

    useEffect(() => {
        function onMouseMove(e: MouseEvent) {
            if (!isResizing.current) return;
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + (e.clientX - startX.current)));
            setSidebarWidth(newWidth);
        }
        function onMouseUp() {
            if (!isResizing.current) return;
            isResizing.current             = false;
            document.body.style.cursor     = "";
            document.body.style.userSelect = "";
            localStorage.setItem("sidebar-width", String(widthRef.current));
        }
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

    // Close drawer on route change (mobile navigation)
    useEffect(() => {
        onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    // Close company dropdown when clicking outside
    useEffect(() => {
        if (!companyOpen) return;
        function handleOutsideClick(e: MouseEvent) {
            if (companyDropdownRef.current && !companyDropdownRef.current.contains(e.target as Node)) {
                setCompanyOpen(false);
                setCompanySearch("");
            }
        }
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [companyOpen]);

    // Close company dropdown on Escape
    useEffect(() => {
        if (!companyOpen) return;
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") { setCompanyOpen(false); setCompanySearch(""); }
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [companyOpen]);

    async function handleSignOut() {
        await signOut();
        router.replace("/sign-in");
    }

    return (
        <aside
            aria-label="Navegación principal"
            style={isDesktop ? { width: sidebarWidth } : undefined}
            className={[
                "flex-shrink-0 flex flex-col bg-sidebar-bg border-r border-sidebar-border",
                // Mobile/tablet: fixed drawer deslizable desde la izquierda
                "fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-300 ease-in-out",
                open ? "translate-x-0" : "-translate-x-full",
                // Desktop (xl+): en flujo, relative para contener el resize handle
                "xl:relative xl:inset-auto xl:z-auto xl:w-52 xl:translate-x-0 xl:transition-none",
            ].join(" ")}
        >

            {/* ── Logo ──────────────────────────────────────────────────── */}
            <div className="px-5 py-[18px] border-b border-sidebar-border">
                <LogoFull size={24} className="text-sidebar-fg" />
            </div>

            {/* ── Tenant switcher (solo visible si hay más de un tenant) ── */}
            <TenantSwitcher />

            {/* ── Company selector ──────────────────────────────────────── */}
            <div className="px-3 py-3 border-b border-sidebar-border overflow-visible">
                <p className={`px-2 mb-1.5 font-mono ${APP_SIZES.nav.sectionLabel} uppercase text-sidebar-label`}>
                    Empresa
                </p>

                {companyLoading ? (
                    <div className="px-2 py-1.5">
                        <div className="h-3 rounded bg-foreground/[0.06] animate-pulse w-3/4" />
                    </div>
                ) : companies.length === 0 ? (
                    <p className={`px-2 font-mono ${APP_SIZES.nav.companyName} text-sidebar-label`}>
                        Sin empresas
                    </p>
                ) : companies.length === 1 ? (
                    <div className="px-2 py-1.5 flex items-center gap-2">
                        <CompanyAvatar name={company?.name} />
                        <span className={`font-mono ${APP_SIZES.nav.companyName} truncate text-sidebar-fg`}>
                            {company?.name}
                        </span>
                    </div>
                ) : (
                    <div className="relative" ref={companyDropdownRef}>
                        <button
                            onClick={() => setCompanyOpen((v) => !v)}
                            aria-expanded={companyOpen}
                            aria-haspopup="listbox"
                            aria-label={`Empresa seleccionada: ${company?.name ?? "Ninguna"}. Cambiar empresa`}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors duration-150 text-sidebar-fg hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
                        >
                            <CompanyAvatar name={company?.name} />
                            <span className={`font-mono ${APP_SIZES.nav.companyName} truncate flex-1 text-left`}>
                                {company?.name ?? "Seleccionar…"}
                            </span>
                            <ChevronIcon open={companyOpen} />
                        </button>

                        {companyOpen && (
                            <div className="absolute left-0 right-0 top-full mt-1 rounded-lg z-50 shadow-lg bg-sidebar-bg border border-sidebar-border overflow-hidden">
                                {/* Search */}
                                <div className="p-2 border-b border-sidebar-border">
                                    <input
                                        type="text"
                                        value={companySearch}
                                        onChange={(e) => setCompanySearch(e.target.value)}
                                        placeholder="Buscar empresa…"
                                        autoFocus
                                        className={`w-full px-2 py-1.5 rounded-md bg-sidebar-bg-hover font-mono ${APP_SIZES.nav.companyName} text-sidebar-fg placeholder:text-sidebar-fg/40 focus:outline-none`}
                                    />
                                </div>
                                <ul
                                    role="listbox"
                                    aria-label="Empresas disponibles"
                                    className="max-h-48 overflow-y-auto"
                                >
                                    {companies
                                        .filter((c) => c.name.toLowerCase().includes(companySearch.toLowerCase()))
                                        .map((c) => {
                                            const isSelected = c.id === companyId;
                                            return (
                                                <li key={c.id} role="option" aria-selected={isSelected}>
                                                    <button
                                                        onClick={() => { selectCompany(c.id); setCompanyOpen(false); setCompanySearch(""); }}
                                                        className={[
                                                            `w-full flex items-center gap-2 px-3 py-2 transition-colors duration-100 font-mono ${APP_SIZES.nav.companyName} text-left`,
                                                            isSelected
                                                                ? "text-sidebar-active-fg bg-sidebar-active-bg"
                                                                : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                                        ].join(" ")}
                                                    >
                                                        <CompanyAvatar name={c.name} />
                                                        <span className="truncate">{c.name}</span>
                                                        {isSelected && (
                                                            <svg className="ml-auto flex-shrink-0" width="10" height="10" viewBox="0 0 10 10"
                                                                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                                <path d="M2 5.5l2.5 2.5 4-5" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Module nav ────────────────────────────────────────────── */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Módulos">
                <p className={`px-2 mb-3 font-mono ${APP_SIZES.nav.sectionLabel} uppercase text-sidebar-label`}>
                    Módulos
                </p>

                {APP_MODULES.filter((mod) => {
                    if (mod.id === "inventory" && !hasInventory) return false;
                    if (mod.desktopOnly && !isDesktop) return false;
                    return true;
                }).map((mod) => {
                    const subnav = MODULE_SUBNAV[mod.id];
                    const subnavOpen = subnav && pathname.startsWith(mod.href);

                    // Module link is active only when on the exact module root — when the
                    // sub-nav is expanded, child items own the active state.
                    const isActive = !subnavOpen && (
                        pathname === mod.href ||
                        pathname.startsWith(mod.href + "/")
                    );

                    return (
                        <div key={mod.id}>
                            <Link
                                href={mod.href}
                                aria-current={isActive ? "page" : undefined}
                                className={[NAV_ITEM_BASE, isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE].join(" ")}
                            >
                                {MODULE_ICONS[mod.id]}
                                {mod.label}
                            </Link>

                            {/* Sub-nav */}
                            {subnavOpen && (
                                <div
                                    className="pl-4 mt-0.5 ml-[1.125rem] border-l border-sidebar-border"
                                >
                                    {(() => {
                                        const seenGroups = new Set<string>();
                                        return subnav.map(({ href, label, group }) => {
                                            const subActive = pathname === href;
                                            const showGroupHeader = group && !seenGroups.has(group) && (() => { seenGroups.add(group); return true; })();
                                            return (
                                                <div key={href}>
                                                    {showGroupHeader && (
                                                        <p className={`px-2 pt-2 pb-0.5 font-mono ${APP_SIZES.nav.group} uppercase text-sidebar-label`}>
                                                            {group}
                                                        </p>
                                                    )}
                                                    <Link
                                                        href={href}
                                                        aria-current={subActive ? "page" : undefined}
                                                        className={[
                                                            `flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors duration-150 font-mono ${APP_SIZES.nav.subItem}`,
                                                            subActive
                                                                ? "text-sidebar-active-fg bg-sidebar-active-bg"
                                                                : "text-sidebar-label hover:text-sidebar-fg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border",
                                                        ].join(" ")}
                                                    >
                                                        <div
                                                            aria-hidden="true"
                                                            className={[
                                                                "w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-150",
                                                                subActive ? "bg-sidebar-active-fg shadow-[0_0_6px_var(--sidebar-active-fg)]" : "bg-sidebar-border",
                                                            ].join(" ")}
                                                        />
                                                        {label}
                                                    </Link>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            {/* ── Bottom actions ─────────────────────────────────────────── */}
            <div className="px-3 py-4 space-y-1 border-t border-sidebar-border">

                {/* Members settings — hidden only for contables acting on behalf */}
                {activeTenantRole !== "contable" && (
                    <Link
                        href="/settings/members"
                        aria-current={pathname.startsWith("/settings/members") ? "page" : undefined}
                        className={[
                            NAV_ITEM_BASE,
                            pathname.startsWith("/settings/members") ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE,
                        ].join(" ")}
                    >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="5" cy="4" r="2.5" />
                            <path d="M1 11c0-2.2 1.8-4 4-4s4 1.8 4 4" />
                            <path d="M10 5v4M12 7H8" />
                        </svg>
                        Miembros
                    </Link>
                )}

                {/* PWA install */}
                <PWAInstallButton navItemBase={NAV_ITEM_BASE} navItemIdle={NAV_ITEM_IDLE} />

                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                    className={[NAV_ITEM_BASE, NAV_ITEM_IDLE].join(" ")}
                >
                    {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                    {theme === "dark" ? "Modo claro" : "Modo oscuro"}
                </button>

                {/* Sign out */}
                <button
                    onClick={handleSignOut}
                    aria-label="Cerrar sesión"
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 font-mono ${APP_SIZES.nav.item} border border-transparent text-sidebar-fg hover:text-red-500 hover:bg-red-500/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40`}
                >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M9 9l3-3-3-3M12 6.5H5" />
                    </svg>
                    Cerrar sesión
                </button>
            </div>

            {/* ── Resize handle (desktop only) ────────────────────────── */}
            {isDesktop && (
                <div
                    aria-hidden="true"
                    onMouseDown={handleResizeStart}
                    className="absolute inset-y-0 right-0 w-1 cursor-col-resize group z-10"
                >
                    <div className="absolute inset-y-0 right-0 w-px bg-sidebar-border transition-colors duration-150 group-hover:bg-primary-500/50 group-active:bg-primary-500" />
                </div>
            )}
        </aside>
    );
}

// ── Shared sub-component ──────────────────────────────────────────────────────

function CompanyAvatar({ name }: { name?: string }) {
    return (
        <div
            aria-hidden="true"
            className="w-5 h-5 rounded-md bg-primary-500/20 flex items-center justify-center flex-shrink-0"
        >
            <span className={`font-mono ${APP_SIZES.nav.companyAvatar} font-bold text-primary-400 uppercase`}>
                {name?.[0] ?? "?"}
            </span>
        </div>
    );
}

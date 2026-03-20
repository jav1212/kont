"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { APP_MODULES } from "@/src/shared/frontend/navigation";
import { useAuth }     from "@/src/modules/auth/frontend/hooks/use-auth";
import { useTheme }    from "@/src/shared/frontend/components/theme-provider";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useModuleAccess } from "@/src/modules/billing/frontend/hooks/use-module-access";

// ── Module icons ──────────────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, React.ReactNode> = {
    payroll: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="11" height="11" rx="1.5" />
            <path d="M4 5h5M4 7.5h3" />
        </svg>
    ),
    companies: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="11" height="8" rx="1" />
            <path d="M4 4V2.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5V4" />
            <path d="M5 8h3M6.5 6.5v3" />
        </svg>
    ),
    inventory: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4l5.5-3 5.5 3v5l-5.5 3L1 9V4z" />
            <path d="M6.5 1v11M1 4l5.5 3 5.5-3" />
        </svg>
    ),
    billing: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="11" height="7" rx="1" />
            <path d="M1 6h11M4.5 8.5h2" />
        </svg>
    ),
};

// ── Sub-navigation per module ─────────────────────────────────────────────────

const MODULE_SUBNAV: Record<string, { href: string; label: string }[]> = {
    payroll: [
        { href: "/payroll",                   label: "Calculadora"   },
        { href: "/payroll/employees",         label: "Empleados"     },
        { href: "/payroll/history",           label: "Historial"     },
        { href: "/payroll/vacaciones",        label: "Vacaciones"    },
        { href: "/payroll/utilidades",        label: "Utilidades"    },
        { href: "/payroll/prestaciones",      label: "Prestaciones"  },
        { href: "/payroll/liquidaciones",     label: "Liquidaciones" },
    ],
};

// ── Sun / Moon icons ──────────────────────────────────────────────────────────

const SunIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6.5" cy="6.5" r="2.5" />
        <path d="M6.5 1v1M6.5 11v1M1 6.5h1M11 6.5h1M2.9 2.9l.7.7M9.4 9.4l.7.7M2.9 10.1l.7-.7M9.4 3.6l.7-.7" />
    </svg>
);

const MoonIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 7.5A5 5 0 0 1 5.5 2a5 5 0 1 0 5.5 5.5z" />
    </svg>
);

// ============================================================================
// COMPONENT
// ============================================================================

export function AppSidebar() {
    const pathname         = usePathname();
    const router           = useRouter();
    const { signOut }      = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { companies, company, companyId, selectCompany, loading: companyLoading } = useCompany();
    const [companyOpen, setCompanyOpen] = useState(false);
    const { hasAccess: hasInventory } = useModuleAccess("inventory");

    async function handleSignOut() {
        await signOut();
        router.replace("/sign-in");
    }

    return (
        <aside className="w-52 h-full flex-shrink-0 flex flex-col"
            style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)" }}
        >

            {/* ── Logo ──────────────────────────────────────────────────── */}
            <div className="px-5 py-5" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-[5px] flex items-center justify-center flex-shrink-0"
                        style={{ background: "var(--primary-500)" }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <rect x="1" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.95" />
                            <rect x="8" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.38" />
                            <rect x="1" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.38" />
                            <rect x="8" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.95" />
                        </svg>
                    </div>
                    <div className="flex flex-col gap-0">
                        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.20em]"
                            style={{ color: "var(--sidebar-fg-hover)" }}>
                            Kont
                        </span>
                        <span className="font-mono text-[8px] uppercase tracking-[0.18em]"
                            style={{ color: "var(--sidebar-label)" }}>
                            Nómina
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Company selector ──────────────────────────────────────── */}
            <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
                <p className="px-2 mb-1.5 font-mono text-[9px] uppercase tracking-[0.24em]"
                    style={{ color: "var(--sidebar-label)" }}>
                    Empresa
                </p>

                {companyLoading ? (
                    <div className="px-2 py-1.5">
                        <div className="h-3 rounded bg-foreground/[0.06] animate-pulse w-3/4" />
                    </div>
                ) : companies.length === 0 ? (
                    <p className="px-2 font-mono text-[10px]" style={{ color: "var(--sidebar-label)" }}>
                        Sin empresas
                    </p>
                ) : companies.length === 1 ? (
                    <div className="px-2 py-1.5 flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="font-mono text-[9px] font-bold text-primary-400 uppercase">
                                {company?.name?.[0] ?? "?"}
                            </span>
                        </div>
                        <span className="font-mono text-[11px] truncate" style={{ color: "var(--sidebar-fg)" }}>
                            {company?.name}
                        </span>
                    </div>
                ) : (
                    <div className="relative">
                        <button
                            onClick={() => setCompanyOpen((v) => !v)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors duration-150"
                            style={{ color: "var(--sidebar-fg)" }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.background = "var(--sidebar-bg-hover)";
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.background = "";
                            }}
                        >
                            <div className="w-5 h-5 rounded-md bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                                <span className="font-mono text-[9px] font-bold text-primary-400 uppercase">
                                    {company?.name?.[0] ?? "?"}
                                </span>
                            </div>
                            <span className="font-mono text-[11px] truncate flex-1 text-left">
                                {company?.name ?? "Seleccionar…"}
                            </span>
                            <svg
                                width="10" height="10" viewBox="0 0 10 10" fill="none"
                                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                                style={{
                                    flexShrink: 0,
                                    transform: companyOpen ? "rotate(180deg)" : "rotate(0deg)",
                                    transition: "transform 150ms",
                                }}
                            >
                                <path d="M2 4l3 3 3-3" />
                            </svg>
                        </button>

                        {companyOpen && (
                            <div
                                className="absolute left-0 right-0 top-full mt-1 rounded-lg overflow-hidden z-50 shadow-lg"
                                style={{
                                    background:  "var(--sidebar-bg)",
                                    border:      "1px solid var(--sidebar-border)",
                                    boxShadow:   "var(--shadow-lg)",
                                }}
                            >
                                {companies.map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => { selectCompany(c.id); setCompanyOpen(false); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 transition-colors duration-100 font-mono text-[11px] text-left"
                                        style={{
                                            color:      c.id === companyId ? "var(--sidebar-active-fg)" : "var(--sidebar-fg)",
                                            background: c.id === companyId ? "var(--sidebar-active-bg)" : "",
                                        }}
                                        onMouseEnter={(e) => {
                                            if (c.id !== companyId)
                                                (e.currentTarget as HTMLElement).style.background = "var(--sidebar-bg-hover)";
                                        }}
                                        onMouseLeave={(e) => {
                                            if (c.id !== companyId)
                                                (e.currentTarget as HTMLElement).style.background = "";
                                        }}
                                    >
                                        <div className="w-5 h-5 rounded-md bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                                            <span className="font-mono text-[9px] font-bold text-primary-400 uppercase">
                                                {c.name[0]}
                                            </span>
                                        </div>
                                        <span className="truncate">{c.name}</span>
                                        {c.id === companyId && (
                                            <svg className="ml-auto flex-shrink-0" width="10" height="10" viewBox="0 0 10 10"
                                                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M2 5.5l2.5 2.5 4-5" />
                                            </svg>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Module nav ────────────────────────────────────────────── */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                <p className="px-2 mb-3 font-mono text-[9px] uppercase tracking-[0.24em]"
                    style={{ color: "var(--sidebar-label)" }}>
                    Módulos
                </p>

                {APP_MODULES.filter((mod) =>
                    mod.id !== "inventory" || hasInventory
                ).map((mod) => {
                    const subnav   = MODULE_SUBNAV[mod.id];
                    const isActive = pathname === mod.href ||
                        (pathname.startsWith(mod.href + "/") && !subnav?.some(s => s.href !== mod.href && pathname === s.href));

                    return (
                        <div key={mod.id}>
                            <Link
                                href={mod.href}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 font-mono text-[11px] uppercase tracking-[0.14em] border"
                                style={isActive ? {
                                    background:   "var(--sidebar-active-bg)",
                                    color:        "var(--sidebar-active-fg)",
                                    borderColor:  "var(--sidebar-active-border)",
                                } : {
                                    color:       "var(--sidebar-fg)",
                                    borderColor: "transparent",
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) {
                                        (e.currentTarget as HTMLElement).style.color      = "var(--sidebar-fg-hover)";
                                        (e.currentTarget as HTMLElement).style.background = "var(--sidebar-bg-hover)";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) {
                                        (e.currentTarget as HTMLElement).style.color      = "var(--sidebar-fg)";
                                        (e.currentTarget as HTMLElement).style.background = "";
                                    }
                                }}
                            >
                                {MODULE_ICONS[mod.id]}
                                {mod.label}
                            </Link>

                            {/* Sub-nav */}
                            {subnav && pathname.startsWith(mod.href) && (
                                <div className="pl-4 mt-0.5 space-y-px"
                                    style={{ borderLeft: "1px solid var(--sidebar-border)", marginLeft: "1.125rem" }}
                                >
                                    {subnav.map(({ href, label }) => {
                                        const subActive = pathname === href;
                                        return (
                                            <Link
                                                key={href}
                                                href={href}
                                                className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors duration-150 font-mono text-[10px] uppercase tracking-[0.14em]"
                                                style={subActive ? {
                                                    color:      "var(--sidebar-active-fg)",
                                                    background: "var(--sidebar-active-bg)",
                                                } : {
                                                    color: "var(--sidebar-label)",
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!subActive) (e.currentTarget as HTMLElement).style.color = "var(--sidebar-fg-hover)";
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!subActive) (e.currentTarget as HTMLElement).style.color = "var(--sidebar-label)";
                                                }}
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-150"
                                                    style={{
                                                        background: subActive ? "var(--sidebar-active-fg)" : "var(--sidebar-border)",
                                                        boxShadow: subActive ? "0 0 6px var(--sidebar-active-fg)" : "none",
                                                    }}
                                                />
                                                {label}
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            {/* ── Bottom actions ─────────────────────────────────────────── */}
            <div className="px-3 py-4 space-y-1" style={{ borderTop: "1px solid var(--sidebar-border)" }}>

                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 font-mono text-[11px] uppercase tracking-[0.14em] border border-transparent"
                    style={{ color: "var(--sidebar-fg)" }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color      = "var(--sidebar-fg-hover)";
                        (e.currentTarget as HTMLElement).style.background = "var(--sidebar-bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color      = "var(--sidebar-fg)";
                        (e.currentTarget as HTMLElement).style.background = "";
                    }}
                >
                    {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                    {theme === "dark" ? "Modo claro" : "Modo oscuro"}
                </button>

                {/* Sign out */}
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 font-mono text-[11px] uppercase tracking-[0.14em] border border-transparent"
                    style={{ color: "var(--sidebar-fg)" }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color      = "#f87171";
                        (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.06)";
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color      = "var(--sidebar-fg)";
                        (e.currentTarget as HTMLElement).style.background = "";
                    }}
                >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M9 9l3-3-3-3M12 6.5H5" />
                    </svg>
                    Salir
                </button>
            </div>

        </aside>
    );
}

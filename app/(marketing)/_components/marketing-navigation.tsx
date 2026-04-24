"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { LogoFull } from "@/src/shared/frontend/components/logo";
import { BcvPill, useBcvRate, useScrolled } from "@/src/shared/frontend/components/bcv-pill";

// ----------------------------------------------------------------------------
// Marketing header — shown on /herramientas/* (tools surfaces).
//
// Same visual language as PublicHeader: scroll-aware surface, mono-uppercase
// chrome, orange primary CTA, hamburger drawer on mobile, live BCV pill.
//
// The key difference vs PublicHeader is the nav payload: here the user is
// already inside the tools section, so we show the tool tabs inline (not a
// dropdown). Active-tab gets a filled foreground plate — a literal "you are
// here" anchor. This mirrors the app-side sidebar's active-item treatment.
// ----------------------------------------------------------------------------

const TOOLS = [
    { href: "/herramientas/divisas",           label: "Divisas BCV"        },
    { href: "/herramientas/calendario-seniat", label: "Calendario SENIAT"  },
    { href: "/herramientas/status",            label: "Estatus portales"   },
];

export function MarketingHeader() {
    const pathname   = usePathname() ?? "";
    const scrolled   = useScrolled();
    const bcv        = useBcvRate();
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        if (!mobileOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [mobileOpen]);

    const chromeLink =
        "font-mono text-[12px] uppercase tracking-[0.14em] font-semibold text-text-secondary hover:text-foreground transition-colors";

    return (
        <>
            <header
                style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
                className={[
                    "sticky top-0 z-40 flex items-center justify-between gap-4 px-6 sm:px-8 pb-3",
                    "border-b transition-[background-color,border-color,box-shadow] duration-200",
                    scrolled
                        ? "bg-background/85 backdrop-blur-md border-border-default shadow-sm"
                        : "bg-background/40 backdrop-blur-sm border-transparent",
                ].join(" ")}
            >
                {/* ── Left: logo + tool tabs ────────────────────────────── */}
                <div className="flex items-center gap-6 min-w-0">
                    <Link
                        href="/"
                        aria-label="Ir al inicio de Kontave"
                        className="shrink-0 hover:opacity-80 transition-opacity"
                    >
                        <LogoFull size={32} className="text-foreground" />
                    </Link>

                    <span
                        aria-hidden
                        className="hidden md:inline-block w-px h-6 bg-border-light"
                    />

                    <nav className="hidden md:flex items-center gap-1" aria-label="Herramientas">
                        {TOOLS.map((t) => {
                            const active = pathname.startsWith(t.href);
                            return (
                                <Link
                                    key={t.href}
                                    href={t.href}
                                    aria-current={active ? "page" : undefined}
                                    className={[
                                        "inline-flex items-center h-9 px-3 rounded-lg",
                                        "font-mono text-[12px] uppercase tracking-[0.14em] font-semibold transition-colors",
                                        active
                                            ? "bg-foreground text-background"
                                            : "text-text-secondary hover:text-foreground hover:bg-surface-2",
                                    ].join(" ")}
                                >
                                    {t.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* ── Right: BCV pill + auth actions ───────────────────── */}
                <div className="flex items-center gap-2 sm:gap-3">
                    {bcv && <BcvPill data={bcv} className="hidden lg:inline-flex" />}

                    <Link
                        href="/sign-in"
                        className={`${chromeLink} hidden sm:inline-flex items-center h-9 px-3 rounded-lg hover:bg-surface-2`}
                    >
                        Ingresar
                    </Link>

                    <Link
                        href="/sign-up"
                        className="inline-flex items-center justify-center h-10 px-5 rounded-full bg-primary-500 text-white font-mono text-[12px] uppercase tracking-[0.14em] font-bold hover:bg-primary-600 active:bg-primary-700 transition-colors shadow-sm shadow-primary-500/30"
                    >
                        Crear cuenta
                    </Link>

                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        aria-label="Abrir menú"
                        aria-expanded={mobileOpen}
                        aria-controls="marketing-mobile-drawer"
                        className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-border-default bg-surface-1 text-foreground hover:bg-surface-2 transition-colors"
                    >
                        <Menu className="w-[18px] h-[18px]" strokeWidth={2} />
                    </button>
                </div>
            </header>

            {/* ── Mobile drawer ────────────────────────────────────────── */}
            {mobileOpen && (
                <div
                    id="marketing-mobile-drawer"
                    className="fixed inset-0 z-50 md:hidden"
                    role="dialog"
                    aria-modal="true"
                >
                    <button
                        type="button"
                        aria-label="Cerrar menú"
                        onClick={() => setMobileOpen(false)}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />
                    <div
                        style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
                        className="absolute right-0 top-0 bottom-0 w-full max-w-[340px] bg-surface-1 border-l border-border-default shadow-2xl flex flex-col px-6 pb-6 overflow-y-auto"
                    >
                        <div className="flex items-center justify-between mb-8">
                            <LogoFull size={28} className="text-foreground" />
                            <button
                                type="button"
                                onClick={() => setMobileOpen(false)}
                                aria-label="Cerrar menú"
                                className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-border-default text-foreground hover:bg-surface-2 transition-colors"
                            >
                                <X className="w-[18px] h-[18px]" strokeWidth={2} />
                            </button>
                        </div>

                        {bcv && <BcvPill data={bcv} className="self-start mb-8" />}

                        <div className="flex flex-col">
                            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-semibold mb-1">
                                Herramientas
                            </p>
                            {TOOLS.map((t) => {
                                const active = pathname.startsWith(t.href);
                                return (
                                    <Link
                                        key={t.href}
                                        href={t.href}
                                        onClick={() => setMobileOpen(false)}
                                        aria-current={active ? "page" : undefined}
                                        className={[
                                            "py-3 flex items-center justify-between border-b border-border-light",
                                            active ? "text-primary-500" : "text-foreground",
                                        ].join(" ")}
                                    >
                                        <span className="font-mono text-[13px] uppercase tracking-[0.12em] font-bold">
                                            {t.label}
                                        </span>
                                        <span className="font-mono text-[13px] text-text-tertiary">
                                            {active ? "●" : "→"}
                                        </span>
                                    </Link>
                                );
                            })}

                            <Link
                                href="/#planes"
                                onClick={() => setMobileOpen(false)}
                                className="py-3 flex items-center justify-between border-b border-border-light mt-7"
                            >
                                <span className="font-mono text-[13px] uppercase tracking-[0.12em] font-bold text-foreground">
                                    Precios
                                </span>
                                <span className="font-mono text-[13px] text-text-tertiary">→</span>
                            </Link>
                        </div>

                        <div className="mt-auto flex flex-col gap-3 pt-10">
                            <Link
                                href="/sign-in"
                                onClick={() => setMobileOpen(false)}
                                className="flex items-center justify-center h-11 rounded-full border border-border-default bg-surface-1 text-foreground font-mono text-[12px] uppercase tracking-[0.14em] font-bold hover:bg-surface-2 transition-colors"
                            >
                                Ingresar
                            </Link>
                            <Link
                                href="/sign-up"
                                onClick={() => setMobileOpen(false)}
                                className="flex items-center justify-center h-11 rounded-full bg-primary-500 text-white font-mono text-[12px] uppercase tracking-[0.14em] font-bold hover:bg-primary-600 transition-colors shadow-sm shadow-primary-500/30"
                            >
                                Crear cuenta
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export function MarketingFooter() {
    return (
        <footer className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3 px-8 py-6 border-t border-foreground/[0.07] mt-auto">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                © {new Date().getFullYear()} Kontave · Hecho en Venezuela
            </span>
            <div className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-disabled)]">
                <Link href="/herramientas/divisas" className="hover:text-foreground transition-colors">Divisas</Link>
                <Link href="/herramientas/calendario-seniat" className="hover:text-foreground transition-colors">SENIAT</Link>
                <Link href="/herramientas/status" className="hover:text-foreground transition-colors">Estatus</Link>
                <Link href="/sign-up" className="hover:text-foreground transition-colors">Registrarse</Link>
                <Link href="/sign-in" className="hover:text-foreground transition-colors">Ingresar</Link>
            </div>
        </footer>
    );
}

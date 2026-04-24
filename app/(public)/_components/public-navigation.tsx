"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { LogoFull } from "@/src/shared/frontend/components/logo";
import { BcvPill, useBcvRate, useScrolled } from "@/src/shared/frontend/components/bcv-pill";

// ----------------------------------------------------------------------------
// Public navigation (header + footer) for unauthenticated routes.
//
// Design notes (konta-design):
//   - Chrome (nav items, CTA) uses Geist Mono UPPERCASE with tracking 0.14em.
//     Sans is reserved for helper/marketing prose, not chrome.
//   - Single orange accent owns the primary CTA. The previous foreground-black
//     pill was a visual dead-end — it did not read as "Konta action".
//   - Scroll-aware surface: at top the header is barely there (transparent
//     border, faint plate); on scroll it firms up with backdrop-blur,
//     `border-default`, and a resting `shadow-sm`. Same pattern a user will
//     see on the app-side toolbars.
//   - Live BCV pill (`BCV · 79,59 · 24 abr`) is the product's signature badge
//     — placing it in the landing header signals "this software actually
//     touches the BCV API" before the visitor reads a single paragraph.
//   - Hamburger + slide-over drawer for mobile so nav is reachable below sm.
// ----------------------------------------------------------------------------

const AUTH_ROUTES = [
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/accept-invite",
    "/resend-confirmation",
];

const TOOLS = [
    { href: "/herramientas/divisas",           label: "Divisas BCV",       hint: "Conversor con tasa oficial" },
    { href: "/herramientas/calendario-seniat", label: "Calendario SENIAT", hint: "IVA · ISLR · IGTF por RIF" },
    { href: "/herramientas/status",            label: "Estatus portales",  hint: "SENIAT · IVSS · INCES" },
];

export function PublicHeader() {
    const pathname = usePathname();
    const isAuthPage = AUTH_ROUTES.some(route => pathname?.startsWith(route));
    const scrolled = useScrolled();
    const bcv = useBcvRate();
    const [toolsOpen, setToolsOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const toolsRef = useRef<HTMLDivElement | null>(null);

    // Close the Herramientas dropdown on outside click or Escape.
    useEffect(() => {
        if (!toolsOpen) return;
        const onClick = (e: MouseEvent) => {
            if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
                setToolsOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setToolsOpen(false); };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [toolsOpen]);

    // Lock body scroll while the mobile drawer is open.
    useEffect(() => {
        if (!mobileOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [mobileOpen]);

    if (isAuthPage) return null;

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
                {/* ── Left: logo + desktop nav ──────────────────────────── */}
                <div className="flex items-center gap-7 min-w-0">
                    <Link
                        href="/"
                        className="shrink-0 hover:opacity-80 transition-opacity"
                        aria-label="Ir al inicio de Kontave"
                    >
                        <LogoFull size={32} className="text-foreground" />
                    </Link>

                    <nav className="hidden md:flex items-center gap-1 ml-2">
                        {/* Herramientas — dropdown */}
                        <div ref={toolsRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setToolsOpen(o => !o)}
                                aria-expanded={toolsOpen}
                                aria-haspopup="menu"
                                className={`${chromeLink} inline-flex items-center gap-1 h-9 px-3 rounded-lg hover:bg-surface-2 ${toolsOpen ? "bg-surface-2 text-foreground" : ""}`}
                            >
                                Herramientas
                                <ChevronDown
                                    className={`w-3.5 h-3.5 transition-transform ${toolsOpen ? "rotate-180" : ""}`}
                                    strokeWidth={2.2}
                                />
                            </button>

                            {toolsOpen && (
                                <div
                                    role="menu"
                                    className="absolute left-0 top-full mt-2 w-[320px] bg-surface-1 border border-border-default rounded-xl shadow-lg p-2 z-50"
                                >
                                    {TOOLS.map(tool => (
                                        <Link
                                            key={tool.href}
                                            href={tool.href}
                                            role="menuitem"
                                            onClick={() => setToolsOpen(false)}
                                            className="group flex items-center justify-between gap-4 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors"
                                        >
                                            <div className="min-w-0">
                                                <p className="font-mono text-[12px] uppercase tracking-[0.14em] font-bold text-foreground group-hover:text-primary-500 transition-colors">
                                                    {tool.label}
                                                </p>
                                                <p className="font-sans text-[12px] text-text-tertiary leading-tight mt-0.5">
                                                    {tool.hint}
                                                </p>
                                            </div>
                                            <span className="font-mono text-[14px] text-text-tertiary group-hover:text-primary-500 transition-colors">
                                                →
                                            </span>
                                        </Link>
                                    ))}
                                    <div className="mt-1 border-t border-border-light pt-1">
                                        <Link
                                            href="/herramientas"
                                            role="menuitem"
                                            onClick={() => setToolsOpen(false)}
                                            className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors"
                                        >
                                            <span className="font-mono text-[11px] uppercase tracking-[0.18em] font-semibold text-text-secondary">
                                                Ver todas
                                            </span>
                                            <span className="font-mono text-[13px] text-primary-500">→</span>
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Link
                            href="/#planes"
                            className={`${chromeLink} h-9 px-3 rounded-lg hover:bg-surface-2 inline-flex items-center`}
                        >
                            Precios
                        </Link>
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

                    {/* Mobile hamburger */}
                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        aria-label="Abrir menú"
                        aria-expanded={mobileOpen}
                        aria-controls="public-mobile-drawer"
                        className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-border-default bg-surface-1 text-foreground hover:bg-surface-2 transition-colors"
                    >
                        <Menu className="w-[18px] h-[18px]" strokeWidth={2} />
                    </button>
                </div>
            </header>

            {/* ── Mobile drawer ────────────────────────────────────────── */}
            {mobileOpen && (
                <div
                    id="public-mobile-drawer"
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
                                Producto
                            </p>
                            <Link
                                href="/#planes"
                                onClick={() => setMobileOpen(false)}
                                className="py-3 font-mono text-[14px] uppercase tracking-[0.12em] font-bold text-foreground border-b border-border-light"
                            >
                                Precios
                            </Link>

                            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-semibold mt-7 mb-1">
                                Herramientas
                            </p>
                            {TOOLS.map(tool => (
                                <Link
                                    key={tool.href}
                                    href={tool.href}
                                    onClick={() => setMobileOpen(false)}
                                    className="py-3 flex items-center justify-between gap-3 border-b border-border-light"
                                >
                                    <div>
                                        <p className="font-mono text-[13px] uppercase tracking-[0.12em] font-bold text-foreground">
                                            {tool.label}
                                        </p>
                                        <p className="font-sans text-[12px] text-text-tertiary leading-tight">
                                            {tool.hint}
                                        </p>
                                    </div>
                                    <span className="font-mono text-[13px] text-text-tertiary">→</span>
                                </Link>
                            ))}
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

export function PublicFooter() {
    const pathname = usePathname();
    const isAuthPage = AUTH_ROUTES.some(route => pathname?.startsWith(route));

    if (isAuthPage) return null;

    return (
        <footer className="relative z-10 flex items-center justify-between px-8 py-4 border-t border-foreground/[0.07] mt-auto">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                © {new Date().getFullYear()} Kontave
            </span>
        </footer>
    );
}

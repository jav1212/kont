"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoFull } from "@/src/shared/frontend/components/logo";

const AUTH_ROUTES = [
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/accept-invite"
];

export function PublicHeader() {
    const pathname = usePathname();
    const isAuthPage = AUTH_ROUTES.some(route => pathname?.startsWith(route));

    if (isAuthPage) return null;

    return (
        <header
            style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
            className="relative z-10 flex items-center justify-between px-6 sm:px-8 pb-4 border-b border-border-light bg-background/50 backdrop-blur-md sticky top-0">
            <Link href="/" className="hover:opacity-80 transition-opacity">
                <LogoFull size={40} className="text-foreground" />
            </Link>
            
            <div className="flex items-center gap-4 sm:gap-6">
                <Link href="/herramientas/divisas" className="text-[14px] font-bold text-text-secondary hover:text-foreground transition-colors hidden sm:inline-block">
                    Herramientas
                </Link>
                <Link href="/sign-in" className="text-[14px] font-bold text-text-secondary hover:text-foreground transition-colors hidden sm:inline-block">
                    Ingresar
                </Link>
                <Link href="/sign-up" className="flex items-center justify-center h-10 px-5 bg-foreground text-background rounded-full font-bold text-[13px] hover:bg-foreground/90 transition-colors shadow-sm">
                    Crear Cuenta
                </Link>
            </div>
        </header>
    );
}

export function PublicFooter() {
    const pathname = usePathname();
    const isAuthPage = AUTH_ROUTES.some(route => pathname?.startsWith(route));

    if (isAuthPage) return null;

    return (
        <footer className="relative z-10 flex items-center justify-between px-8 py-4 border-t border-foreground/[0.07] mt-auto">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                © {new Date().getFullYear()} Konta
            </span>
        </footer>
    );
}

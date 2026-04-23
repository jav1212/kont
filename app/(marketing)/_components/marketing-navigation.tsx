"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoFull } from "@/src/shared/frontend/components/logo";

const TOOLS = [
    { href: "/herramientas/divisas",           label: "Divisas BCV"        },
    { href: "/herramientas/status",             label: "Estatus Portales"   },
    { href: "/herramientas/calendario-seniat",  label: "Calendario SENIAT"  },
];

export function MarketingHeader() {
    const pathname = usePathname() ?? "";

    return (
        <header className="relative z-10 flex items-center justify-between gap-4 px-6 sm:px-8 py-4 border-b border-border-light bg-background/50 backdrop-blur-md sticky top-0">
            <div className="flex items-center gap-6 min-w-0">
                <Link href="/" className="hover:opacity-80 transition-opacity shrink-0">
                    <LogoFull size={40} className="text-foreground" />
                </Link>
                <nav className="hidden md:flex items-center gap-1">
                    {TOOLS.map((t) => {
                        const active = pathname.startsWith(t.href);
                        return (
                            <Link
                                key={t.href}
                                href={t.href}
                                className={[
                                    "px-3 py-1.5 rounded-full text-[13px] font-mono font-bold uppercase tracking-[0.08em] transition-colors",
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
            <div className="flex items-center gap-4 sm:gap-6 shrink-0">
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

export function MarketingFooter() {
    return (
        <footer className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3 px-8 py-6 border-t border-foreground/[0.07] mt-auto">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                © {new Date().getFullYear()} Konta · Hecho en Venezuela
            </span>
            <div className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-disabled)]">
                <Link href="/herramientas/divisas" className="hover:text-foreground transition-colors">Divisas</Link>
                <Link href="/herramientas/status" className="hover:text-foreground transition-colors">Estatus</Link>
                <Link href="/herramientas/calendario-seniat" className="hover:text-foreground transition-colors">SENIAT</Link>
                <Link href="/sign-up" className="hover:text-foreground transition-colors">Registrarse</Link>
                <Link href="/sign-in" className="hover:text-foreground transition-colors">Ingresar</Link>
            </div>
        </footer>
    );
}

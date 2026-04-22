import Link from "next/link";
import { LogoFull } from "@/src/shared/frontend/components/logo";

export function MarketingHeader() {
    return (
        <header className="relative z-10 flex items-center justify-between px-6 sm:px-8 py-4 border-b border-border-light bg-background/50 backdrop-blur-md sticky top-0">
            <Link href="/" className="hover:opacity-80 transition-opacity">
                <LogoFull size={40} className="text-foreground" />
            </Link>
            <div className="flex items-center gap-4 sm:gap-6">
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
                <Link href="/sign-up" className="hover:text-foreground transition-colors">Registrarse</Link>
                <Link href="/sign-in" className="hover:text-foreground transition-colors">Ingresar</Link>
            </div>
        </footer>
    );
}

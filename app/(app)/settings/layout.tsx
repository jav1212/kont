"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEM =
    "flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs border transition-colors duration-150";
const ACTIVE = "text-sidebar-active-fg bg-sidebar-active-bg border-sidebar-active-border";
const IDLE   = "text-foreground/60 border-transparent hover:text-foreground hover:bg-foreground/[0.04]";

const NAV_LINKS = [
    { href: "/settings/company", label: "Empresa" },
    { href: "/settings/members", label: "Miembros" },
    { href: "/settings/apariencia", label: "Apariencia" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <div className="max-w-4xl w-full mx-auto px-6 py-10">
                {/* Header */}
                <header className="mb-10">
                    <h1 className="text-2xl font-bold text-foreground mb-2">
                        Configuración
                    </h1>
                    <p className="text-sm text-foreground/40 font-mono">
                        Gestiona los detalles de tu empresa, miembros y preferencias personales.
                    </p>
                </header>

                {/* Horizontal Tabs */}
                <nav
                    aria-label="Configuración"
                    className="flex items-center gap-8 border-b border-border-light mb-8 pt-2"
                >
                    {NAV_LINKS.map(({ href, label }) => {
                        const isActive = pathname.startsWith(href);
                        return (
                            <Link
                                key={href}
                                href={href}
                                aria-current={isActive ? "page" : undefined}
                                className={[
                                    "pb-4 text-xs font-mono uppercase tracking-widest transition-all duration-200 relative",
                                    isActive
                                        ? "text-primary-500 font-bold"
                                        : "text-foreground/40 hover:text-foreground/60"
                                ].join(" ")}
                            >
                                {label}
                                {isActive && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Page content */}
                <main className="min-w-0 animate-in fade-in duration-500">
                    {children}
                </main>
            </div>
        </div>
    );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEM =
    "flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs border transition-colors duration-150";
const ACTIVE = "text-sidebar-active-fg bg-sidebar-active-bg border-sidebar-active-border";
const IDLE   = "text-foreground/60 border-transparent hover:text-foreground hover:bg-foreground/[0.04]";

const NAV_LINKS = [
    { href: "/settings/profile", label: "Perfil" },
    { href: "/settings/company", label: "Empresa" },
    { href: "/settings/members", label: "Miembros" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="min-h-full flex flex-col sm:flex-row">
            {/* Side nav */}
            <nav
                aria-label="Configuración"
                className="flex-shrink-0 w-full sm:w-44 px-3 py-4 border-b sm:border-b-0 sm:border-r border-border-light bg-surface-1 flex sm:flex-col gap-1"
            >
                <p className="hidden sm:block px-2 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/30">
                    Configuración
                </p>
                {NAV_LINKS.map(({ href, label }) => (
                    <Link
                        key={href}
                        href={href}
                        aria-current={pathname.startsWith(href) ? "page" : undefined}
                        className={[NAV_ITEM, pathname.startsWith(href) ? ACTIVE : IDLE].join(" ")}
                    >
                        {label}
                    </Link>
                ))}
            </nav>

            {/* Page content */}
            <main className="flex-1 min-w-0">
                {children}
            </main>
        </div>
    );
}

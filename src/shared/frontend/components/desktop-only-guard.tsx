"use client";

import Link from "next/link";
import { useIsDesktop } from "@/src/shared/frontend/hooks/use-is-desktop";

const MonitorIcon = () => (
    <svg
        width="40" height="40" viewBox="0 0 40 40"
        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true"
        className="text-foreground/30"
    >
        <rect x="3" y="5" width="34" height="24" rx="3" />
        <path d="M13 35h14M20 29v6" />
    </svg>
);

export function DesktopOnlyGuard({ children }: { children: React.ReactNode }) {
    const isDesktop = useIsDesktop();

    // Mobile / tablet — show aviso
    if (!isDesktop) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center gap-6">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-foreground/[0.04] border border-border-light">
                    <MonitorIcon />
                </div>

                <div className="space-y-2 max-w-xs">
                    <p className="font-mono text-[15px] font-semibold text-foreground">
                        Disponible solo en escritorio
                    </p>
                    <p className="font-mono text-[13px] text-foreground/50 leading-relaxed">
                        Este módulo está optimizado para pantallas grandes. Abre Konta desde tu computadora para acceder.
                    </p>
                </div>

                <Link
                    href="/billing"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-mono text-[13px] text-foreground/60 border border-border-light hover:bg-foreground/[0.04] hover:text-foreground transition-colors duration-150"
                >
                    Ir a Facturación
                </Link>
            </div>
        );
    }

    return <>{children}</>;
}

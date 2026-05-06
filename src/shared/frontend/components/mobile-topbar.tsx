"use client";

import Image from "next/image";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { ChevronIcon } from "@/src/shared/frontend/components/icons/chevron-icon";

interface MobileTopBarProps {
    onMenuClick: () => void;
}

function initialsFor(name?: string | null): string {
    if (!name) return "?";
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

function MobileCompanyAvatar({ name, logoUrl }: { name?: string; logoUrl?: string | null }) {
    return (
        <span
            aria-hidden="true"
            className="relative flex items-center justify-center w-6 h-6 rounded-md bg-neutral-900 dark:bg-neutral-700 text-white shrink-0 overflow-visible"
        >
            {logoUrl ? (
                <span className="relative w-full h-full overflow-hidden rounded-md">
                    <Image src={logoUrl} alt="" fill unoptimized sizes="24px" className="object-cover" />
                </span>
            ) : (
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.04em]">
                    {initialsFor(name).slice(0, 2)}
                </span>
            )}
            <span
                aria-hidden="true"
                className="absolute -bottom-[2px] -right-[2px] w-2 h-2 rounded-full bg-[#FF4A18] ring-2 ring-sidebar-bg"
            />
        </span>
    );
}

export function MobileTopBar({ onMenuClick }: MobileTopBarProps) {
    const { company, loading } = useCompany();

    return (
        <header
            className="xl:hidden flex-shrink-0 flex items-center gap-1 px-3 bg-sidebar-bg border-b border-sidebar-border"
            style={{
                height: "calc(3.5rem + env(safe-area-inset-top))",
                paddingTop: "env(safe-area-inset-top)",
            }}
        >
            {/* Hamburger */}
            <button
                onClick={onMenuClick}
                aria-label="Abrir menú de navegación"
                className="flex items-center justify-center w-9 h-9 rounded-lg text-sidebar-fg hover:bg-sidebar-bg-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border flex-shrink-0"
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M2 4h12M2 8h12M2 12h12" />
                </svg>
            </button>

            {/* Company chip — opens drawer (where the company selector lives) */}
            <button
                onClick={onMenuClick}
                aria-label={`Empresa: ${company?.name ?? "Ninguna"}. Abrir menú para cambiar de empresa`}
                className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-bg-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
            >
                {loading ? (
                    <span aria-hidden="true" className="w-6 h-6 rounded-md bg-foreground/6 animate-pulse shrink-0" />
                ) : (
                    <MobileCompanyAvatar name={company?.name} logoUrl={company?.logoUrl} />
                )}
                <span className="flex-1 min-w-0 text-left font-mono text-[14px] font-semibold text-sidebar-fg-hover truncate">
                    {loading
                        ? "Cargando…"
                        : (company?.name ?? "Seleccionar empresa")}
                </span>
                <ChevronIcon open={false} />
            </button>
        </header>
    );
}

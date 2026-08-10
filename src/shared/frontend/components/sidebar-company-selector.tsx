"use client";

// SidebarCompanySelector — card-style trigger to switch the active company.
// Shares visual pattern with SidebarModuleSelector:
//   card ▸ avatar ▸ name + meta subtitle ▸ chevron
// Avatar: dark neutral tile with 2-letter initials (white) + tiny orange sync
// dot in the bottom-right (the "tenant synced with Konta" signal). Click →
// floating listbox menu with search.

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ChevronIcon } from "@/src/shared/frontend/components/icons/chevron-icon";
import { PortalMenu } from "@/src/shared/frontend/components/portal-menu";

// ── Local sub-components ──────────────────────────────────────────────────────

function initialsFor(name?: string | null): string {
    if (!name) return "?";
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Card-avatar used in the trigger: 36×36 dark neutral tile with large
 * uppercase initials and a tiny orange sync dot at the bottom-right.
 */
function CompanyCardAvatar({ name, logoUrl }: { name?: string; logoUrl?: string | null }) {
    return (
        <span
            aria-hidden="true"
            className="relative flex items-center justify-center w-9 h-9 rounded-md bg-neutral-900 dark:bg-neutral-700 text-white shrink-0 overflow-visible"
        >
            {logoUrl ? (
                <span className="relative w-full h-full overflow-hidden rounded-md">
                    <Image src={logoUrl} alt="" fill unoptimized sizes="36px" className="object-cover" />
                </span>
            ) : (
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.04em]">
                    {initialsFor(name).slice(0, 2)}
                </span>
            )}
            {/* Sync dot — warm orange #FF4A18 */}
            <span
                aria-hidden="true"
                className="absolute -bottom-[3px] -right-[3px] w-2.5 h-2.5 rounded-full bg-[#FF4A18] ring-2 ring-sidebar-bg"
            />
        </span>
    );
}

/** Compact 20×20 avatar used inside dropdown rows (keeps rows dense). */
function CompanyRowAvatar({ name, logoUrl }: { name?: string; logoUrl?: string | null }) {
    return (
        <span
            aria-hidden="true"
            className="relative w-6 h-6 rounded-md bg-neutral-900 dark:bg-neutral-700 text-white overflow-hidden flex items-center justify-center shrink-0"
        >
            {logoUrl ? (
                <Image src={logoUrl} alt="" fill unoptimized sizes="24px" className="object-cover" />
            ) : (
                <span className="font-mono text-[10px] font-bold uppercase">
                    {initialsFor(name).slice(0, 2)}
                </span>
            )}
        </span>
    );
}

const CheckIcon = () => (
    <svg className="ml-auto shrink-0" width="10" height="10" viewBox="0 0 10 10"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 5.5l2.5 2.5 4-5" />
    </svg>
);

// ── Types ─────────────────────────────────────────────────────────────────────

export type CompanyEntry = {
    id:            string;
    name:          string;
    logoUrl?:      string | null;
    rif?:          string | null;
    taxpayerType?: "ordinario" | "especial" | null;
};

interface SidebarCompanySelectorProps {
    companies: CompanyEntry[];
    selectedId: string | null;
    loading: boolean;
    onSelect: (id: string) => void;
    companiesHref: string;
}

// ── Subtitle helper ───────────────────────────────────────────────────────────

function buildCompanySubtitle(c?: CompanyEntry | null): string | null {
    if (!c) return null;
    const ridLabel = c.rif ?? c.id;  // id is already the RIF per domain model
    const typeLabel = c.taxpayerType === "especial" ? "Esp."
                    : c.taxpayerType === "ordinario" ? "Ord."
                    : null;
    if (ridLabel && typeLabel) return `${ridLabel} · ${typeLabel}`;
    return ridLabel ?? null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SidebarCompanySelector({
    companies,
    selectedId,
    loading,
    onSelect,
    companiesHref,
}: SidebarCompanySelectorProps) {
    const [open,   setOpen]   = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const selected = companies.find((c) => c.id === selectedId) ?? companies[0] ?? null;
    const subtitle = buildCompanySubtitle(selected);

    function handleSelect(id: string) {
        onSelect(id);
        setOpen(false);
        setSearch("");
    }

    function closeMenu() {
        setOpen(false);
        setSearch("");
    }

    function goToCompanies() {
        closeMenu();
        router.push(companiesHref);
    }

    const normalizedSearch = search.trim().toLowerCase();
    const filtered = companies.filter((c) =>
        c.name.toLowerCase().includes(normalizedSearch)
        || c.id.toLowerCase().includes(normalizedSearch)
        || c.rif?.toLowerCase().includes(normalizedSearch),
    );

    if (loading) {
        return (
            <div className="p-2 rounded-lg border border-sidebar-border bg-sidebar-bg-hover/60">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-md bg-foreground/6 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5">
                        <div className="h-3 rounded bg-foreground/6 animate-pulse w-3/4" />
                        <div className="h-2 rounded bg-foreground/6 animate-pulse w-1/2" />
                    </div>
                </div>
            </div>
        );
    }

    const triggerCommon = [
        "w-full flex items-center gap-2.5 p-2 rounded-lg border transition-colors duration-150 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border",
    ].join(" ");

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={`Empresa seleccionada: ${selected?.name ?? "Ninguna"}. Cambiar empresa`}
                className={[
                    triggerCommon,
                    open
                        ? "bg-sidebar-bg-hover border-border-medium"
                        : "bg-sidebar-bg-hover/60 border-sidebar-border hover:bg-sidebar-bg-hover hover:border-border-medium",
                ].join(" ")}
            >
                <CompanyCardAvatar name={selected?.name} logoUrl={selected?.logoUrl} />
                <span className="flex-1 min-w-0 flex flex-col leading-tight">
                    <span className="font-sans text-[15px] font-bold text-sidebar-fg-hover truncate">
                        {selected?.name ?? "Seleccionar empresa"}
                    </span>
                    {subtitle && (
                        <span className="font-mono text-[10px] tracking-[0.02em] text-sidebar-label truncate mt-0.5">
                            {subtitle}
                        </span>
                    )}
                </span>
                <ChevronIcon open={open} />
            </button>

            <PortalMenu
                open={open}
                onClose={closeMenu}
                anchorRef={ref}
                align="left"
                className="!p-0 w-[min(388px,calc(100vw-16px))] overflow-hidden !border-sidebar-border !bg-sidebar-bg"
            >
                    <div className="h-12 px-3 flex items-center gap-2 border-b border-sidebar-border">
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Buscar empresa…"
                            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 font-sans text-[14px] text-sidebar-fg-hover placeholder:text-sidebar-label outline-none ring-0 focus:outline-none focus:ring-0"
                        />
                        <kbd className="shrink-0 rounded-md border border-sidebar-border bg-sidebar-bg-hover/50 px-1.5 py-0.5 font-sans text-[11px] text-sidebar-label">
                            Esc
                        </kbd>
                    </div>
                    <ul role="listbox" aria-label="Empresas disponibles" className="max-h-80 overflow-y-auto p-1.5">
                        {filtered.map((c) => {
                            const isSelected = c.id === selectedId;
                            const rowSub = buildCompanySubtitle(c);
                            return (
                                <li key={c.id} role="option" aria-selected={isSelected}>
                                    <button
                                        onClick={() => handleSelect(c.id)}
                                        className={[
                                            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors duration-100 font-sans text-[15px] font-semibold text-left",
                                            isSelected ? "text-sidebar-fg-hover bg-sidebar-bg-hover" : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                        ].join(" ")}
                                    >
                                        <CompanyRowAvatar name={c.name} logoUrl={c.logoUrl} />
                                        <span className="flex-1 min-w-0 flex flex-col leading-tight">
                                            <span className="truncate">{c.name}</span>
                                            {rowSub && (
                                                <span className="text-[10px] text-sidebar-label truncate mt-0.5">
                                                    {rowSub}
                                                </span>
                                            )}
                                        </span>
                                        {isSelected && <CheckIcon />}
                                    </button>
                                </li>
                            );
                        })}
                        {filtered.length === 0 && (
                            <li className="px-3 py-8 text-center font-sans text-[14px] text-sidebar-label">
                                No se encontraron empresas
                            </li>
                        )}
                    </ul>
                    <div className="p-1.5 border-t border-sidebar-border">
                        <button
                            type="button"
                            onClick={goToCompanies}
                            className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-left text-sidebar-fg hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
                        >
                            <span className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-bg">
                                <Plus size={17} strokeWidth={1.8} />
                            </span>
                            <span className="min-w-0 flex flex-col font-sans leading-tight">
                                <span className="text-[14px] font-bold">Crear empresa</span>
                                <span className="mt-0.5 text-[12px] font-medium text-sidebar-label">
                                    Administra o registra una nueva empresa
                                </span>
                            </span>
                        </button>
                    </div>
            </PortalMenu>
        </div>
    );
}

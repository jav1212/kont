"use client";

// SidebarCompanySelector — dropdown to switch the active company.
// Manages its own open/search state; receives company data as props (business-agnostic).
// Collapsed mode: avatar-only trigger, dropdown opens to the right of the rail.

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { ChevronIcon } from "@/src/shared/frontend/components/icons/chevron-icon";

// ── Local sub-components ──────────────────────────────────────────────────────

function CompanyAvatar({ name, logoUrl }: { name?: string; logoUrl?: string | null }) {
    return (
        <div
            aria-hidden="true"
            className="relative w-5 h-5 rounded-md bg-primary-500/20 overflow-hidden flex items-center justify-center shrink-0"
        >
            {logoUrl ? (
                <Image
                    src={logoUrl}
                    alt=""
                    fill
                    unoptimized
                    sizes="20px"
                    className="object-cover"
                />
            ) : (
                <span className={`font-mono ${APP_SIZES.nav.companyAvatar} font-bold text-primary-400 uppercase`}>
                    {name?.[0] ?? "?"}
                </span>
            )}
        </div>
    );
}

const CheckIcon = () => (
    <svg className="ml-auto shrink-0" width="10" height="10" viewBox="0 0 10 10"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 5.5l2.5 2.5 4-5" />
    </svg>
);

// ── Types ─────────────────────────────────────────────────────────────────────

export type CompanyEntry = { id: string; name: string; logoUrl?: string | null };

interface SidebarCompanySelectorProps {
    companies: CompanyEntry[];
    selectedId: string | null;
    loading: boolean;
    isCollapsed: boolean;
    onSelect: (id: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SidebarCompanySelector({
    companies,
    selectedId,
    loading,
    isCollapsed,
    onSelect,
}: SidebarCompanySelectorProps) {
    const [open,   setOpen]   = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    const selected = companies.find((c) => c.id === selectedId) ?? companies[0] ?? null;

    // Outside click
    useEffect(() => {
        if (!open) return;
        function handle(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch("");
            }
        }
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, [open]);

    // Escape
    useEffect(() => {
        if (!open) return;
        function handle(e: KeyboardEvent) {
            if (e.key === "Escape") { setOpen(false); setSearch(""); }
        }
        document.addEventListener("keydown", handle);
        return () => document.removeEventListener("keydown", handle);
    }, [open]);

    function handleSelect(id: string) {
        onSelect(id);
        setOpen(false);
        setSearch("");
    }

    const dropdownClass = isCollapsed
        ? "absolute left-full top-0 ml-2 w-52 rounded-lg z-50 shadow-lg bg-sidebar-bg border border-sidebar-border overflow-hidden"
        : "absolute left-0 right-0 top-full mt-1 rounded-lg z-50 shadow-lg bg-sidebar-bg border border-sidebar-border overflow-hidden";

    const ICON_BTN      = "flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 text-sidebar-fg hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border";
    const ICON_BTN_OPEN = "text-sidebar-active-fg bg-sidebar-active-bg/60";

    const filtered = companies.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
    );

    // ── Collapsed: icon-only trigger ──────────────────────────────────────────

    if (isCollapsed) {
        return (
            <div className="relative" ref={ref}>
                <button
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-haspopup="listbox"
                    aria-label={`Empresa: ${selected?.name ?? "Ninguna"}. Cambiar empresa`}
                    className={[ICON_BTN, open ? ICON_BTN_OPEN : ""].join(" ")}
                >
                    <CompanyAvatar name={selected?.name} logoUrl={selected?.logoUrl} />
                </button>

                {open && (
                    <div className={dropdownClass}>
                        <div className="px-3 py-2 border-b border-sidebar-border">
                            <p className={`font-mono ${APP_SIZES.nav.sectionLabel} uppercase text-sidebar-label`}>
                                Empresa
                            </p>
                        </div>
                        <div className="p-2 border-b border-sidebar-border">
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar empresa…"
                                autoFocus
                                className={`w-full px-2 py-1.5 rounded-md bg-sidebar-bg-hover font-mono ${APP_SIZES.nav.companyName} text-sidebar-fg placeholder:text-sidebar-fg/40 focus:outline-none`}
                            />
                        </div>
                        <ul role="listbox" aria-label="Empresas disponibles" className="max-h-48 overflow-y-auto">
                            {filtered.map((c) => {
                                const isSelected = c.id === selectedId;
                                return (
                                    <li key={c.id} role="option" aria-selected={isSelected}>
                                        <button
                                            onClick={() => handleSelect(c.id)}
                                            className={[
                                                `w-full flex items-center gap-2 px-3 py-2 transition-colors duration-100 font-mono ${APP_SIZES.nav.companyName} text-left`,
                                                isSelected ? "text-sidebar-active-fg bg-sidebar-active-bg" : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                            ].join(" ")}
                                        >
                                            <CompanyAvatar name={c.name} logoUrl={c.logoUrl} />
                                            <span className="truncate flex-1">{c.name}</span>
                                            {isSelected && <CheckIcon />}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>
        );
    }

    // ── Expanded ──────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="px-2 py-1.5">
                <div className="h-3 rounded bg-foreground/6 animate-pulse w-3/4" />
            </div>
        );
    }

    if (companies.length === 0) {
        return (
            <p className={`px-2 font-mono ${APP_SIZES.nav.companyName} text-sidebar-label`}>
                Sin empresas
            </p>
        );
    }

    if (companies.length === 1) {
        return (
            <div className="px-2 py-1.5 flex items-center gap-2">
                <CompanyAvatar name={selected?.name} logoUrl={selected?.logoUrl} />
                <span className={`font-mono ${APP_SIZES.nav.companyName} truncate text-sidebar-fg`}>
                    {selected?.name}
                </span>
            </div>
        );
    }

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={`Empresa seleccionada: ${selected?.name ?? "Ninguna"}. Cambiar empresa`}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors duration-150 text-sidebar-fg hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
            >
                <CompanyAvatar name={selected?.name} logoUrl={selected?.logoUrl} />
                <span className={`font-mono ${APP_SIZES.nav.companyName} truncate flex-1 text-left`}>
                    {selected?.name ?? "Seleccionar…"}
                </span>
                <ChevronIcon open={open} />
            </button>

            {open && (
                <div className={dropdownClass}>
                    <div className="p-2 border-b border-sidebar-border">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar empresa…"
                            autoFocus
                            className={`w-full px-2 py-1.5 rounded-md bg-sidebar-bg-hover font-mono ${APP_SIZES.nav.companyName} text-sidebar-fg placeholder:text-sidebar-fg/40 focus:outline-none`}
                        />
                    </div>
                    <ul role="listbox" aria-label="Empresas disponibles" className="max-h-48 overflow-y-auto">
                        {filtered.map((c) => {
                            const isSelected = c.id === selectedId;
                            return (
                                <li key={c.id} role="option" aria-selected={isSelected}>
                                    <button
                                        onClick={() => handleSelect(c.id)}
                                        className={[
                                            `w-full flex items-center gap-2 px-3 py-2 transition-colors duration-100 font-mono ${APP_SIZES.nav.companyName} text-left`,
                                            isSelected ? "text-sidebar-active-fg bg-sidebar-active-bg" : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                        ].join(" ")}
                                    >
                                        <CompanyAvatar name={c.name} logoUrl={c.logoUrl} />
                                        <span className="truncate flex-1">{c.name}</span>
                                        {isSelected && <CheckIcon />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check, Building2 } from "lucide-react";
import type { CompanyLite } from "../hooks/use-companies-lite";
import { BaseInput } from "@/src/shared/frontend/components/base-input";

interface CompanySelectorProps {
    companies: CompanyLite[];
    loading: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
}

export function CompanySelector({ companies, loading, selectedId, onSelect }: CompanySelectorProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    const selected = useMemo(
        () => companies.find((c) => c.id === selectedId) ?? null,
        [companies, selectedId]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const base = [...companies].sort((a, b) => {
            if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
            return a.name.localeCompare(b.name);
        });
        if (!q) return base;
        return base.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                (c.rif ?? "").toLowerCase().includes(q)
        );
    }, [companies, search]);

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

    useEffect(() => {
        if (!open) return;
        function handle(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setOpen(false);
                setSearch("");
            }
        }
        document.addEventListener("keydown", handle);
        return () => document.removeEventListener("keydown", handle);
    }, [open]);

    if (loading) {
        return (
            <div className="animate-pulse bg-surface-2 rounded-lg h-[38px] w-full sm:w-[240px]" />
        );
    }

    if (companies.length === 0) return null;

    function handleSelect(c: CompanyLite) {
        if (c.disabled) return;
        onSelect(c.id);
        setOpen(false);
        setSearch("");
    }

    return (
        <div ref={ref} className="relative w-full sm:w-[240px]">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`Seleccionar empresa. ${selected?.name ?? "Ninguna seleccionada"}`}
                className={[
                    "group w-full min-h-[38px] px-3 py-1.5 flex items-center gap-2",
                    "bg-surface-1 border rounded-lg transition-all duration-150",
                    "shadow-[inset_0_1px_2px_rgba(0,0,0,.03)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/20",
                    open
                        ? "border-primary-400 ring-2 ring-primary-500/10"
                        : "border-border-light hover:border-border-default",
                ].join(" ")}
            >
                <Avatar name={selected?.name} />
                <span
                    className={[
                        "font-mono text-[13px] truncate flex-1 text-left",
                        selected ? "text-foreground" : "text-text-tertiary",
                    ].join(" ")}
                >
                    {selected?.name ?? "Seleccionar empresa..."}
                </span>
                <ChevronDown
                    size={14}
                    strokeWidth={1.75}
                    className={[
                        "text-text-tertiary flex-shrink-0 transition-transform duration-200",
                        open ? "rotate-180" : "",
                    ].join(" ")}
                    aria-hidden
                />
            </button>

            {open && (
                <div
                    className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-border-light bg-surface-1 shadow-lg overflow-hidden"
                >
                    <div className="px-2.5 py-2 border-b border-border-light bg-surface-2/60">
                        <BaseInput.Field
                            type="search"
                            value={search}
                            onValueChange={setSearch}
                            placeholder="Buscar empresa o RIF..."
                            autoFocus
                            startContent={<Search size={14} className="text-[var(--text-tertiary)]" />}
                            className="w-full"
                            aria-label="Buscar empresa por nombre o RIF"
                        />
                    </div>

                    <ul
                        role="listbox"
                        aria-label="Empresas disponibles"
                        className="max-h-[260px] overflow-y-auto p-1"
                    >
                        {filtered.length === 0 ? (
                            <li className="px-3 py-4 text-center font-mono text-[11px] text-text-tertiary italic">
                                Sin coincidencias
                            </li>
                        ) : (
                            filtered.map((c) => {
                                const isSelected = c.id === selectedId;
                                return (
                                    <li key={c.id} role="option" aria-selected={isSelected}>
                                        <button
                                            type="button"
                                            onClick={() => handleSelect(c)}
                                            disabled={c.disabled}
                                            className={[
                                                "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-colors duration-100",
                                                c.disabled
                                                    ? "opacity-45 cursor-not-allowed"
                                                    : "hover:bg-surface-2 cursor-pointer",
                                                isSelected ? "bg-surface-2" : "",
                                            ].join(" ")}
                                            title={c.disabled ? c.disabledReason : undefined}
                                        >
                                            <Avatar name={c.name} />
                                            <div className="min-w-0 flex-1">
                                                <p className="font-mono text-[12px] font-medium text-foreground truncate">
                                                    {c.name}
                                                </p>
                                                <p className="font-mono text-[10px] text-text-tertiary truncate">
                                                    {c.rif ?? c.disabledReason ?? "Sin RIF"}
                                                </p>
                                            </div>
                                            {isSelected && (
                                                <Check size={12} strokeWidth={2.25} className="text-primary-500 flex-shrink-0" aria-hidden />
                                            )}
                                        </button>
                                    </li>
                                );
                            })
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}

function Avatar({ name }: { name?: string }) {
    return (
        <div
            aria-hidden
            className="w-6 h-6 rounded-md bg-primary-100 text-primary-600 text-[10px] font-mono font-bold flex items-center justify-center flex-shrink-0 dark:bg-primary-50/10 dark:text-primary-500"
        >
            {name ? name[0]?.toUpperCase() : <Building2 size={12} strokeWidth={1.75} />}
        </div>
    );
}

"use client";

import { useRef, useState } from "react";
import { ChevronIcon } from "@/src/shared/frontend/components/icons/chevron-icon";
import { PortalMenu } from "@/src/shared/frontend/components/portal-menu";
import { normalizeCurrencyCode, type CurrencyCode } from "../../shared/currency";
import type { CurrencyOption } from "../hooks/use-invoice-exchange-rates";

interface Props {
    value: CurrencyCode;
    options: CurrencyOption[];
    onChange: (currencyCode: CurrencyCode) => void;
    disabled?: boolean;
    className?: string;
}

function CurrencyIcon({ code, small = false }: { code: string; small?: boolean }) {
    return (
        <span
            aria-hidden="true"
            className={small
                ? "flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[10px] font-bold text-sidebar-label"
                : "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary-500/20 bg-primary-500/10 font-mono text-[11px] font-bold text-primary-500"}
        >
            {code === "VES" ? "Bs" : code.slice(0, 3)}
        </span>
    );
}

export function CurrencyModuleSelector({ value, options, onChange, disabled, className = "" }: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const anchorRef = useRef<HTMLDivElement>(null);
    const selected = normalizeCurrencyCode(value);
    const selectedOption = options.find((option) => normalizeCurrencyCode(option.code) === selected) ?? options[0];
    const selectedParts = selectedOption?.label.split(" · ") ?? [selected, selected];
    const query = search.trim().toLowerCase();
    const filtered = options.filter((option) => option.code.toLowerCase().includes(query) || option.label.toLowerCase().includes(query));

    function close() {
        setOpen(false);
        setSearch("");
    }

    function choose(code: string) {
        onChange(normalizeCurrencyCode(code));
        close();
    }

    return (
        <div className={`relative ${className}`} ref={anchorRef}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={`Moneda activa: ${selectedOption?.label ?? selected}. Cambiar moneda`}
                className={`flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border ${open ? "border-border-medium bg-sidebar-bg-hover" : "border-sidebar-border bg-sidebar-bg-hover/60 hover:border-border-medium hover:bg-sidebar-bg-hover"}`}
            >
                <CurrencyIcon code={selected} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate font-sans text-[15px] font-bold text-sidebar-fg-hover">{selectedParts[0]}</span>
                    <span className="mt-0.5 truncate font-mono text-[10px] tracking-[0.02em] text-sidebar-label">{selectedParts[1] ?? selected}</span>
                </span>
                <ChevronIcon open={open} />
            </button>

            <PortalMenu open={open} onClose={close} anchorRef={anchorRef} align="left" className="!w-[min(388px,calc(100vw-16px))] !overflow-hidden !border-sidebar-border !bg-sidebar-bg !p-0">
                <div className="flex h-12 items-center gap-2 border-b border-sidebar-border px-3">
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar moneda…" autoFocus className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 font-sans text-[14px] text-sidebar-fg-hover outline-none placeholder:text-sidebar-label focus:outline-none focus:ring-0" />
                    <kbd className="shrink-0 rounded-md border border-sidebar-border bg-sidebar-bg-hover/50 px-1.5 py-0.5 font-sans text-[11px] text-sidebar-label">Esc</kbd>
                </div>
                <ul role="listbox" aria-label="Monedas disponibles" className="max-h-80 overflow-y-auto p-1.5">
                    {filtered.map((option) => {
                        const code = normalizeCurrencyCode(option.code);
                        const parts = option.label.split(" · ");
                        const active = code === selected;
                        return <li key={code} role="option" aria-selected={active}>
                            <button type="button" onClick={() => choose(code)} className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left font-sans text-[14px] font-semibold transition-colors duration-100 ${active ? "bg-sidebar-bg-hover text-sidebar-fg-hover" : "text-sidebar-fg hover:bg-sidebar-bg-hover"}`}>
                                <CurrencyIcon code={code} small />
                                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                                    <span className="truncate">{parts[0]}</span>
                                    <span className="mt-0.5 truncate font-mono text-[10px] font-normal text-sidebar-label">{parts[1] ?? code}</span>
                                </span>
                                {active && <span className="ml-auto shrink-0 text-primary-500" aria-hidden="true">✓</span>}
                            </button>
                        </li>;
                    })}
                    {filtered.length === 0 && <li className="px-3 py-8 text-center font-sans text-[14px] text-sidebar-label">No se encontraron monedas</li>}
                </ul>
            </PortalMenu>
        </div>
    );
}

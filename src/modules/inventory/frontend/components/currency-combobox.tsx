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
    label?: string;
    disabled?: boolean;
    className?: string;
    displayValue?: string;
    triggerClassName?: string;
    menuAlign?: "left" | "right";
}

const FREQUENT = new Set(["VES", "USD", "EUR"]);

export function CurrencyCombobox({ value, options, onChange, label = "Moneda", disabled, className = "", displayValue, triggerClassName = "", menuAlign = "left" }: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const anchorRef = useRef<HTMLDivElement>(null);
    const selected = normalizeCurrencyCode(value);
    const query = search.trim().toLowerCase();
    const filtered = options.filter((option) => !query || option.code.toLowerCase().includes(query) || option.label.toLowerCase().includes(query));
    const frequent = filtered.filter((option) => FREQUENT.has(option.code));
    const remaining = filtered.filter((option) => !FREQUENT.has(option.code));

    function close() { setOpen(false); setSearch(""); }
    function choose(code: CurrencyCode) { onChange(normalizeCurrencyCode(code)); close(); }

    return (
        <div className={className}>
            {label && <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{label}</label>}
            <div ref={anchorRef}>
                <button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open} className={`flex h-10 w-full items-center justify-between rounded-lg border border-[var(--control-border)] bg-surface-1 px-3 font-mono text-[14px] uppercase text-foreground outline-none transition-colors hover:border-[var(--control-border-hover)] focus-visible:border-[var(--control-border-focus)] focus-visible:shadow-[var(--control-focus-shadow)] disabled:bg-[var(--control-disabled-bg)] ${triggerClassName}`}>
                    <span>{displayValue ?? selected}</span><ChevronIcon open={open} />
                </button>
            </div>
            <PortalMenu open={open} onClose={close} anchorRef={anchorRef} align={menuAlign} className="!w-[min(360px,calc(100vw-16px))] !p-0 overflow-hidden">
                <div className="flex h-11 items-center border-b border-border-light px-3">
                    <input type="search" autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código o país…" className="h-full min-w-0 flex-1 border-0 bg-transparent font-sans text-[14px] text-foreground outline-none placeholder:text-[var(--text-tertiary)]" />
                </div>
                <ul role="listbox" aria-label="Monedas disponibles" className="max-h-72 overflow-y-auto p-1.5">
                    {[...frequent, ...remaining].map((option, index) => {
                        const active = option.code === selected;
                        const startsOther = index === frequent.length && remaining.length > 0 && frequent.length > 0;
                        return <li key={option.code} role="option" aria-selected={active} className={startsOther ? "mt-1 border-t border-border-light pt-1" : ""}>
                            <button type="button" onClick={() => choose(option.code)} className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-2 ${active ? "bg-primary-500/10 text-primary-500" : "text-foreground"}`}>
                                <span className="w-10 shrink-0 font-mono text-[12px] font-bold">{option.code}</span>
                                <span className="min-w-0 flex-1 truncate font-sans text-[13px] text-[var(--text-secondary)]">{option.label.replace(/^\S+\s*·?\s*/, "") || option.label}</span>
                                {active && <span aria-hidden="true">✓</span>}
                            </button>
                        </li>;
                    })}
                    {filtered.length === 0 && <li className="px-3 py-8 text-center font-sans text-[13px] text-[var(--text-tertiary)]">No se encontraron monedas</li>}
                </ul>
            </PortalMenu>
        </div>
    );
}

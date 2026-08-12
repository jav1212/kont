"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronIcon } from "./icons/chevron-icon";
import { PortalMenu } from "./portal-menu";
import { ResponsiveBottomSheet } from "./responsive-bottom-sheet";

export interface ResponsiveSelectOption<T extends string = string> {
    value: T;
    label: string;
    description?: string;
}

interface ResponsiveSelectProps<T extends string> {
    value: T;
    options: ResponsiveSelectOption<T>[];
    onChange: (value: T) => void;
    label?: string;
    placeholder?: string;
    title?: string;
    subtitle?: string;
    disabled?: boolean;
    searchable?: boolean;
    className?: string;
    triggerClassName?: string;
}

export function ResponsiveSelect<T extends string>({
    value,
    options,
    onChange,
    label,
    placeholder = "Seleccionar…",
    title = label ? `Seleccionar ${label.toLowerCase()}` : "Seleccionar opción",
    subtitle,
    disabled,
    searchable = false,
    className = "",
    triggerClassName = "",
}: ResponsiveSelectProps<T>) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [isMobile, setIsMobile] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const selected = options.find((option) => option.value === value);
    const query = search.trim().toLocaleLowerCase("es");
    const filtered = options.filter((option) => !query || `${option.label} ${option.description ?? ""}`.toLocaleLowerCase("es").includes(query));

    useEffect(() => {
        const media = window.matchMedia("(max-width: 767px)");
        const sync = () => setIsMobile(media.matches);
        sync();
        media.addEventListener("change", sync);
        return () => media.removeEventListener("change", sync);
    }, []);

    const close = () => { setOpen(false); setSearch(""); };
    const choose = (next: T) => { onChange(next); close(); };
    const content = <>
        {searchable && <div className="flex h-12 items-center border-b border-border-light px-3 md:h-11">
            <input type="search" autoFocus={!isMobile} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar…" className="h-full min-w-0 flex-1 border-0 bg-transparent font-sans text-[16px] text-foreground outline-none placeholder:text-[var(--text-tertiary)] md:text-[14px]" />
        </div>}
        <ul role="listbox" className="max-h-72 overflow-y-auto overscroll-contain p-1.5 max-md:max-h-none max-md:px-2 max-md:pb-3">
            {filtered.map((option) => {
                const active = option.value === value;
                return <li key={option.value} role="option" aria-selected={active}>
                    <button type="button" onClick={() => choose(option.value)} className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-2 max-md:min-h-12 max-md:rounded-xl ${active ? "bg-primary-500/10 text-primary-500" : "text-foreground"}`}>
                        <span className="min-w-0"><span className="block truncate font-sans text-[14px]">{option.label}</span>{option.description && <span className="mt-0.5 block truncate font-sans text-[11px] text-[var(--text-tertiary)]">{option.description}</span>}</span>
                        {active && <span aria-hidden="true" className="shrink-0">✓</span>}
                    </button>
                </li>;
            })}
            {filtered.length === 0 && <li className="px-3 py-8 text-center font-sans text-[13px] text-[var(--text-tertiary)]">No se encontraron resultados</li>}
        </ul>
    </>;

    return <div className={className}>
        {label && <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{label}</label>}
        <div ref={anchorRef}><button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open} className={`flex h-10 w-full items-center justify-between rounded-lg border border-[var(--control-border)] bg-surface-1 px-3 font-sans text-[14px] text-foreground outline-none hover:border-[var(--control-border-hover)] focus-visible:border-[var(--control-border-focus)] focus-visible:shadow-[var(--control-focus-shadow)] disabled:bg-[var(--control-disabled-bg)] ${triggerClassName}`}><span className={`truncate ${selected ? "" : "text-[var(--text-tertiary)]"}`}>{selected?.label ?? placeholder}</span><ChevronIcon open={open} /></button></div>
        {!isMobile && <PortalMenu open={open} onClose={close} anchorRef={anchorRef} align="left" side="auto" className="!w-[min(380px,calc(100vw-16px))] !p-0 overflow-hidden">{content}</PortalMenu>}
        {isMobile && <ResponsiveBottomSheet open={open} onClose={close} title={title} subtitle={subtitle} contentClassName="flex flex-col">{content}</ResponsiveBottomSheet>}
    </div>;
}

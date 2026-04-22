"use client";

// SidebarModuleSelector — compact dropdown to switch the active module.
// Manages its own open state; informs parent via onSelect.
// Collapsed mode: icon-only trigger, dropdown opens to the right of the rail.

import { useEffect, useRef, useState } from "react";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { ChevronIcon } from "@/src/shared/frontend/components/icons/chevron-icon";

// ── Module icons ───────────────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, React.ReactNode> = {
    payroll: (
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="1" width="11" height="11" rx="1.5" />
                <path d="M4 5h5M4 7.5h3" />
            </svg>
        </div>
    ),
    companies: (
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="4" width="11" height="8" rx="1" />
                <path d="M4 4V2.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5V4" />
                <path d="M5 8h3M6.5 6.5v3" />
            </svg>
        </div>
    ),
    inventory: (
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 4l5.5-3 5.5 3v5l-5.5 3L1 9V4z" />
                <path d="M6.5 1v11M1 4l5.5 3 5.5-3" />
            </svg>
        </div>
    ),
    billing: (
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="3" width="11" height="7" rx="1" />
                <path d="M1 6h11M4.5 8.5h2" />
            </svg>
        </div>
    ),
    documents: (
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 1h5l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" />
                <path d="M8 1v3h3M5 7h3M5 9.5h2" />
            </svg>
        </div>
    ),
    accounting: (
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="1" width="11" height="11" rx="1.5" />
                <path d="M4 4h2M4 6.5h5M4 9h3" />
                <path d="M8.5 3.5l1 1-1 1" />
            </svg>
        </div>
    ),
    tools: (
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8.5 1.5a2.5 2.5 0 0 1 2.47 2.9l-2.47.9-1.8-1.8.9-2.47a2.5 2.5 0 0 1 .9-.03z" />
                <path d="M7.8 4.5L2 10.3a1.2 1.2 0 0 0 1.7 1.7L9.5 6.2" />
                <circle cx="3.2" cy="10.8" r="0.4" fill="currentColor" />
            </svg>
        </div>
    ),
};

const CheckIcon = () => (
    <svg className="ml-auto shrink-0" width="10" height="10" viewBox="0 0 10 10"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 5.5l2.5 2.5 4-5" />
    </svg>
);

// ── Types ─────────────────────────────────────────────────────────────────────

export type SelectableModule = { id: string; label: string; href: string };

interface SidebarModuleSelectorProps {
    modules: SelectableModule[];
    activeModuleId: string | null;
    isCollapsed: boolean;
    onSelect: (id: string, href: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SidebarModuleSelector({
    modules,
    activeModuleId,
    isCollapsed,
    onSelect,
}: SidebarModuleSelectorProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const activeModule = modules.find((m) => m.id === activeModuleId) ?? null;

    // Outside click
    useEffect(() => {
        if (!open) return;
        function handle(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, [open]);

    // Escape
    useEffect(() => {
        if (!open) return;
        function handle(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("keydown", handle);
        return () => document.removeEventListener("keydown", handle);
    }, [open]);

    function handleSelect(id: string, href: string) {
        onSelect(id, href);
        setOpen(false);
    }

    const dropdownClass = isCollapsed
        ? "absolute left-full top-0 ml-2 w-52 rounded-lg z-50 shadow-lg bg-sidebar-bg border border-sidebar-border overflow-hidden"
        : "absolute left-0 right-0 top-full mt-1 rounded-lg z-50 shadow-lg bg-sidebar-bg border border-sidebar-border overflow-hidden";

    const ICON_BTN       = "flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 text-sidebar-fg hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border";
    const ICON_BTN_OPEN  = "text-sidebar-active-fg bg-sidebar-active-bg/60";

    if (isCollapsed) {
        return (
            <div className="relative" ref={ref}>
                <button
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-haspopup="listbox"
                    aria-label={`Módulo: ${activeModule?.label ?? "Ninguno"}. Cambiar módulo`}
                    className={[ICON_BTN, open ? ICON_BTN_OPEN : ""].join(" ")}
                >
                    {activeModuleId && MODULE_ICONS[activeModuleId]}
                </button>

                {open && (
                    <ul role="listbox" aria-label="Módulos disponibles" className={dropdownClass}>
                        <li className="px-3 py-2 border-b border-sidebar-border">
                            <p className={`font-mono ${APP_SIZES.nav.sectionLabel} uppercase text-sidebar-label`}>
                                Módulo
                            </p>
                        </li>
                        {modules.map((mod) => {
                            const isSelected = mod.id === activeModuleId;
                            return (
                                <li key={mod.id} role="option" aria-selected={isSelected}>
                                    <button
                                        onClick={() => handleSelect(mod.id, mod.href)}
                                        className={[
                                            `w-full flex items-center gap-2 px-3 py-2 transition-colors duration-100 font-mono ${APP_SIZES.nav.companyName} text-left`,
                                            isSelected ? "text-sidebar-active-fg bg-sidebar-active-bg" : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                        ].join(" ")}
                                    >
                                        {MODULE_ICONS[mod.id]}
                                        <span className="truncate flex-1">{mod.label}</span>
                                        {isSelected && <CheckIcon />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        );
    }

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={`Módulo activo: ${activeModule?.label ?? "Ninguno"}. Cambiar módulo`}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors duration-150 text-sidebar-fg hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
            >
                {activeModuleId && MODULE_ICONS[activeModuleId]}
                <span className={`font-mono ${APP_SIZES.nav.companyName} truncate flex-1 text-left`}>
                    {activeModule?.label ?? "Seleccionar…"}
                </span>
                <ChevronIcon open={open} />
            </button>

            {open && (
                <ul role="listbox" aria-label="Módulos disponibles" className={dropdownClass}>
                    {modules.map((mod) => {
                        const isSelected = mod.id === activeModuleId;
                        return (
                            <li key={mod.id} role="option" aria-selected={isSelected}>
                                <button
                                    onClick={() => handleSelect(mod.id, mod.href)}
                                    className={[
                                        `w-full flex items-center gap-2 px-3 py-2 transition-colors duration-100 font-mono ${APP_SIZES.nav.companyName} text-left`,
                                        isSelected ? "text-sidebar-active-fg bg-sidebar-active-bg" : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                    ].join(" ")}
                                >
                                    {MODULE_ICONS[mod.id]}
                                    <span className="truncate flex-1">{mod.label}</span>
                                    {isSelected && <CheckIcon />}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

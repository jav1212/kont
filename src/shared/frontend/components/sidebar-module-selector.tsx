"use client";

// SidebarModuleSelector — card-style trigger to switch the active module.
// Visual pattern (shared with SidebarCompanySelector):
//   card ▸ avatar ▸ name + meta subtitle ▸ chevron
// Avatar uses a primary-tinted tile (primary-500/10 bg + primary-500/20 border)
// with the module's glyph inside. Click → floating listbox menu.

import { useEffect, useRef, useState } from "react";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { ChevronIcon } from "@/src/shared/frontend/components/icons/chevron-icon";

// ── Module icons ───────────────────────────────────────────────────────────────
// Rendered at two sizes: 13px inside the dropdown rows, 16px inside the avatar tile.

function renderModuleIcon(id: string, size: number) {
    const s = size;
    const props = {
        width: s, height: s, viewBox: "0 0 16 16",
        fill: "none", stroke: "currentColor",
        strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
        "aria-hidden": true,
    };
    switch (id) {
        case "payroll":
            // Bullseye / target — represents the current payroll period focus
            return (
                <svg {...props}>
                    <circle cx="8" cy="8" r="6.2" />
                    <circle cx="8" cy="8" r="3.3" />
                    <circle cx="8" cy="8" r="1" fill="currentColor" />
                </svg>
            );
        case "companies":
            return (
                <svg {...props}>
                    <rect x="2" y="5" width="12" height="9" rx="1" />
                    <path d="M5 5V3.2a.6.6 0 0 1 .6-.6h4.8a.6.6 0 0 1 .6.6V5" />
                    <path d="M6 10h4M8 8.5v3" />
                </svg>
            );
        case "inventory":
            return (
                <svg {...props}>
                    <path d="M2 4.7l6-3 6 3v6l-6 3-6-3v-6z" />
                    <path d="M8 1.7v12M2 4.7l6 3 6-3" />
                </svg>
            );
        case "billing":
            return (
                <svg {...props}>
                    <rect x="2" y="3.5" width="12" height="8" rx="1" />
                    <path d="M2 7h12M5.5 9.5h2.5" />
                </svg>
            );
        case "documents":
            return (
                <svg {...props}>
                    <path d="M4 1.5h5.5L13 5v8.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" />
                    <path d="M9.5 1.5v3.5H13M6 8h4M6 10.5h3" />
                </svg>
            );
        case "accounting":
            return (
                <svg {...props}>
                    <rect x="2" y="2" width="12" height="12" rx="1.5" />
                    <path d="M5 5h3M5 8h5M5 11h3" />
                    <path d="M10 4.5l1.2 1.2L10 7" />
                </svg>
            );
        case "tools":
            return (
                <svg {...props}>
                    <path d="M10 2a3 3 0 0 1 2.9 3.4l-2.9 1.1-2.1-2.1L9 1.5A3 3 0 0 1 10 2z" />
                    <path d="M9 5L2.5 11.5a1.4 1.4 0 0 0 2 2L11 7" />
                </svg>
            );
        default:
            return null;
    }
}

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
    /** Optional meta line rendered under the module name (e.g. "Quincena 2 · Abril 2026"). */
    subtitle?: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SidebarModuleSelector({
    modules,
    activeModuleId,
    isCollapsed,
    onSelect,
    subtitle,
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
        ? "absolute left-full top-0 ml-2 w-56 rounded-lg z-50 shadow-lg bg-sidebar-bg border border-sidebar-border overflow-hidden"
        : "absolute left-0 right-0 top-full mt-1 rounded-lg z-50 shadow-lg bg-sidebar-bg border border-sidebar-border overflow-hidden";

    // ── Collapsed: icon-only trigger ──────────────────────────────────────────

    if (isCollapsed) {
        const ICON_BTN      = "flex items-center justify-center w-9 h-9 rounded-md border border-primary-500/20 bg-primary-500/10 text-primary-500 transition-colors duration-150 hover:bg-primary-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border";
        const ICON_BTN_OPEN = "bg-primary-500/20";

        return (
            <div className="relative" ref={ref}>
                <button
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-haspopup="listbox"
                    aria-label={`Módulo: ${activeModule?.label ?? "Ninguno"}. Cambiar módulo`}
                    className={[ICON_BTN, open ? ICON_BTN_OPEN : ""].join(" ")}
                >
                    {activeModuleId && renderModuleIcon(activeModuleId, 16)}
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
                                            `w-full flex items-center gap-2.5 px-3 py-2 transition-colors duration-100 font-mono ${APP_SIZES.nav.companyName} text-left`,
                                            isSelected ? "text-sidebar-active-fg bg-sidebar-active-bg" : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                        ].join(" ")}
                                    >
                                        <span className={[
                                            "flex items-center justify-center w-6 h-6 rounded-md shrink-0",
                                            isSelected ? "bg-primary-500/15 text-primary-500" : "bg-sidebar-bg-hover text-sidebar-fg",
                                        ].join(" ")}>
                                            {renderModuleIcon(mod.id, 13)}
                                        </span>
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

    // ── Expanded: card trigger ────────────────────────────────────────────────

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={`Módulo activo: ${activeModule?.label ?? "Ninguno"}. Cambiar módulo`}
                className={[
                    "w-full flex items-center gap-2.5 p-2 rounded-lg border transition-colors duration-150 text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border",
                    open
                        ? "bg-sidebar-bg-hover border-border-medium"
                        : "bg-sidebar-bg-hover/60 border-sidebar-border hover:bg-sidebar-bg-hover hover:border-border-medium",
                ].join(" ")}
            >
                {/* Avatar — primary-tinted tile */}
                <span
                    aria-hidden="true"
                    className="flex items-center justify-center w-9 h-9 rounded-md bg-primary-500/10 border border-primary-500/20 text-primary-500 shrink-0"
                >
                    {activeModuleId && renderModuleIcon(activeModuleId, 16)}
                </span>

                {/* Name + subtitle */}
                <span className="flex-1 min-w-0 flex flex-col">
                    <span className="font-mono text-[13px] font-semibold text-sidebar-fg-hover truncate leading-tight">
                        {activeModule?.label ?? "Seleccionar módulo"}
                    </span>
                    {subtitle && (
                        <span className="font-mono text-[10px] tracking-[0.02em] text-sidebar-label truncate leading-tight mt-0.5">
                            {subtitle}
                        </span>
                    )}
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
                                        `w-full flex items-center gap-2.5 px-3 py-2 transition-colors duration-100 font-mono ${APP_SIZES.nav.companyName} text-left`,
                                        isSelected ? "text-sidebar-active-fg bg-sidebar-active-bg" : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                    ].join(" ")}
                                >
                                    <span className={[
                                        "flex items-center justify-center w-6 h-6 rounded-md shrink-0",
                                        isSelected ? "bg-primary-500/15 text-primary-500" : "bg-sidebar-bg-hover text-sidebar-fg",
                                    ].join(" ")}>
                                        {renderModuleIcon(mod.id, 13)}
                                    </span>
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

"use client";

// SidebarModuleSelector — card-style trigger to switch the active module.
// Visual pattern (shared with SidebarCompanySelector):
//   card ▸ avatar ▸ name + meta subtitle ▸ chevron
// Avatar uses a primary-tinted tile (primary-500/10 bg + primary-500/20 border)
// with the module's glyph inside. Click → floating listbox menu.

import { useRef, useState } from "react";
import { ChevronIcon } from "@/src/shared/frontend/components/icons/chevron-icon";
import { PortalMenu } from "@/src/shared/frontend/components/portal-menu";

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
        case "purchases":
            // Tray with downward arrow — incoming invoices / "entradas"
            return (
                <svg {...props}>
                    <rect x="2" y="6.5" width="12" height="7.5" rx="1" />
                    <path d="M2 10.5h4l1 1.5h2l1-1.5h4" />
                    <path d="M8 1.7v4.8M5.5 4.2L8 6.6l2.5-2.4" />
                </svg>
            );
        case "sales":
            // Outgoing receipt — invoice with upward arrow leaving the tray
            return (
                <svg {...props}>
                    <rect x="2" y="6.5" width="12" height="7.5" rx="1" />
                    <path d="M2 10.5h4l1 1.5h2l1-1.5h4" />
                    <path d="M8 6.5V1.7M5.5 4l2.5-2.3 2.5 2.3" />
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
    <svg className="ml-auto shrink-0" width="14" height="14" viewBox="0 0 10 10"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 5.5l2.5 2.5 4-5" />
    </svg>
);

// ── Types ─────────────────────────────────────────────────────────────────────

export type SelectableModule = { id: string; label: string; href: string };

interface SidebarModuleSelectorProps {
    modules: SelectableModule[];
    activeModuleId: string | null;
    onSelect: (id: string, href: string) => void;
    /** Optional meta line rendered under the module name (e.g. "Quincena 2 · Abril 2026"). */
    subtitle?: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SidebarModuleSelector({
    modules,
    activeModuleId,
    onSelect,
    subtitle,
}: SidebarModuleSelectorProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    const activeModule = modules.find((m) => m.id === activeModuleId) ?? null;

    function handleSelect(id: string, href: string) {
        onSelect(id, href);
        setOpen(false);
        setSearch("");
    }

    function closeMenu() {
        setOpen(false);
        setSearch("");
    }

    const filteredModules = modules.filter((mod) =>
        mod.label.toLowerCase().includes(search.trim().toLowerCase()),
    );

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
                    <span className="font-sans text-[15px] font-bold text-sidebar-fg-hover truncate leading-tight">
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
                            placeholder="Buscar módulo…"
                            autoFocus
                            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 font-sans text-[14px] text-sidebar-fg-hover placeholder:text-sidebar-label outline-none ring-0 focus:outline-none focus:ring-0"
                        />
                        <kbd className="shrink-0 rounded-md border border-sidebar-border bg-sidebar-bg-hover/50 px-1.5 py-0.5 font-sans text-[11px] text-sidebar-label">
                            Esc
                        </kbd>
                    </div>
                    <ul role="listbox" aria-label="Módulos disponibles" className="max-h-80 overflow-y-auto p-1.5">
                        {filteredModules.map((mod) => {
                            const isSelected = mod.id === activeModuleId;
                            return (
                                <li key={mod.id} role="option" aria-selected={isSelected}>
                                    <button
                                        onClick={() => handleSelect(mod.id, mod.href)}
                                        className={[
                                            "w-full flex items-center gap-3 px-2.5 py-2 rounded-md transition-colors duration-100 font-sans text-[14px] font-semibold text-left",
                                            isSelected ? "text-sidebar-fg-hover bg-sidebar-bg-hover" : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                        ].join(" ")}
                                    >
                                        <span className={[
                                            "flex items-center justify-center w-5 h-5 shrink-0",
                                            isSelected ? "text-primary-500" : "text-sidebar-label",
                                        ].join(" ")}>
                                            {renderModuleIcon(mod.id, 16)}
                                        </span>
                                        <span className="truncate flex-1">{mod.label}</span>
                                        {isSelected && <CheckIcon />}
                                    </button>
                                </li>
                            );
                        })}
                        {filteredModules.length === 0 && (
                            <li className="px-3 py-8 text-center font-sans text-[14px] text-sidebar-label">
                                No se encontraron módulos
                            </li>
                        )}
                    </ul>
            </PortalMenu>
        </div>
    );
}

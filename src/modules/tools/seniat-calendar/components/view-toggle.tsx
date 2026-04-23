"use client";

import { LayoutGrid, List } from "lucide-react";

interface ViewToggleProps {
    value: "grid" | "lista";
    onChange: (v: "grid" | "lista") => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
    return (
        <div
            className="flex gap-0 p-0.5 rounded-lg bg-surface-2 border border-border-light"
            role="tablist"
            aria-label="Vista del calendario"
        >
            <button
                role="tab"
                aria-selected={value === "grid"}
                aria-controls="calendar-grid-panel"
                onClick={() => onChange("grid")}
                className={[
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-[0.1em] transition-colors duration-150 cursor-pointer",
                    value === "grid"
                        ? "bg-surface-1 text-text-primary shadow-sm border border-border-light"
                        : "text-text-tertiary hover:text-text-secondary",
                ].join(" ")}
            >
                <LayoutGrid size={12} />
                Mensual
            </button>
            <button
                role="tab"
                aria-selected={value === "lista"}
                aria-controls="obligation-list-panel"
                onClick={() => onChange("lista")}
                className={[
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-[0.1em] transition-colors duration-150 cursor-pointer",
                    value === "lista"
                        ? "bg-surface-1 text-text-primary shadow-sm border border-border-light"
                        : "text-text-tertiary hover:text-text-secondary",
                ].join(" ")}
            >
                <List size={12} />
                Lista
            </button>
        </div>
    );
}

"use client";

// MobileFolderPicker — píldora siempre visible que muestra la carpeta activa
// y abre el bottom sheet de carpetas en mobile/tablet (xl:hidden).
//
// Reemplaza al segundo hamburguesa que existía dentro del PageHeader y vivía
// junto al hamburguesa global. Usar dos drawers laterales era confuso para
// usuarios mayores; ahora la navegación de carpetas tiene su propio
// affordance siempre visible y abre desde abajo.

import { ChevronDown, FolderOpen } from "lucide-react";

interface MobileFolderPickerProps {
    folderLabel: string;
    isOpen:      boolean;
    onOpen:      () => void;
}

export function MobileFolderPicker({ folderLabel, isOpen, onOpen }: MobileFolderPickerProps) {
    return (
        <div className="xl:hidden px-4 pt-3 pb-1 bg-surface-2">
            <button
                type="button"
                onClick={onOpen}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-label={`Cambiar carpeta. Carpeta actual: ${folderLabel}`}
                className={[
                    "w-full flex items-center gap-3 min-h-[52px] px-4 py-3",
                    "rounded-xl border border-border-light bg-surface-1 shadow-sm",
                    "text-left transition-colors duration-150",
                    "hover:bg-surface-2 hover:border-border-medium",
                    "active:bg-neutral-100 dark:active:bg-neutral-800",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
                ].join(" ")}
            >
                <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500">
                    <FolderOpen size={16} strokeWidth={2} />
                </span>

                <span className="flex-1 min-w-0 flex flex-col leading-tight">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                        Carpeta
                    </span>
                    <span className="font-mono text-[13px] text-foreground truncate mt-0.5">
                        {folderLabel}
                    </span>
                </span>

                <ChevronDown
                    size={18}
                    strokeWidth={2.2}
                    className={`flex-shrink-0 text-foreground/40 transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                />
            </button>
        </div>
    );
}

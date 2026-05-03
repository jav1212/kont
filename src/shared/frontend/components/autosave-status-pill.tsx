"use client";

// ----------------------------------------------------------------------------
// AutoSaveStatusPill — discreet header chip that surfaces the current state
// of useDebouncedAutoSave. Matches the BCV pill / Company context pill
// chrome so it reads as part of the header toolbar, never content.
//
// "Guardado hace Xs" auto-refreshes every 10 s so the relative timestamp
// stays accurate without remounting the host page.
// ----------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { AlertCircle, Cloud, CloudOff, Loader2 } from "lucide-react";
import type { UseDebouncedAutoSaveResult } from "@/src/shared/frontend/hooks/use-debounced-autosave";

interface Props {
    state: Pick<UseDebouncedAutoSaveResult, "status" | "lastSavedAt" | "error" | "flush">;
    className?: string;
}

export function AutoSaveStatusPill({ state, className = "" }: Props) {
    const { status, lastSavedAt, error, flush } = state;

    // Tick once every 10 s so the "hace Xs" label updates while idle.
    const [, setTick] = useState(0);
    useEffect(() => {
        if (status !== "saved") return;
        const id = setInterval(() => setTick((n) => n + 1), 10_000);
        return () => clearInterval(id);
    }, [status]);

    if (status === "idle") return null;

    const base = [
        "inline-flex items-center gap-2 h-9 px-3 rounded-lg border shadow-sm",
        "font-mono text-[10px] uppercase tracking-[0.18em] font-semibold",
        "max-w-[260px] min-w-0 whitespace-nowrap",
    ].join(" ");

    if (status === "saving") {
        return (
            <div
                className={`${base} border-border-light bg-surface-2 text-foreground ${className}`}
                aria-live="polite"
            >
                <Loader2 size={12} strokeWidth={2.4} className="text-primary-500 animate-spin flex-shrink-0" />
                <span>Guardando…</span>
            </div>
        );
    }

    if (status === "error") {
        return (
            <button
                type="button"
                onClick={() => { void flush(); }}
                className={[
                    base,
                    "border-[var(--badge-error-border)] bg-[var(--badge-error-bg)] text-[var(--text-error)]",
                    "hover:brightness-110 transition-[filter] cursor-pointer",
                    className,
                ].join(" ")}
                title={error ?? "Error al guardar — click para reintentar"}
            >
                <AlertCircle size={12} strokeWidth={2.4} className="flex-shrink-0" />
                <span>Reintentar</span>
            </button>
        );
    }

    if (status === "dirty") {
        return (
            <div className={`${base} border-border-light bg-surface-2 text-[var(--text-tertiary)] ${className}`}>
                <CloudOff size={12} strokeWidth={2.2} className="flex-shrink-0" />
                <span>Sin guardar</span>
            </div>
        );
    }

    // status === "saved"
    return (
        <div
            className={`${base} border-border-light bg-surface-2 text-[var(--text-secondary)] ${className}`}
            aria-live="polite"
        >
            <Cloud size={12} strokeWidth={2.2} className="text-primary-500 flex-shrink-0" />
            <span className="text-foreground">Guardado</span>
            {lastSavedAt && (
                <span className="text-[var(--text-tertiary)] tracking-[0.12em] pl-2 border-l border-border-light">
                    {formatRelative(lastSavedAt)}
                </span>
            )}
        </div>
    );
}

function formatRelative(date: Date): string {
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 5)   return "ahora";
    if (seconds < 60)  return `hace ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)  return `hace ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)    return `hace ${hours}h`;
    return date.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit" });
}

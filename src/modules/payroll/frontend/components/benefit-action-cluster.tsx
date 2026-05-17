"use client";

// Compact toolbar cluster for monthly benefit actions (Cesta Ticket / Bono Socio Económico).
// Renders a single bordered bar:  [icon · LABEL] [💾 borrador] [✓ confirmar] [⤓ pdf]
// Icon-only inner buttons + HeroUI tooltips keep horizontal footprint small without
// sacrificing affordance. Confirmed state swaps the accent for a muted success tint.

import type { ReactNode } from "react";
import { Check, FileDown, Save } from "lucide-react";
import { Tooltip } from "@heroui/react";

interface BenefitActionClusterProps {
    /** Short uppercase label rendered to the left of the action group. */
    label:    string;
    /** Lead icon next to the label (Receipt / Shield etc.). */
    icon:     ReactNode;
    /**
     * Rendering mode.
     * - "full" (default): muestra los tres botones [borrador · confirmar · pdf].
     * - "pdf-only": muestra solo [pdf]. Útil para reportes que no se persisten
     *   en BD (p. ej. Bonificaciones), reusando el chrome visual del cluster.
     */
    mode?: "full" | "pdf-only";
    /** When true, the run for the active period is already confirmed → inputs locked. */
    confirmed?: boolean;
    /** Disabled while the corresponding network call is inflight. */
    saving?:    boolean;
    confirming?: boolean;
    /** Hard-disable everything (no active employees / no company). */
    disabled?: boolean;
    onSaveDraft?: () => void;
    onConfirm?:   () => void;
    onPdf:        () => void;
}

// ── Tooltip styling — matches src/modules/tools/frontend/status patterns ───────
const TOOLTIP_PROPS = {
    delay: 200,
    closeDelay: 50,
    placement: "bottom" as const,
    classNames: {
        base:    "bg-transparent",
        content: "bg-background border border-border-light rounded-lg px-2.5 py-1.5 text-foreground shadow-md",
    },
};

function TooltipLabel({ label, hint }: { label: string; hint?: string }) {
    return (
        <span className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/60">
                {label}
            </span>
            {hint && (
                <span className="font-mono text-[11px] text-foreground">
                    {hint}
                </span>
            )}
        </span>
    );
}

export function BenefitActionCluster({
    label,
    icon,
    mode = "full",
    confirmed = false,
    saving = false,
    confirming = false,
    disabled = false,
    onSaveDraft,
    onConfirm,
    onPdf,
}: BenefitActionClusterProps) {
    const draftDisabled   = disabled || saving     || confirmed;
    const confirmDisabled = disabled || confirming || confirmed;
    const isPdfOnly       = mode === "pdf-only";

    const innerBtn =
        "flex items-center justify-center px-2.5 h-full transition-colors duration-150 " +
        "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 " +
        "disabled:cursor-not-allowed disabled:opacity-40";

    // Texto del tooltip de "Confirmar" (depende del estado).
    const confirmHint = confirmed
        ? "Período ya confirmado · no se puede modificar"
        : confirming
            ? "Confirmando..."
            : `Persiste el ${label.toLowerCase()} y bloquea el período`;

    const draftHint = confirmed
        ? "Período confirmado — borrador no aplica"
        : saving
            ? "Guardando..."
            : "Guarda sin bloquear el período";

    return (
        <div
            className={[
                "flex items-stretch h-8 rounded-lg overflow-hidden shadow-sm",
                "border border-border-light bg-surface-1",
            ].join(" ")}
        >
            {/* Section label */}
            <div className="flex items-center gap-1.5 pl-2.5 pr-3 border-r border-border-light bg-surface-2">
                <span className="text-[var(--text-tertiary)] flex-shrink-0">{icon}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                    {label}
                </span>
            </div>

            {/* Borrador + Confirmar — solo en modo "full" */}
            {!isPdfOnly && (
                <>
                    <Tooltip {...TOOLTIP_PROPS} content={<TooltipLabel label="Guardar borrador" hint={draftHint} />}>
                        <button
                            type="button"
                            onClick={onSaveDraft}
                            disabled={draftDisabled}
                            aria-label="Guardar borrador"
                            className={`${innerBtn} bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2 hover:text-foreground`}
                        >
                            {saving ? (
                                <span className="block w-3 h-3 rounded-full border border-current border-r-transparent animate-spin" />
                            ) : (
                                <Save size={13} />
                            )}
                        </button>
                    </Tooltip>

                    <div className="w-px bg-border-light" aria-hidden />

                    <Tooltip
                        {...TOOLTIP_PROPS}
                        content={
                            <TooltipLabel
                                label={confirmed ? `${label} confirmado` : `Confirmar ${label}`}
                                hint={confirmHint}
                            />
                        }
                    >
                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={confirmDisabled}
                            aria-label={confirmed ? `${label} confirmado` : `Confirmar ${label}`}
                            className={[
                                innerBtn,
                                confirmed
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                    : "bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700",
                            ].join(" ")}
                        >
                            {confirming ? (
                                <span className="block w-3 h-3 rounded-full border border-current border-r-transparent animate-spin" />
                            ) : (
                                <Check size={13} strokeWidth={2.5} />
                            )}
                        </button>
                    </Tooltip>

                    <div className="w-px bg-border-light" aria-hidden />
                </>
            )}

            {/* PDF */}
            <Tooltip
                {...TOOLTIP_PROPS}
                content={<TooltipLabel label="Descargar PDF" hint={`Genera el reporte de ${label.toLowerCase()}`} />}
            >
                <button
                    type="button"
                    onClick={onPdf}
                    disabled={disabled}
                    aria-label={`Descargar PDF ${label}`}
                    className={`${innerBtn} bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2 hover:text-foreground`}
                >
                    <FileDown size={13} />
                </button>
            </Tooltip>
        </div>
    );
}

"use client";

// Compact toolbar cluster for monthly benefit actions (Cesta Ticket / Bono Socio Económico).
// Renders a single bordered bar:  [icon · LABEL] [💾 borrador] [✓ confirmar] [⤓ pdf]
// Icon-only inner buttons + HeroUI tooltips keep horizontal footprint small without
// sacrificing affordance. Confirmed state swaps the accent for a muted success tint.

import { useState, type ReactNode } from "react";
import { BarChart3, Check, ChevronDown, FileDown, FileText, Save, Scissors } from "lucide-react";
import { Tooltip } from "@heroui/react";
import type { ReportMode } from "@/src/shared/frontend/utils/pdf-receipt-chrome";

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
    /**
     * Disparado al elegir una modalidad en el dropdown del botón PDF.
     * Recibe la modalidad seleccionada — general (consolidado), individual
     * (hoja por empleado) o duplicado (oficio cortable Original + Copia).
     */
    onPdf:        (mode: ReportMode) => void;
    /**
     * Hacia dónde se abre el dropdown del PDF respecto al botón.
     * - "right" (default): right-0 → el panel extiende a la IZQUIERDA del botón.
     *   Úsalo en clusters posicionados a la derecha del toolbar.
     * - "left": left-0 → el panel extiende a la DERECHA del botón.
     *   Úsalo en clusters posicionados a la izquierda del toolbar para evitar
     *   que el panel se corte detrás del sidebar.
     */
    pdfMenuPlacement?: "left" | "right";
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
    pdfMenuPlacement = "right",
}: BenefitActionClusterProps) {
    const draftDisabled   = disabled || saving     || confirmed;
    const confirmDisabled = disabled || confirming || confirmed;
    const isPdfOnly       = mode === "pdf-only";
    const [pdfMenuOpen, setPdfMenuOpen] = useState(false);

    const pickMode = (m: ReportMode) => {
        setPdfMenuOpen(false);
        onPdf(m);
    };

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
        <div className="relative">
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

            {/* PDF — botón que abre el dropdown (panel renderizado afuera para no
                quedar recortado por el overflow-hidden del cluster) */}
            <Tooltip
                {...TOOLTIP_PROPS}
                content={<TooltipLabel label="Descargar PDF" hint={`Elige la modalidad del reporte de ${label.toLowerCase()}`} />}
            >
                <button
                    type="button"
                    onClick={() => setPdfMenuOpen((v) => !v)}
                    disabled={disabled}
                    aria-haspopup="menu"
                    aria-expanded={pdfMenuOpen}
                    aria-label={`Descargar PDF ${label}`}
                    className={`${innerBtn} bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2 hover:text-foreground gap-1`}
                >
                    <FileDown size={13} />
                    <ChevronDown size={11} strokeWidth={2} />
                </button>
            </Tooltip>
        </div>
        {/* Dropdown panel — sibling del cluster bar, anclado al wrapper relative
            que envuelve todo. Así no lo recorta el overflow-hidden de arriba. */}
        {pdfMenuOpen && (
            <>
                <div className="fixed inset-0 z-40" onClick={() => setPdfMenuOpen(false)} />
                <div className={`absolute ${pdfMenuPlacement === "left" ? "left-0" : "right-0"} top-full mt-1.5 z-50 rounded-xl border border-border-light bg-surface-1 shadow-lg p-1 min-w-[320px]`}>
                    <button
                        type="button"
                        onClick={() => pickMode("general")}
                        className="flex items-start gap-2.5 w-full px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors duration-150 hover:bg-surface-2"
                    >
                        <BarChart3 size={13} strokeWidth={1.8} className="mt-1 text-[var(--text-secondary)] shrink-0" />
                        <div className="min-w-0">
                            <div className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">General</div>
                            <div className="font-sans text-[11px] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                                Reporte consolidado con todos los empleados en un solo documento
                            </div>
                        </div>
                    </button>
                    <div className="my-1 border-t border-border-light" />
                    <button
                        type="button"
                        onClick={() => pickMode("individual")}
                        className="flex items-start gap-2.5 w-full px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors duration-150 hover:bg-surface-2"
                    >
                        <FileText size={13} strokeWidth={1.8} className="mt-1 text-[var(--text-secondary)] shrink-0" />
                                <div className="min-w-0">
                                    <div className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">Hoja por empleado</div>
                                    <div className="font-sans text-[11px] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                                        A4 · 1 página completa por empleado, con firma
                                    </div>
                                </div>
                            </button>
                            <div className="my-1 border-t border-border-light" />
                            <button
                                type="button"
                                onClick={() => pickMode("duplicado")}
                                className="flex items-start gap-2.5 w-full px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors duration-150 hover:bg-surface-2"
                            >
                                <Scissors size={13} strokeWidth={1.8} className="mt-1 text-primary-500 shrink-0" />
                                <div className="min-w-0">
                                    <div className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">Cortable</div>
                                    <div className="font-sans text-[11px] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                                        Oficio · 2 copias por hoja (Original + Copia) con línea de corte
                                    </div>
                                </div>
                            </button>
                        </div>
                    </>
                )}
        </div>
    );
}

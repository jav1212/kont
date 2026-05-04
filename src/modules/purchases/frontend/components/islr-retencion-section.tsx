"use client";

// IslrRetencionSection — sección compacta para configurar la retención de
// ISLR a nivel de cabecera de factura (Decreto 1808 + Anexo 6.1 SENIAT).
//
// El usuario:
//   1. Selecciona un concepto del catálogo (búsqueda por código o descripción).
//   2. Ajusta la base imponible (default: subtotal sin IVA).
//   3. Ajusta la U.T. (default: 9 Bs — actualizable por empresa más adelante).
//   4. El componente calcula `sustraendo` y `monto` con `computeIslrRetention`.
//
// El monto se publica al padre cada vez que cambia para que se persista junto
// con la factura. El server recomputa autoritativamente al guardar (mig 091).

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
    listIslrConceptsForPurchases,
    getIslrConcept,
    computeIslrRetention,
    TAXPAYER_TYPE_LABELS,
    type IslrConcept,
} from "@/src/modules/purchases/backend/domain/concepto-islr";

export interface IslrFormValue {
    concepto:         string | null;
    porcentaje:       number;
    baseRetencion:    number;
    sustraendo:       number;
    monto:            number;
    unidadTributaria: number;
}

export function emptyIslrValue(): IslrFormValue {
    return {
        concepto:         null,
        porcentaje:       0,
        baseRetencion:    0,
        sustraendo:       0,
        monto:            0,
        unidadTributaria: 9, // valor más reciente publicado en G.O. (Bs 9). Configurable.
    };
}

interface Props {
    value:        IslrFormValue;
    onChange:     (next: IslrFormValue) => void;
    /** Base sugerida cuando se selecciona el concepto sin haber tocado la base. */
    defaultBase?: number;
    readOnly?:    boolean;
}

const fieldCls = [
    "h-9 px-2.5 rounded border border-border-light bg-surface-1 outline-none",
    "font-mono text-[12px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors",
].join(" ");

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Component ────────────────────────────────────────────────────────────────

export function IslrRetencionSection({ value, onChange, defaultBase, readOnly }: Props) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const concept = value.concepto ? getIslrConcept(value.concepto) : null;

    // Recalcular monto/sustraendo cuando cambia concepto, base o UT.
    useEffect(() => {
        if (!concept) {
            if (value.monto !== 0 || value.sustraendo !== 0 || value.porcentaje !== 0) {
                onChange({ ...value, porcentaje: 0, sustraendo: 0, monto: 0 });
            }
            return;
        }
        const result = computeIslrRetention({
            base:             value.baseRetencion,
            concept,
            unidadTributaria: value.unidadTributaria,
        });
        if (
            result.porcentaje !== value.porcentaje ||
            result.sustraendo !== value.sustraendo ||
            result.monto      !== value.monto
        ) {
            onChange({
                ...value,
                porcentaje: result.porcentaje,
                sustraendo: result.sustraendo,
                monto:      result.monto,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value.concepto, value.baseRetencion, value.unidadTributaria]);

    // Sugerir base al seleccionar concepto cuando todavía está en 0.
    function handleSelectConcept(code: string) {
        const c = getIslrConcept(code);
        if (!c) return;
        const nextBase = value.baseRetencion > 0 ? value.baseRetencion : (defaultBase ?? 0);
        onChange({
            ...value,
            concepto:      code,
            porcentaje:    c.percentage,
            baseRetencion: nextBase,
        });
        setPickerOpen(false);
    }

    function handleClear() {
        onChange(emptyIslrValue());
        setPickerOpen(false);
    }

    function handleBaseChange(v: string) {
        const n = parseFloat(v.replace(/,/g, ".")) || 0;
        onChange({ ...value, baseRetencion: n });
    }

    function handleUtChange(v: string) {
        const n = parseFloat(v.replace(/,/g, ".")) || 0;
        onChange({ ...value, unidadTributaria: n });
    }

    // Razón de "monto = 0" cuando hay concepto pero no hubo retención efectiva.
    const skipReason = useMemo(() => {
        if (!concept || value.baseRetencion <= 0) return null;
        const r = computeIslrRetention({
            base:             value.baseRetencion,
            concept,
            unidadTributaria: value.unidadTributaria,
        });
        return r.skippedReason ?? null;
    }, [concept, value.baseRetencion, value.unidadTributaria]);

    return (
        <div className="space-y-3">
            {/* Header label */}
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
                    Retención ISLR — Decreto 1808
                </span>
                {concept && !readOnly && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] hover:text-error transition-colors"
                    >
                        <X size={11} strokeWidth={2} />
                        Quitar
                    </button>
                )}
            </div>

            {/* Concept picker */}
            {!concept ? (
                readOnly ? (
                    <div className="text-[12px] font-sans text-[var(--text-tertiary)] italic">
                        Sin retención ISLR.
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 h-9 rounded border border-dashed border-border-medium text-[12px] text-[var(--text-secondary)] hover:border-warning/60 hover:text-warning transition-colors"
                    >
                        <Search size={12} strokeWidth={2} />
                        Seleccionar concepto…
                    </button>
                )
            ) : (
                <ConceptCard concept={concept} onChange={() => !readOnly && setPickerOpen(true)} readOnly={readOnly} />
            )}

            {/* Inputs (base + UT) */}
            {concept && (
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1">
                            Base imponible (Bs)
                        </label>
                        {readOnly ? (
                            <div className={`${fieldCls} bg-surface-2 flex items-center justify-end`}>
                                {fmtN(value.baseRetencion)}
                            </div>
                        ) : (
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={value.baseRetencion === 0 ? "" : String(value.baseRetencion)}
                                placeholder="0.00"
                                onChange={(e) => handleBaseChange(e.target.value)}
                                className={`${fieldCls} w-full text-right`}
                            />
                        )}
                    </div>
                    <div>
                        <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1">
                            U.T. (Bs)
                            <span className="ml-1 normal-case tracking-normal text-[9px] text-[var(--text-tertiary)] opacity-70">
                                — sólo PNR
                            </span>
                        </label>
                        {readOnly ? (
                            <div className={`${fieldCls} bg-surface-2 flex items-center justify-end`}>
                                {fmtN(value.unidadTributaria)}
                            </div>
                        ) : (
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={value.unidadTributaria === 0 ? "" : String(value.unidadTributaria)}
                                placeholder="9.00"
                                onChange={(e) => handleUtChange(e.target.value)}
                                disabled={!concept.appliesSustraendo}
                                className={`${fieldCls} w-full text-right ${!concept.appliesSustraendo ? "opacity-50" : ""}`}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Result preview */}
            {concept && value.baseRetencion > 0 && (
                <div className="px-3 py-2.5 rounded border border-warning/20 bg-warning/[0.05] space-y-1">
                    <div className="flex justify-between font-mono text-[11px]">
                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                            Alícuota
                        </span>
                        <span className="text-foreground tabular-nums">
                            {fmtN(value.porcentaje)} %
                        </span>
                    </div>
                    {value.sustraendo > 0 && (
                        <div className="flex justify-between font-mono text-[11px]">
                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                                Sustraendo
                                <span className="ml-1 normal-case tracking-normal text-[9px] opacity-70">
                                    UT × % × 83,3334
                                </span>
                            </span>
                            <span className="text-[var(--text-secondary)] tabular-nums">
                                Bs. {fmtN(value.sustraendo)}
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between font-mono text-[12px] pt-1 border-t border-warning/20">
                        <span className="font-bold text-warning uppercase tracking-[0.12em]">
                            Monto a retener
                        </span>
                        <span className="font-bold text-warning tabular-nums">
                            Bs. {fmtN(value.monto)}
                        </span>
                    </div>
                    {skipReason && (
                        <div className="pt-1 text-[10px] font-sans text-[var(--text-tertiary)] italic">
                            {skipReason === "below-min-pjd" && (
                                <>El monto calculado no supera el mínimo legal del concepto (Bs. {fmtN(concept.minThresholdBs ?? 0)}). No se retiene.</>
                            )}
                            {skipReason === "sustraendo-mayor-base" && (
                                <>El sustraendo supera al monto bruto — sin retención efectiva (Decreto 1808 Art. 9 §2).</>
                            )}
                            {skipReason === "tariff-not-supported" && (
                                <>Concepto PJND con tramos progresivos (15/22/34%) — configura el % manualmente.</>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Picker modal */}
            {pickerOpen && (
                <ConceptPickerModal
                    selected={value.concepto}
                    onSelect={handleSelectConcept}
                    onClose={() => setPickerOpen(false)}
                />
            )}
        </div>
    );
}

// ── Concept card (selected) ──────────────────────────────────────────────────

function ConceptCard({
    concept,
    onChange,
    readOnly,
}: {
    concept: IslrConcept;
    onChange: () => void;
    readOnly?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onChange}
            disabled={readOnly}
            className={[
                "w-full px-3 py-2 rounded border border-border-light bg-surface-2 text-left",
                readOnly ? "cursor-default" : "hover:border-warning/40 transition-colors",
            ].join(" ")}
        >
            <div className="flex items-center gap-2 mb-0.5">
                <span className="px-1.5 py-0.5 rounded bg-warning/10 border border-warning/30 font-mono text-[10px] tabular-nums text-warning font-bold tracking-wider">
                    {concept.code}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--text-tertiary)]">
                    {TAXPAYER_TYPE_LABELS[concept.taxpayerType]}
                </span>
                <span className="ml-auto font-mono text-[11px] tabular-nums text-foreground font-bold">
                    {concept.percentage}%
                </span>
            </div>
            <div className="text-[12px] font-sans text-foreground leading-snug">
                {concept.description}
            </div>
            {concept.notes && (
                <div className="mt-0.5 text-[10px] font-sans text-[var(--text-tertiary)] italic">
                    {concept.notes}
                </div>
            )}
        </button>
    );
}

// ── Picker Modal ─────────────────────────────────────────────────────────────

function ConceptPickerModal({
    selected,
    onSelect,
    onClose,
}: {
    selected: string | null;
    onSelect: (code: string) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");

    const concepts = useMemo(() => listIslrConceptsForPurchases(), []);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return concepts;
        return concepts.filter((c) =>
            c.code.includes(q) ||
            c.description.toLowerCase().includes(q) ||
            TAXPAYER_TYPE_LABELS[c.taxpayerType].toLowerCase().includes(q)
        );
    }, [concepts, query]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-surface-1 border border-border-medium rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="px-5 py-3 border-b border-border-light flex items-center justify-between gap-3">
                    <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                        Concepto de Retención ISLR
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X size={14} strokeWidth={2} />
                    </button>
                </div>

                <div className="px-5 py-3 border-b border-border-light">
                    <div className="relative">
                        <Search size={13} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar por código (ej. 002), descripción o tipo de contribuyente…"
                            autoFocus
                            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[12px] text-foreground focus:border-primary-500/60 transition-colors"
                        />
                    </div>
                    <div className="mt-2 text-[10px] font-sans text-[var(--text-tertiary)]">
                        {filtered.length} {filtered.length === 1 ? "concepto" : "conceptos"} · base legal: Decreto 1808 Anexo 6.1
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-2 py-2">
                    {filtered.length === 0 ? (
                        <div className="px-5 py-12 text-center font-sans text-[12px] text-[var(--text-tertiary)]">
                            Ningún concepto coincide con el filtro.
                        </div>
                    ) : (
                        <ul className="divide-y divide-border-light/50">
                            {filtered.map((c) => {
                                const isSelected = selected === c.code;
                                return (
                                    <li key={c.code}>
                                        <button
                                            type="button"
                                            onClick={() => onSelect(c.code)}
                                            className={[
                                                "w-full px-3 py-2.5 text-left transition-colors group",
                                                isSelected
                                                    ? "bg-warning/[0.08]"
                                                    : "hover:bg-surface-2",
                                            ].join(" ")}
                                        >
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className={[
                                                    "px-1.5 py-0.5 rounded font-mono text-[10px] tabular-nums font-bold tracking-wider",
                                                    isSelected
                                                        ? "bg-warning/20 border border-warning/40 text-warning"
                                                        : "bg-surface-2 border border-border-light text-[var(--text-secondary)]",
                                                ].join(" ")}>
                                                    {c.code}
                                                </span>
                                                <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--text-tertiary)]">
                                                    {TAXPAYER_TYPE_LABELS[c.taxpayerType]}
                                                </span>
                                                {c.appliesSustraendo && (
                                                    <span className="px-1 py-0.5 rounded bg-info/10 border border-info/20 font-mono text-[9px] uppercase tracking-[0.10em] text-info">
                                                        Sustraendo
                                                    </span>
                                                )}
                                                {c.progressiveTariff && (
                                                    <span className="px-1 py-0.5 rounded bg-error/10 border border-error/20 font-mono text-[9px] uppercase tracking-[0.10em] text-error">
                                                        Tramos
                                                    </span>
                                                )}
                                                <span className="ml-auto font-mono text-[11px] tabular-nums text-foreground font-bold">
                                                    {c.percentage > 0 ? `${c.percentage}%` : "—"}
                                                </span>
                                            </div>
                                            <div className="text-[12px] font-sans text-foreground leading-snug">
                                                {c.description}
                                            </div>
                                            {c.notes && (
                                                <div className="mt-0.5 text-[10px] font-sans text-[var(--text-tertiary)] italic">
                                                    {c.notes}
                                                </div>
                                            )}
                                            {c.minThresholdBs != null && (
                                                <div className="mt-0.5 text-[10px] font-sans text-[var(--text-tertiary)]">
                                                    Mínimo Bs. {c.minThresholdBs.toLocaleString("es-VE")}
                                                </div>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

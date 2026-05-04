"use client";

// IgtfPerceptionSection — sección que el SPE marca cuando recibe pago en
// divisa/cripto. Calcula el 3% IGTF a percibir y lo SUMA al total a cobrar.
//
// Base legal: PA SNAT/2022/000013 (G.O. 42.339, 17/03/2022). El SPE designado
// como agente de percepción debe percibir 3% al cliente y enterárlo
// quincenalmente vía Forma 99021 en el Portal Fiscal SENIAT.
//
// 7 conceptos del Art. 4 (Reforma G.O. 6.687) que debe declarar el agente.

import { useEffect } from "react";
import { IGTF_CONCEPTS, IGTF_CONCEPT_LABELS, type IgtfConcept } from "@/src/modules/sales/backend/domain/sales-invoice";

export interface IgtfPerceptionFormValue {
    applies:    boolean;
    concept:    IgtfConcept | null;
    percentage: number;
    foreignBase: number;
    localBase:  number;
    amount:     number;
}

export function emptyIgtfPerceptionValue(): IgtfPerceptionFormValue {
    return {
        applies:     false,
        concept:    null,
        percentage: 3,
        foreignBase: 0,
        localBase:  0,
        amount:     0,
    };
}

interface Props {
    value:       IgtfPerceptionFormValue;
    onChange:    (next: IgtfPerceptionFormValue) => void;
    /** Tasa BCV USD→Bs. Sin tasa, la sección queda en advertencia. */
    dollarRate:  number | null;
    readOnly?:   boolean;
}

const fieldCls = [
    "h-9 px-2.5 rounded border border-border-light bg-surface-1 outline-none",
    "font-mono text-[12px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors",
].join(" ");

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtUsd = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function IgtfPerceptionSection({ value, onChange, dollarRate, readOnly }: Props) {
    useEffect(() => {
        if (!value.applies) {
            if (value.localBase !== 0 || value.amount !== 0) {
                onChange({ ...value, localBase: 0, amount: 0 });
            }
            return;
        }
        const rate      = dollarRate ?? 0;
        const localBase = round2(value.foreignBase * rate);
        const amount    = round2(localBase * value.percentage / 100);
        if (localBase !== value.localBase || amount !== value.amount) {
            onChange({ ...value, localBase, amount });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value.applies, value.foreignBase, value.percentage, dollarRate]);

    function handleToggle(next: boolean) {
        if (next === value.applies) return;
        onChange({
            ...value,
            applies: next,
            // Default concept to "efectivo" the first time it's activated
            concept: next ? (value.concept ?? 'efectivo') : value.concept,
        });
    }

    function handleBaseChange(v: string) {
        const n = parseFloat(v.replace(/,/g, ".")) || 0;
        onChange({ ...value, foreignBase: n });
    }

    function handlePctChange(v: string) {
        const n = parseFloat(v.replace(/,/g, ".")) || 0;
        onChange({ ...value, percentage: Math.max(0, Math.min(100, n)) });
    }

    function handleConceptChange(c: IgtfConcept) {
        onChange({ ...value, concept: c });
    }

    const noRate = !dollarRate || dollarRate <= 0;

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-info">
                    IGTF Percepción — Cobro en divisa
                </span>
                {!readOnly && (
                    <div className="inline-flex rounded-md border border-border-light bg-surface-1 p-0.5">
                        {[
                            { label: "No aplica", on: false },
                            { label: "Aplica",    on: true },
                        ].map((opt) => (
                            <button
                                key={opt.label}
                                type="button"
                                onClick={() => handleToggle(opt.on)}
                                className={[
                                    "h-7 px-2.5 rounded text-[11px] font-mono uppercase tracking-[0.10em] transition-colors",
                                    opt.on === value.applies
                                        ? "bg-info/15 text-info border border-info/30 font-bold"
                                        : "text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 border border-transparent",
                                ].join(" ")}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {!value.applies && readOnly && (
                <div className="text-[12px] font-sans text-[var(--text-tertiary)] italic">
                    Sin IGTF percibido.
                </div>
            )}

            {value.applies && (
                <>
                    {/* Concepto */}
                    <div>
                        <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1.5">
                            Concepto del cobro (Art. 4 LIGTF)
                        </label>
                        {readOnly ? (
                            <div className={`${fieldCls} bg-surface-2 flex items-center`}>
                                {value.concept ? IGTF_CONCEPT_LABELS[value.concept] : "—"}
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {IGTF_CONCEPTS.map((c) => {
                                    const active = value.concept === c;
                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => handleConceptChange(c)}
                                            className={[
                                                "px-2.5 h-7 rounded border font-mono text-[11px] uppercase tracking-[0.10em] transition-colors",
                                                active
                                                    ? "bg-info/15 text-info border-info/40 font-bold"
                                                    : "bg-surface-1 text-[var(--text-tertiary)] border-border-light hover:text-foreground hover:border-border-medium",
                                            ].join(" ")}
                                        >
                                            {IGTF_CONCEPT_LABELS[c]}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Inputs */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1">
                                Monto cobrado en divisa (USD)
                            </label>
                            {readOnly ? (
                                <div className={`${fieldCls} bg-surface-2 flex items-center justify-end`}>
                                    {fmtUsd(value.foreignBase)}
                                </div>
                            ) : (
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={value.foreignBase === 0 ? "" : String(value.foreignBase)}
                                    placeholder="0.00"
                                    onChange={(e) => handleBaseChange(e.target.value)}
                                    className={`${fieldCls} w-full text-right`}
                                />
                            )}
                        </div>
                        <div>
                            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1">
                                Alícuota
                                <span className="ml-1 normal-case tracking-normal text-[9px] opacity-70">— 3% vigente</span>
                            </label>
                            {readOnly ? (
                                <div className={`${fieldCls} bg-surface-2 flex items-center justify-end`}>
                                    {fmtN(value.percentage)} %
                                </div>
                            ) : (
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    value={value.percentage === 0 ? "" : String(value.percentage)}
                                    placeholder="3.00"
                                    onChange={(e) => handlePctChange(e.target.value)}
                                    className={`${fieldCls} w-full text-right`}
                                />
                            )}
                        </div>
                    </div>

                    {/* Result */}
                    <div className="px-3 py-2.5 rounded border border-info/20 bg-info/[0.05] space-y-1">
                        {noRate ? (
                            <div className="text-[11px] font-sans text-error italic">
                                Falta la tasa BCV — no se puede convertir a Bs.
                            </div>
                        ) : (
                            <>
                                <div className="flex justify-between font-mono text-[11px]">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                                        Tasa BCV aplicada
                                    </span>
                                    <span className="text-foreground tabular-nums">
                                        Bs. {fmtN(dollarRate ?? 0)} / USD
                                    </span>
                                </div>
                                <div className="flex justify-between font-mono text-[11px]">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                                        Base imponible
                                    </span>
                                    <span className="text-[var(--text-secondary)] tabular-nums">
                                        Bs. {fmtN(value.localBase)}
                                    </span>
                                </div>
                            </>
                        )}
                        <div className="flex justify-between font-mono text-[12px] pt-1 border-t border-info/20">
                            <span className="font-bold text-info uppercase tracking-[0.12em]">
                                Monto a percibir
                            </span>
                            <span className="font-bold text-info tabular-nums">
                                Bs. {fmtN(value.amount)}
                            </span>
                        </div>
                        <div className="pt-1 text-[10px] font-sans text-[var(--text-tertiary)] italic leading-snug">
                            Como SPE designado como agente de percepción, debes cobrar el IGTF al
                            cliente y enterárselo a SENIAT quincenalmente (Forma 99021).
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function round2(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

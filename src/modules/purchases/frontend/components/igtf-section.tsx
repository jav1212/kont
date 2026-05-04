"use client";

// IgtfSection — sección compacta para registrar el IGTF cargado por el
// proveedor o el banco cuando la factura se paga en divisa o cripto.
//
// Reforma vigente: G.O. Extraordinaria N° 6.687 del 25/02/2022 + PA
// SNAT/2022/000013. Alícuota 3% sobre divisas/cripto. Para el SPE comprador
// es informativo (gasto no deducible Art. 18 LIGTF) — el banco/proveedor lo
// entera al SENIAT. Aquí se registra para trazabilidad y para cuadrar el
// total a pagar con la factura del proveedor.
//
// Cálculo: monto = baseDivisa × tasaDolar × pct/100. El frontend computa la
// preview en vivo; el server recomputa autoritativamente al guardar (mig 093).

import { useEffect } from "react";

export interface IgtfFormValue {
    aplica:      boolean;
    porcentaje:  number;
    baseDivisa:  number;
    baseBs:      number;
    monto:       number;
}

export function emptyIgtfValue(): IgtfFormValue {
    return {
        aplica:     false,
        porcentaje: 3, // alícuota vigente para divisas/cripto
        baseDivisa: 0,
        baseBs:     0,
        monto:      0,
    };
}

interface Props {
    value:        IgtfFormValue;
    onChange:     (next: IgtfFormValue) => void;
    /** Tasa BCV para convertir divisa → Bs. Cuando es null, se deshabilita la sección. */
    dollarRate:   number | null;
    readOnly?:    boolean;
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

export function IgtfSection({ value, onChange, dollarRate, readOnly }: Props) {
    // Recalcular base Bs y monto cuando cambian baseDivisa, %, o tasa.
    useEffect(() => {
        if (!value.aplica) {
            if (value.baseBs !== 0 || value.monto !== 0) {
                onChange({ ...value, baseBs: 0, monto: 0 });
            }
            return;
        }
        const rate    = dollarRate ?? 0;
        const baseBs  = round2(value.baseDivisa * rate);
        const monto   = round2(baseBs * value.porcentaje / 100);
        if (baseBs !== value.baseBs || monto !== value.monto) {
            onChange({ ...value, baseBs, monto });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value.aplica, value.baseDivisa, value.porcentaje, dollarRate]);

    function handleToggle(next: boolean) {
        if (next === value.aplica) return;
        onChange({ ...value, aplica: next });
    }

    function handleBaseChange(v: string) {
        const n = parseFloat(v.replace(/,/g, ".")) || 0;
        onChange({ ...value, baseDivisa: n });
    }

    function handlePctChange(v: string) {
        const n = parseFloat(v.replace(/,/g, ".")) || 0;
        onChange({ ...value, porcentaje: Math.max(0, Math.min(100, n)) });
    }

    const noRate = !dollarRate || dollarRate <= 0;

    return (
        <div className="space-y-3">
            {/* Header label + toggle */}
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-info">
                    IGTF — Pago en divisa
                </span>
                {!readOnly && (
                    <div className="inline-flex rounded-md border border-border-light bg-surface-1 p-0.5">
                        {[
                            { label: "No aplica", active: !value.aplica, on: false },
                            { label: "Aplica",    active:  value.aplica, on: true  },
                        ].map((opt) => (
                            <button
                                key={opt.label}
                                type="button"
                                onClick={() => handleToggle(opt.on)}
                                className={[
                                    "h-7 px-2.5 rounded text-[11px] font-mono uppercase tracking-[0.10em] transition-colors",
                                    opt.active
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

            {!value.aplica && readOnly && (
                <div className="text-[12px] font-sans text-[var(--text-tertiary)] italic">
                    Sin IGTF.
                </div>
            )}

            {value.aplica && (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1">
                                Monto pagado en divisa (USD)
                            </label>
                            {readOnly ? (
                                <div className={`${fieldCls} bg-surface-2 flex items-center justify-end`}>
                                    {fmtUsd(value.baseDivisa)}
                                </div>
                            ) : (
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={value.baseDivisa === 0 ? "" : String(value.baseDivisa)}
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
                                    {fmtN(value.porcentaje)} %
                                </div>
                            ) : (
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    value={value.porcentaje === 0 ? "" : String(value.porcentaje)}
                                    placeholder="3.00"
                                    onChange={(e) => handlePctChange(e.target.value)}
                                    className={`${fieldCls} w-full text-right`}
                                />
                            )}
                        </div>
                    </div>

                    {/* Result preview */}
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
                                        <span className="ml-1 normal-case tracking-normal text-[9px] opacity-70">
                                            USD × tasa
                                        </span>
                                    </span>
                                    <span className="text-[var(--text-secondary)] tabular-nums">
                                        Bs. {fmtN(value.baseBs)}
                                    </span>
                                </div>
                            </>
                        )}
                        <div className="flex justify-between font-mono text-[12px] pt-1 border-t border-info/20">
                            <span className="font-bold text-info uppercase tracking-[0.12em]">
                                Monto IGTF
                            </span>
                            <span className="font-bold text-info tabular-nums">
                                Bs. {fmtN(value.monto)}
                            </span>
                        </div>
                        <div className="pt-1 text-[10px] font-sans text-[var(--text-tertiary)] italic leading-snug">
                            El IGTF lo entera el banco o el proveedor SPE — para el comprador es gasto
                            no deducible (Art. 18 LIGTF). Se suma al total a pagar porque el proveedor
                            lo factura como concepto adicional.
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

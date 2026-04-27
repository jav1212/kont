"use client";

// PeriodoContableInput — selector de período contable (YYYY-MM) para facturas.
// Default: el mes de la fecha de la factura. Si el usuario lo cambia, el flag
// `periodoManual` se marca true y se respeta tal cual al persistir.
//
// La fecha sigue manejando la consulta BCV; este input define en qué mes
// contable entran las entradas de inventario al confirmar la factura.

import { useEffect, useState } from "react";

interface Props {
    /** YYYY-MM-DD — fecha de la factura. */
    fecha: string;
    /** YYYY-MM — período contable elegido (puede diferir del mes de fecha). */
    periodo: string;
    /** Si true, el usuario eligió un período distinto al mes de la fecha. */
    periodoManual: boolean;
    onChange: (periodo: string, periodoManual: boolean) => void;
    readOnly?: boolean;
}

const labelCls =
    "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

const fieldCls =
    "w-full h-10 px-3 rounded-lg border border-border-default bg-surface-1 outline-none font-mono text-[14px] text-foreground tabular-nums focus:border-primary-500 hover:border-border-medium transition-colors duration-150";

function defaultPeriodFromDate(fecha: string): string {
    return fecha?.length >= 7 ? fecha.slice(0, 7) : "";
}

export function PeriodoContableInput({ fecha, periodo, periodoManual, onChange, readOnly }: Props) {
    const dateMonth = defaultPeriodFromDate(fecha);
    const effectivePeriod = periodo || dateMonth;
    const [showHint, setShowHint] = useState(false);

    // Si la fecha cambia y el usuario NO ha hecho un override manual,
    // sincronizamos el período con el mes de la fecha.
    useEffect(() => {
        if (!periodoManual && dateMonth && periodo !== dateMonth) {
            onChange(dateMonth, false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateMonth, periodoManual]);

    const isOverridden = periodoManual && effectivePeriod !== dateMonth;

    if (readOnly) {
        return (
            <div>
                <label className={labelCls}>Período contable</label>
                <div className="flex items-center gap-2 h-10">
                    <span className="font-mono text-[14px] text-foreground tabular-nums">
                        {effectivePeriod || "—"}
                    </span>
                    {isOverridden && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 font-mono text-[10px] uppercase tracking-[0.12em] font-bold">
                            Manual
                        </span>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div>
            <label className={labelCls}>
                Período contable
                <button
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setShowHint(true)}
                    onMouseLeave={() => setShowHint(false)}
                    onFocus={() => setShowHint(true)}
                    onBlur={() => setShowHint(false)}
                    className="ml-1.5 inline-flex h-3 w-3 items-center justify-center rounded-full border border-[var(--text-tertiary)]/40 text-[8px] text-[var(--text-tertiary)] hover:text-foreground hover:border-foreground transition-colors align-middle"
                    aria-label="Información sobre período contable"
                >
                    ?
                </button>
            </label>
            <div className="relative">
                <input
                    type="month"
                    className={fieldCls}
                    value={effectivePeriod}
                    onChange={(e) => {
                        const v = e.target.value;
                        const manual = v !== dateMonth;
                        onChange(v, manual);
                    }}
                />
                {isOverridden && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 font-mono text-[9px] uppercase tracking-[0.12em] font-bold pointer-events-none">
                        Manual
                    </span>
                )}
            </div>
            {showHint && (
                <p className="mt-1 text-[11px] font-sans text-[var(--text-tertiary)] leading-snug">
                    La fecha define la tasa BCV. El período define a qué mes contable entran las entradas al confirmar.
                </p>
            )}
            {!periodoManual && fecha && effectivePeriod !== dateMonth && (
                <p className="mt-1 text-[11px] font-sans text-amber-600">
                    El período no coincide con el mes de la fecha.
                </p>
            )}
        </div>
    );
}

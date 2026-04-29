"use client";

// LineAdjustmentsPanel — UI compacta de los ajustes por línea (descuento,
// recargo). Cada uno por monto Bs o porcentaje.
//
// Pensado para colocarlo dentro de un panel colapsable por fila en pantallas
// de movimientos manuales (entrada manual, ajustes, devoluciones).

import { useEffect, useState } from "react";
import type { LineAdjustments, AdjustmentKind } from "@/src/modules/inventory/shared/totals";

interface Props {
    value: LineAdjustments;
    onChange: (next: LineAdjustments) => void;
    showResolved?: { descuentoMonto?: number; recargoMonto?: number; baseIVA?: number };
    readOnly?: boolean;
    title?: string;
}

interface RowProps {
    label:    string;
    accent:   "negative" | "warning";
    tipo:     AdjustmentKind | null;
    valor:    number;
    onTipoChange:  (v: AdjustmentKind | null) => void;
    onValorChange: (v: number) => void;
    readOnly?: boolean;
}

function Row({ label, accent, tipo, valor, onTipoChange, onValorChange, readOnly }: RowProps) {
    const accentCls =
        accent === "negative" ? "text-error/80" : "text-amber-600";

    // Local string state so the user can type "5," / "5." mid-typing without
    // the controlled value snapping back to "5". We only resync from parent
    // when its `valor` diverges from what our text already represents (e.g.
    // initial load, reset).
    const [text, setText] = useState<string>(() =>
        !tipo || valor === 0 ? "" : String(valor).replace(".", ","),
    );

    useEffect(() => {
        if (!tipo) { setText(""); return; }
        const own = parseFloat(text.replace(",", "."));
        const owned = Number.isFinite(own) ? own : 0;
        if (Math.abs(owned - valor) > 1e-9) {
            setText(valor === 0 ? "" : String(valor).replace(".", ","));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [valor, tipo]);

    return (
        <div className="flex items-center gap-2">
            <span className={`min-w-[88px] font-mono text-[10px] uppercase tracking-[0.12em] ${accentCls}`}>
                {label}
            </span>
            <select
                disabled={readOnly}
                value={tipo ?? ""}
                onChange={(e) => onTipoChange((e.target.value || null) as AdjustmentKind | null)}
                className="h-7 px-1.5 rounded border border-border-light bg-surface-1 outline-none font-mono text-[11px] text-foreground focus:border-primary-500/60 disabled:opacity-60 transition-colors"
            >
                <option value="">—</option>
                <option value="porcentaje">%</option>
                <option value="monto">Bs</option>
            </select>
            <input
                type="text"
                inputMode="decimal"
                disabled={readOnly || !tipo}
                value={tipo ? text : ""}
                onChange={(e) => {
                    const raw = e.target.value;
                    if (!/^\d*[.,]?\d*$/.test(raw)) return;
                    setText(raw);
                    const parsed = parseFloat(raw.replace(",", "."));
                    onValorChange(Number.isFinite(parsed) ? parsed : 0);
                }}
                placeholder={tipo === "porcentaje" ? "0,00 %" : tipo === "monto" ? "0,00 Bs" : ""}
                className="w-24 h-7 px-2 rounded border border-border-light bg-surface-1 outline-none font-mono text-[11px] text-foreground tabular-nums text-right disabled:opacity-40 disabled:cursor-not-allowed focus:border-primary-500/60 transition-colors"
            />
        </div>
    );
}

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function LineAdjustmentsPanel({ value, onChange, showResolved, readOnly, title }: Props) {
    function update<K extends keyof LineAdjustments>(key: K, val: LineAdjustments[K]) {
        onChange({ ...value, [key]: val });
    }

    return (
        <div className="space-y-2">
            {title && (
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-1">
                    {title}
                </div>
            )}
            <Row
                label="Descuento"
                accent="negative"
                tipo={value.descuentoTipo}
                valor={value.descuentoValor}
                onTipoChange={(v) => update("descuentoTipo", v)}
                onValorChange={(v) => update("descuentoValor", v)}
                readOnly={readOnly}
            />
            <Row
                label="Recargo"
                accent="warning"
                tipo={value.recargoTipo}
                valor={value.recargoValor}
                onTipoChange={(v) => update("recargoTipo", v)}
                onValorChange={(v) => update("recargoValor", v)}
                readOnly={readOnly}
            />
            {showResolved && (
                <div className="pt-2 border-t border-border-light/40 flex items-center flex-wrap gap-3 font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                    {(showResolved.descuentoMonto ?? 0) > 0 && (
                        <span>− Desc: <span className="text-error/80 tabular-nums">{fmtN(showResolved.descuentoMonto ?? 0)}</span></span>
                    )}
                    {(showResolved.recargoMonto ?? 0) > 0 && (
                        <span>+ Rec: <span className="text-amber-600 tabular-nums">{fmtN(showResolved.recargoMonto ?? 0)}</span></span>
                    )}
                    {(showResolved.baseIVA ?? 0) > 0 && (
                        <span>= Base IVA: <span className="text-[var(--text-secondary)] tabular-nums">{fmtN(showResolved.baseIVA ?? 0)}</span></span>
                    )}
                </div>
            )}
        </div>
    );
}

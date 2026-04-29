"use client";

// HeaderAdjustmentsSection — UI compacta para descuento/recargo a nivel de
// encabezado de factura. Cada uno por monto Bs o porcentaje.
// Reutilizable entre la página de creación y la de edición de factura.

import { useEffect, useState } from "react";
import type { AdjustmentKind, HeaderAdjustments } from "@/src/modules/inventory/shared/totals";

interface Props {
    value: HeaderAdjustments;
    onChange: (value: HeaderAdjustments) => void;
    readOnly?: boolean;
}

const labelCls =
    "min-w-[100px] font-mono text-[10px] uppercase tracking-[0.14em]";

const selCls =
    "h-8 px-1.5 rounded-md border border-border-default bg-surface-1 outline-none font-mono text-[12px] text-foreground hover:border-border-medium focus:border-primary-500 transition-colors";

const inputCls =
    "w-28 h-8 px-2 rounded-md border border-border-default bg-surface-1 outline-none font-mono text-[12px] text-foreground tabular-nums text-right disabled:opacity-40 disabled:cursor-not-allowed hover:border-border-medium focus:border-primary-500 transition-colors";

interface RowProps {
    label:    string;
    accent:   "negative" | "warning";
    tipo:     AdjustmentKind | null;
    valor:    number;
    onTipoChange:  (tipo: AdjustmentKind | null) => void;
    onValorChange: (valor: number) => void;
    readOnly?: boolean;
}

function Row({ label, accent, tipo, valor, onTipoChange, onValorChange, readOnly }: RowProps) {
    const accentCls =
        accent === "negative" ? "text-error/80" : "text-amber-600";

    // Local string state so the user can type "5," / "5." mid-typing without
    // the controlled value snapping back to "5". Hooks must be called
    // unconditionally on every render — DO NOT put them after early returns.
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

    if (readOnly) {
        const hasValue = tipo != null && valor > 0;
        return (
            <div className="flex items-center gap-3">
                <span className={`${labelCls} ${accentCls}`}>{label}</span>
                <span className="font-mono text-[12px] text-[var(--text-secondary)] tabular-nums">
                    {hasValue
                        ? tipo === "porcentaje"
                            ? `${valor.toLocaleString("es-VE", { minimumFractionDigits: 2 })} %`
                            : `${valor.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs`
                        : "—"}
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <span className={`${labelCls} ${accentCls}`}>{label}</span>
            <select
                value={tipo ?? ""}
                onChange={(e) => onTipoChange((e.target.value || null) as AdjustmentKind | null)}
                className={selCls}
            >
                <option value="">—</option>
                <option value="porcentaje">%</option>
                <option value="monto">Bs</option>
            </select>
            <input
                type="text"
                inputMode="decimal"
                disabled={!tipo}
                value={tipo ? text : ""}
                onChange={(e) => {
                    const raw = e.target.value;
                    if (!/^\d*[.,]?\d*$/.test(raw)) return;
                    setText(raw);
                    const parsed = parseFloat(raw.replace(",", "."));
                    onValorChange(Number.isFinite(parsed) ? parsed : 0);
                }}
                placeholder={tipo === "porcentaje" ? "0,00 %" : tipo === "monto" ? "0,00 Bs" : ""}
                className={inputCls}
            />
        </div>
    );
}

export function HeaderAdjustmentsSection({ value, onChange, readOnly }: Props) {
    function update<K extends keyof HeaderAdjustments>(key: K, val: HeaderAdjustments[K]) {
        onChange({ ...value, [key]: val });
    }

    return (
        <div className="space-y-2.5">
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
        </div>
    );
}

"use client";

// HeaderAdjustmentsSection — UI compacta para descuento/recargo a nivel de
// encabezado de factura. Cada uno por monto Bs o porcentaje.
// Reutilizable entre la página de creación y la de edición de factura.

import { useEffect, useState } from "react";
import type { AdjustmentCurrency, AdjustmentKind, HeaderAdjustments } from "@/src/modules/inventory/shared/totals";
import { isLocalCurrency, normalizeCurrencyCode, type CurrencyCode } from "@/src/modules/inventory/shared/currency";
import { CurrencyCombobox } from "@/src/modules/inventory/frontend/components/currency-combobox";

interface Props {
    value: HeaderAdjustments;
    onChange: (value: HeaderAdjustments) => void;
    dollarRate?: number | null;
    readOnly?: boolean;
}

const labelCls =
    "min-w-[100px] font-mono text-[10px] uppercase tracking-[0.14em]";

const selCls =
    "h-10 px-2 rounded-md border border-border-default bg-surface-1 outline-none font-mono text-[12px] text-foreground hover:border-border-medium focus:border-primary-500 transition-colors";

const inputCls =
    "w-28 h-10 px-2 rounded-md border border-border-default bg-surface-1 outline-none font-mono text-[12px] text-foreground tabular-nums text-right disabled:opacity-40 disabled:cursor-not-allowed hover:border-border-medium focus:border-primary-500 transition-colors";

interface RowProps {
    label:    string;
    accent:   "negative" | "warning";
    tipo:     AdjustmentKind | null;
    valor:    number;
    moneda:   AdjustmentCurrency;
    onMonedaChange: (moneda: AdjustmentCurrency) => void;
    onTipoChange:  (tipo: AdjustmentKind | null) => void;
    onAdjustmentChange?: (tipo: AdjustmentKind | null, moneda: AdjustmentCurrency) => void;
    onValorChange: (valor: number) => void;
    currencyOptions: Array<{ code: CurrencyCode; label: string }>;
    readOnly?: boolean;
}

function Row({ label, accent, tipo, valor, moneda, onMonedaChange, onTipoChange, onAdjustmentChange, onValorChange, readOnly, currencyOptions }: RowProps) {
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
                            : `${valor.toLocaleString("es-VE", { minimumFractionDigits: 2 })} ${isLocalCurrency(moneda) ? "Bs" : normalizeCurrencyCode(moneda)}`
                        : "—"}
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <span className={`${labelCls} ${accentCls}`}>{label}</span>
            <select
                value={!tipo ? "" : tipo === "porcentaje" ? "porcentaje" : "monto"}
                onChange={(e) => {
                    const v = e.target.value;
                    if (!v) onTipoChange(null);
                    else if (v === "porcentaje") onTipoChange("porcentaje");
                    else if (onAdjustmentChange) onAdjustmentChange("monto", moneda);
                    else onTipoChange("monto");
                }}
                className={selCls}
            >
                <option value="">—</option>
                <option value="porcentaje">%</option>
                <option value="monto">Monto</option>
            </select>
            {tipo === "monto" && <CurrencyCombobox label="" value={normalizeCurrencyCode(moneda)} options={currencyOptions} onChange={onMonedaChange} triggerClassName="!h-10 !w-32 !px-2 !text-[11px]" />}
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
                placeholder={tipo === "porcentaje" ? "0,00 %" : tipo === "monto" ? `0,00 ${isLocalCurrency(moneda) ? "Bs" : normalizeCurrencyCode(moneda)}` : ""}
                className={inputCls}
            />
        </div>
    );
}

export function HeaderAdjustmentsSection({ value, onChange, readOnly, currencyOptions = [{ code: "VES", label: "Bolívares · VES" }] }: Props & { currencyOptions?: Array<{ code: CurrencyCode; label: string }> }) {
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
                moneda={value.descuentoMoneda ?? "B"}
                onMonedaChange={(v) => update("descuentoMoneda", v)}
                onAdjustmentChange={(tipo, moneda) => onChange({ ...value, descuentoTipo: tipo, descuentoMoneda: moneda })}
                onTipoChange={(v) => update("descuentoTipo", v)}
                onValorChange={(v) => update("descuentoValor", v)}
                readOnly={readOnly}
                currencyOptions={currencyOptions}
            />
            <Row
                label="Recargo"
                accent="warning"
                tipo={value.recargoTipo}
                valor={value.recargoValor}
                moneda={value.recargoMoneda ?? "B"}
                onMonedaChange={(v) => update("recargoMoneda", v)}
                onAdjustmentChange={(tipo, moneda) => onChange({ ...value, recargoTipo: tipo, recargoMoneda: moneda })}
                onTipoChange={(v) => update("recargoTipo", v)}
                onValorChange={(v) => update("recargoValor", v)}
                readOnly={readOnly}
                currencyOptions={currencyOptions}
            />
        </div>
    );
}

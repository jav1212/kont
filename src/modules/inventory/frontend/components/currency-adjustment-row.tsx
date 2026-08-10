"use client";

import { useEffect, useState } from "react";
import { isLocalCurrency, normalizeCurrencyCode, type CurrencyCode } from "../../shared/currency";
import type { AdjustmentCurrency, AdjustmentKind } from "../../shared/totals";
import { CurrencyCombobox } from "./currency-combobox";

export function CurrencyAdjustmentRow({ label, tipo, valor, moneda, options, onChange }: {
    label: string;
    tipo: AdjustmentKind | null;
    valor: number;
    moneda: AdjustmentCurrency;
    options: Array<{ code: CurrencyCode; label: string }>;
    onChange: (patch: { tipo?: AdjustmentKind | null; valor?: number; moneda?: AdjustmentCurrency }) => void;
}) {
    const [text, setText] = useState(valor ? String(valor).replace(".", ",") : "");
    useEffect(() => { setText(valor ? String(valor).replace(".", ",") : ""); }, [valor]);
    return <div className="flex items-center gap-2">
        <span className="min-w-[82px] font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]">{label}</span>
        <select value={tipo ?? ""} onChange={(event) => onChange({ tipo: (event.target.value || null) as AdjustmentKind | null })} className="h-8 rounded border border-border-light bg-surface-1 px-1.5 font-mono text-[11px] text-foreground">
            <option value="">—</option><option value="porcentaje">%</option><option value="monto">Monto</option>
        </select>
        {tipo === "monto" && <CurrencyCombobox label="" value={normalizeCurrencyCode(moneda)} options={options} onChange={(code) => onChange({ moneda: code })} triggerClassName="!h-8 !w-32 !px-2 !text-[11px]" />}
        <input type="text" inputMode="decimal" disabled={!tipo} value={tipo ? text : ""} onChange={(event) => { const raw = event.target.value; if (!/^\d*[.,]?\d*$/.test(raw)) return; setText(raw); const parsed = parseFloat(raw.replace(",", ".")); onChange({ valor: Number.isFinite(parsed) ? parsed : 0 }); }} placeholder={tipo === "porcentaje" ? "0,00 %" : tipo === "monto" ? `0,00 ${isLocalCurrency(moneda) ? "Bs" : normalizeCurrencyCode(moneda)}` : ""} className="h-8 w-24 rounded border border-border-light bg-surface-1 px-2 text-right font-mono text-[11px] text-foreground disabled:opacity-40" />
    </div>;
}

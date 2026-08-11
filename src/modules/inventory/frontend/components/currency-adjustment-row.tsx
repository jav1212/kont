"use client";

import { useEffect, useState } from "react";
import { ResponsiveSelect } from "@/src/shared/frontend/components/responsive-select";
import { isLocalCurrency, normalizeCurrencyCode, type CurrencyCode } from "../../shared/currency";
import type { AdjustmentCurrency, AdjustmentKind } from "../../shared/totals";
import { CurrencyCombobox } from "./currency-combobox";

interface Props {
    label: string;
    tipo: AdjustmentKind | null;
    valor: number;
    moneda: AdjustmentCurrency;
    options: Array<{ code: CurrencyCode; label: string }>;
    onChange: (patch: { tipo?: AdjustmentKind | null; valor?: number; moneda?: AdjustmentCurrency }) => void;
    readOnly?: boolean;
    accent?: "neutral" | "negative" | "warning";
}

export function CurrencyAdjustmentRow({ label, tipo, valor, moneda, options, onChange, readOnly = false, accent = "neutral" }: Props) {
    const [text, setText] = useState(valor ? String(valor).replace(".", ",") : "");
    // Keep the editable string in sync when another invoice/draft is loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setText(valor ? String(valor).replace(".", ",") : ""); }, [valor]);

    const accentClass = accent === "negative"
        ? "text-error/80"
        : accent === "warning"
            ? "text-amber-600"
            : "text-[var(--text-secondary)]";

    if (readOnly) {
        const hasValue = tipo != null && valor > 0;
        return <div className="flex min-h-10 items-center gap-3 rounded-lg border border-border-light bg-surface-1/40 px-3 py-2">
            <span className={`min-w-[100px] font-mono text-[10px] uppercase tracking-[0.12em] ${accentClass}`}>{label}</span>
            <span className="font-mono text-[12px] text-[var(--text-secondary)] tabular-nums">
                {hasValue
                    ? tipo === "porcentaje"
                        ? `${valor.toLocaleString("es-VE", { minimumFractionDigits: 2 })} %`
                        : `${valor.toLocaleString("es-VE", { minimumFractionDigits: 2 })} ${isLocalCurrency(moneda) ? "Bs" : normalizeCurrencyCode(moneda)}`
                    : "—"}
            </span>
        </div>;
    }

    return <div className="grid min-w-0 grid-cols-1 gap-2 rounded-lg border border-border-light bg-surface-1/40 p-2 sm:grid-cols-2 xl:grid-cols-[minmax(100px,.7fr)_minmax(130px,.9fr)_minmax(150px,1fr)_minmax(140px,1fr)] xl:items-center">
        <span className={`font-mono text-[10px] uppercase tracking-[0.12em] ${accentClass}`}>{label}</span>
        <ResponsiveSelect
            value={tipo ?? ""}
            options={[{ value: "", label: "—" }, { value: "porcentaje", label: "Porcentaje" }, { value: "monto", label: "Monto" }]}
            onChange={(next) => onChange({ tipo: (next || null) as AdjustmentKind | null })}
            title={`Seleccionar tipo de ${label.toLowerCase()}`}
            triggerClassName="!h-10 !w-full !font-mono !text-[12px]"
        />
        {tipo === "monto"
            ? <CurrencyCombobox label="" value={normalizeCurrencyCode(moneda)} options={options} onChange={(code) => onChange({ moneda: code })} triggerClassName="!h-10 !w-full !px-2 !text-[12px]" />
            : <div className="hidden xl:block" />}
        <input
            type="text"
            inputMode="decimal"
            disabled={!tipo}
            value={tipo ? text : ""}
            onChange={(event) => {
                const raw = event.target.value;
                if (!/^\d*[.,]?\d*$/.test(raw)) return;
                setText(raw);
                const parsed = parseFloat(raw.replace(",", "."));
                onChange({ valor: Number.isFinite(parsed) ? parsed : 0 });
            }}
            placeholder={tipo === "porcentaje" ? "0,00 %" : tipo === "monto" ? `0,00 ${isLocalCurrency(moneda) ? "Bs" : normalizeCurrencyCode(moneda)}` : ""}
            className="h-10 min-w-0 w-full rounded-md border border-border-default bg-surface-1 px-2 text-right font-mono text-[12px] text-foreground outline-none transition-colors hover:border-border-medium focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-40"
        />
    </div>;
}

"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { AdjustmentKind, InvoiceTax, TaxBase } from "@/src/modules/inventory/shared/totals";
import { emptyInvoiceTax, roundN } from "@/src/modules/inventory/shared/totals";

interface Props {
    value:    InvoiceTax[];
    onChange: (next: InvoiceTax[]) => void;
    baseIVA:  number;
    total:    number;
    decimals?: number;
    readOnly?: boolean;
}

const labelCls =
    "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]";

const selCls =
    "h-8 px-1.5 rounded-md border border-border-default bg-surface-1 outline-none font-mono text-[12px] text-foreground hover:border-border-medium focus:border-primary-500 transition-colors";

const inputCls =
    "h-8 px-2 rounded-md border border-border-default bg-surface-1 outline-none font-mono text-[12px] text-foreground tabular-nums text-right disabled:opacity-40 disabled:cursor-not-allowed hover:border-border-medium focus:border-primary-500 transition-colors";

const nameInputCls =
    "h-8 px-2 rounded-md border border-border-default bg-surface-1 outline-none font-mono text-[12px] text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:border-border-medium focus:border-primary-500 transition-colors";

interface TaxRowProps {
    tax: InvoiceTax;
    index: number;
    baseIVA: number;
    total: number;
    decimals: number;
    onChange: (index: number, tax: InvoiceTax) => void;
    onRemove: (index: number) => void;
    readOnly?: boolean;
}

function TaxRow({ tax, index, baseIVA, total, decimals, onChange, onRemove, readOnly }: TaxRowProps) {
    const [text, setText] = useState<string>(() =>
        tax.valor === 0 ? "" : String(tax.valor).replace(".", ","),
    );

    useEffect(() => {
        const own = parseFloat(text.replace(",", "."));
        const owned = Number.isFinite(own) ? own : 0;
        if (Math.abs(owned - tax.valor) > 1e-9) {
            setText(tax.valor === 0 ? "" : String(tax.valor).replace(".", ","));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tax.valor]);

    const computedMonto = (() => {
        if (tax.tipo === "monto") return roundN(Math.max(0, tax.valor), decimals);
        if (tax.tipo === "porcentaje" && tax.valor > 0) {
            const base = tax.base === "post_iva" ? total : baseIVA;
            return roundN(base * tax.valor / 100, decimals);
        }
        return 0;
    })();

    const update = (patch: Partial<InvoiceTax>) => {
        onChange(index, { ...tax, ...patch });
    };

    if (readOnly) {
        if (tax.monto <= 0 && tax.valor <= 0) return null;
        return (
            <div className="flex items-center gap-3">
                <span className="font-mono text-[12px] text-foreground min-w-[100px]">
                    {tax.nombre || "Impuesto"}
                </span>
                <span className="font-mono text-[12px] text-[var(--text-secondary)] tabular-nums">
                    {tax.tipo === "porcentaje"
                        ? `${tax.valor.toLocaleString("es-VE", { minimumFractionDigits: 2 })} % ${tax.base === "post_iva" ? "post-IVA" : "pre-IVA"}`
                        : `${tax.valor.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs`}
                </span>
                <span className="font-mono text-[11px] text-amber-600 tabular-nums ml-auto">
                    = Bs. {computedMonto.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <input
                type="text"
                value={tax.nombre}
                onChange={(e) => update({ nombre: e.target.value })}
                placeholder="Nombre"
                className={`${nameInputCls} w-32 flex-shrink-0`}
            />
            <select
                value={tax.tipo}
                onChange={(e) => update({ tipo: e.target.value as AdjustmentKind })}
                className={`${selCls} flex-shrink-0`}
            >
                <option value="porcentaje">%</option>
                <option value="monto">Bs</option>
            </select>
            <input
                type="text"
                inputMode="decimal"
                value={text}
                onChange={(e) => {
                    const raw = e.target.value;
                    if (!/^\d*[.,]?\d*$/.test(raw)) return;
                    setText(raw);
                    const parsed = parseFloat(raw.replace(",", "."));
                    update({ valor: Number.isFinite(parsed) ? parsed : 0 });
                }}
                placeholder="0,00"
                className={`${inputCls} w-24 flex-shrink-0`}
            />
            <select
                value={tax.base}
                onChange={(e) => update({ base: e.target.value as TaxBase })}
                disabled={tax.tipo === "monto"}
                className={`${selCls} flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed`}
            >
                <option value="pre_iva">Pre-IVA</option>
                <option value="post_iva">Post-IVA</option>
            </select>
            {computedMonto > 0 && (
                <span className="font-mono text-[11px] text-amber-600 tabular-nums whitespace-nowrap ml-auto">
                    Bs. {computedMonto.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                </span>
            )}
            <button
                type="button"
                onClick={() => onRemove(index)}
                className="flex-shrink-0 p-1 rounded hover:bg-surface-2 text-[var(--text-tertiary)] hover:text-error transition-colors"
                aria-label="Eliminar impuesto"
            >
                <X size={13} strokeWidth={2.2} />
            </button>
        </div>
    );
}

export function InvoiceTaxesSection({ value, onChange, baseIVA, total, decimals = 2, readOnly }: Props) {
    const handleChange = (index: number, tax: InvoiceTax) => {
        const next = [...value];
        next[index] = tax;
        onChange(next);
    };

    const handleRemove = (index: number) => {
        onChange(value.filter((_, i) => i !== index));
    };

    const handleAdd = () => {
        onChange([...value, emptyInvoiceTax()]);
    };

    return (
        <div className="space-y-2.5">
            <div className="flex items-center justify-between">
                <span className={labelCls}>Impuestos adicionales</span>
                {!readOnly && (
                    <button
                        type="button"
                        onClick={handleAdd}
                        className="flex items-center gap-1 px-2 h-7 rounded-md border border-border-default bg-surface-1 hover:bg-surface-2 hover:border-border-medium transition-colors font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                    >
                        <Plus size={11} strokeWidth={2.4} />
                        Agregar
                    </button>
                )}
            </div>
            {value.length === 0 && readOnly && (
                <p className="font-mono text-[11px] italic text-[var(--text-tertiary)]">
                    Sin impuestos adicionales.
                </p>
            )}
            {value.map((tax, idx) => (
                <TaxRow
                    key={idx}
                    tax={tax}
                    index={idx}
                    baseIVA={baseIVA}
                    total={total}
                    decimals={decimals}
                    onChange={handleChange}
                    onRemove={handleRemove}
                    readOnly={readOnly}
                />
            ))}
        </div>
    );
}

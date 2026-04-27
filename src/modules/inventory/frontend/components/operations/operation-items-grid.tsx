"use client";

// OperationItemsGrid — header + rows + footer totals for the operation form.

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Product } from "@/src/modules/inventory/backend/domain/product";

import { OperationItemRow } from "./operation-item-row";
import type { IvaMode, OperationItem } from "./operation-types";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
    items: OperationItem[];
    products: Product[];
    getProduct: (id: string) => Product | undefined;
    isOutbound: boolean;
    enableLineAdjustments: boolean;
    rowBalanceLabel: string;
    rowBalanceAfterLabel: string;
    costLabel: string;
    dollarRate: number | null;
    ivaMode: IvaMode;
    hasIva: boolean;
    totals: { subtotal: number; iva: number; total: number };
    onPatch: (index: number, patch: Partial<OperationItem>) => void;
    onAddRow: () => void;
    onRemoveRow: (index: number) => void;
}

export function OperationItemsGrid({
    items, products, getProduct,
    isOutbound, enableLineAdjustments,
    rowBalanceLabel, rowBalanceAfterLabel, costLabel,
    dollarRate, ivaMode, hasIva, totals,
    onPatch, onAddRow, onRemoveRow,
}: Props) {
    const [expandedAdj, setExpandedAdj] = useState<Set<number>>(new Set());

    function toggleAdj(idx: number) {
        setExpandedAdj((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    }

    // Header columns must mirror the row column template in OperationItemRow.
    const cols = [
        "1fr",            // Producto
        "120px",          // Cantidad
        "160px",          // Costo
        "90px",           // Moneda
        ...(isOutbound ? ["160px"] : []),
        ...(enableLineAdjustments ? ["36px"] : []),
        "36px",           // Eliminar
    ].join(" ");

    const headerLabels = [
        "Producto",
        "Cantidad",
        costLabel,
        "Moneda",
        ...(isOutbound ? [rowBalanceLabel] : []),
        ...(enableLineAdjustments ? [""] : []),
        "",
    ];

    return (
        <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-foreground">
                    Productos
                </h2>
                <button
                    onClick={onAddRow}
                    className="inline-flex items-center gap-1.5 text-[12px] text-primary-500 hover:text-primary-600 uppercase tracking-[0.12em] transition-colors"
                    type="button"
                >
                    <Plus size={12} strokeWidth={2.5} />
                    Agregar fila
                </button>
            </div>

            {/* Column headers */}
            <div
                className="grid gap-2 px-4 py-2 border-b border-border-light bg-surface-2"
                style={{ gridTemplateColumns: cols }}
            >
                {headerLabels.map((h, i) => (
                    <span key={i} className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{h}</span>
                ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-border-light/50">
                {items.map((item, idx) => (
                    <OperationItemRow
                        key={idx}
                        item={item}
                        products={products}
                        product={getProduct(item.productId)}
                        isOutbound={isOutbound}
                        enableLineAdjustments={enableLineAdjustments}
                        adjOpen={expandedAdj.has(idx)}
                        canRemove={items.length > 1}
                        rowBalanceAfterLabel={rowBalanceAfterLabel}
                        dollarRate={dollarRate}
                        ivaMode={ivaMode}
                        onPatch={(patch) => onPatch(idx, patch)}
                        onRemove={() => onRemoveRow(idx)}
                        onToggleAdj={() => toggleAdj(idx)}
                    />
                ))}
            </div>

            {/* Footer totals */}
            <div className="px-4 py-3 border-t border-border-light bg-surface-2">
                <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                        {items.length} {items.length === 1 ? "producto" : "productos"}
                    </span>
                    <div className="flex items-center gap-6">
                        {items.some((i) => i.currency === "D") && dollarRate && (
                            <span className="text-[12px] text-[var(--text-tertiary)]">
                                Tasa: {fmtN(dollarRate)} Bs/USD
                            </span>
                        )}
                        {hasIva ? (
                            <div className="flex items-center gap-4 text-[12px] tabular-nums">
                                <span className="text-[var(--text-tertiary)]">
                                    Base <span className="text-foreground font-medium">Bs {fmtN(totals.subtotal)}</span>
                                </span>
                                <span className="text-[var(--text-tertiary)]">
                                    IVA <span className="text-amber-600 font-medium">Bs {fmtN(totals.iva)}</span>
                                </span>
                                <span className="text-[13px] font-bold text-primary-500">
                                    Total Bs {fmtN(totals.total)}
                                </span>
                            </div>
                        ) : (
                            <span className="text-[13px] font-bold text-primary-500 tabular-nums">
                                Total Bs {fmtN(totals.subtotal)}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

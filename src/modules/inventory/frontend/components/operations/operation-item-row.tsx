"use client";

// OperationItemRow — single row of the items grid: product combo, quantity,
// cost, currency toggle, optional stock preview, optional line-adjustments
// expander, and a remove button.

import { X } from "lucide-react";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { LineAdjustmentsPanel } from "@/src/modules/inventory/frontend/components/line-adjustments-panel";
import type { Product } from "@/src/modules/inventory/backend/domain/product";

import { ProductCombo } from "./product-combo";
import { computeOperationRowCosts, hasLineAdjustments } from "./compute-costs";
import type { IvaMode, OperationItem } from "./operation-types";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
    item: OperationItem;
    products: Product[];
    product: Product | undefined;
    isOutbound: boolean;
    enableLineAdjustments: boolean;
    adjOpen: boolean;
    canRemove: boolean;
    rowBalanceAfterLabel: string;
    dollarRate: number | null;
    ivaMode: IvaMode;
    onPatch: (patch: Partial<OperationItem>) => void;
    onRemove: () => void;
    onToggleAdj: () => void;
}

export function OperationItemRow({
    item, products, product, isOutbound, enableLineAdjustments,
    adjOpen, canRemove, rowBalanceAfterLabel,
    dollarRate, ivaMode,
    onPatch, onRemove, onToggleAdj,
}: Props) {
    const stockOk = !product || !isOutbound || item.quantity <= product.currentStock;
    const balanceAfter = product && isOutbound ? product.currentStock - item.quantity : null;
    const hasAdj = hasLineAdjustments(item.adjustments);

    // Column template — adjustments toggle column adds 36px, balance column adds 160px.
    const cols = [
        "1fr",            // Producto
        "120px",          // Cantidad
        "160px",          // Costo
        "90px",           // Moneda
        ...(isOutbound ? ["160px"] : []),
        ...(enableLineAdjustments ? ["36px"] : []),
        "36px",           // Eliminar
    ].join("_");
    const gridStyle = { gridTemplateColumns: cols.replace(/_/g, " ") };

    return (
        <div>
            <div className="grid gap-2 px-4 py-2 items-center" style={gridStyle}>
                {/* Producto */}
                <ProductCombo
                    value={item.productId}
                    products={products}
                    onChange={(id, name, vatRate) => onPatch({ productId: id, productName: name, vatRate })}
                />

                {/* Cantidad */}
                <BaseInput.Field
                    type="number"
                    className="w-full"
                    inputClassName={stockOk ? "text-right" : "text-right !text-red-500"}
                    value={item.quantity ? String(item.quantity) : ""}
                    onValueChange={(v) => onPatch({ quantity: Number(v) || 0 })}
                    placeholder="0"
                    min={0.0001}
                    step={0.0001}
                />

                {/* Costo */}
                <BaseInput.Field
                    type="number"
                    className="w-full"
                    inputClassName="text-right"
                    value={item.currencyCost ? String(item.currencyCost) : ""}
                    onValueChange={(v) => onPatch({ currencyCost: Number(v) || 0 })}
                    placeholder="0.00"
                    min={0}
                    step={0.01}
                    suffix={item.currency === "D" ? "USD" : "Bs"}
                />

                {/* Moneda toggle */}
                <div className="flex rounded-lg border border-border-light overflow-hidden h-10 text-[12px]">
                    <button
                        type="button"
                        className={[
                            "flex-1 transition-colors",
                            item.currency === "B"
                                ? "bg-primary-500 text-white"
                                : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                        ].join(" ")}
                        onClick={() => onPatch({ currency: "B" })}
                    >
                        Bs
                    </button>
                    <button
                        type="button"
                        className={[
                            "flex-1 transition-colors",
                            item.currency === "D"
                                ? "bg-primary-500 text-white"
                                : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                        ].join(" ")}
                        onClick={() => onPatch({ currency: "D" })}
                    >
                        USD
                    </button>
                </div>

                {/* Existencia (solo dirección outbound) */}
                {isOutbound && (
                    <div className="px-1 space-y-0.5">
                        {product ? (
                            <>
                                <div className="flex justify-between text-[12px]">
                                    <span className="text-[var(--text-tertiary)]">Disponible</span>
                                    <span className={`tabular-nums font-medium ${!stockOk ? "text-red-500" : "text-foreground"}`}>
                                        {fmtN(product.currentStock)}
                                    </span>
                                </div>
                                {item.quantity > 0 && (
                                    <div className="flex justify-between text-[12px]">
                                        <span className="text-[var(--text-tertiary)]">{rowBalanceAfterLabel}</span>
                                        <span className={`tabular-nums font-medium ${!stockOk ? "text-red-500" : "text-[var(--text-secondary)]"}`}>
                                            {fmtN(balanceAfter!)}
                                        </span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <span className="text-[11px] text-[var(--text-tertiary)]">—</span>
                        )}
                    </div>
                )}

                {/* Ajustes toggle */}
                {enableLineAdjustments && (
                    <button
                        type="button"
                        onClick={onToggleAdj}
                        className={[
                            "w-9 h-10 flex items-center justify-center rounded transition-colors text-[14px] font-mono leading-none",
                            adjOpen || hasAdj
                                ? "bg-primary-500/10 text-primary-500"
                                : "text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2",
                        ].join(" ")}
                        aria-label="Ajustes de línea"
                        title={hasAdj ? "Editar ajustes" : "Agregar descuento o recargo"}
                    >
                        {adjOpen ? "−" : hasAdj ? "●" : "+"}
                    </button>
                )}

                {/* Eliminar */}
                <button
                    type="button"
                    onClick={onRemove}
                    disabled={!canRemove}
                    aria-label="Eliminar fila"
                    className="w-9 h-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 disabled:opacity-30 disabled:hover:text-[var(--text-tertiary)] transition-colors"
                >
                    <X size={14} strokeWidth={2} />
                </button>
            </div>

            {enableLineAdjustments && adjOpen && (
                <div className="px-4 py-3 bg-surface-2/30 border-t border-border-light/40">
                    <LineAdjustmentsPanel
                        value={item.adjustments}
                        onChange={(next) => onPatch({ adjustments: next })}
                        title="Ajustes de línea — afectan la base IVA"
                        showResolved={(() => {
                            const c = computeOperationRowCosts({
                                item, dollarRate, ivaMode, enableLineAdjustments: true,
                            });
                            return {
                                descuentoMonto: c.descuentoMonto,
                                recargoMonto:   c.recargoMonto,
                                baseIVA:        c.baseIVA,
                            };
                        })()}
                    />
                </div>
            )}
        </div>
    );
}

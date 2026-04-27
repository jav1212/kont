// Pure pricing math for an operation row, parametrized by IVA mode and currency.
// Replaces the three near-identical inline `computeCosts` / `computeCostos` helpers
// that lived in adjustments/returns/self-consumption pages.
//
// All output amounts are expressed in Bs. `baseCurrencyCost` echoes back the net
// per-unit cost in the input currency (USD when currency==="D"), useful for the
// `Movement.currencyCost` audit trail.

import {
    computeLineTotals,
    emptyLineAdjustments,
    round2,
    type LineAdjustments,
    type VatRate as VatRateStr,
} from "@/src/modules/inventory/shared/totals";
import type { IvaMode, OperationItem } from "./operation-types";

function vatRateToString(rate: number): VatRateStr {
    if (rate >= 0.15) return "general_16";
    if (rate > 0) return "reducida_8";
    return "exenta";
}

export interface OperationRowCosts {
    /** Net unit cost in Bs (after line adjustments). Persisted in `Movement.unitCost`. */
    unitCost: number;
    /** Total Bs cost of the row (net of IVA). Persisted in `Movement.totalCost`. */
    totalCost: number;
    /** IVA amount for this row (Bs). */
    vatAmountTotal: number;
    /** Total Bs cost of the row including IVA. */
    totalWithVat: number;
    /** Per-unit net cost in the input currency (USD or Bs), echoed for auditing. */
    baseCurrencyCost: number | null;
    /** Resolved discount/recargo amounts and base IVA (only meaningful when adjustments are enabled). */
    descuentoMonto: number;
    recargoMonto: number;
    baseIVA: number;
}

export interface ComputeArgs {
    item: OperationItem;
    dollarRate: number | null;
    ivaMode: IvaMode;
    enableLineAdjustments: boolean;
}

export function computeOperationRowCosts({
    item,
    dollarRate,
    ivaMode,
    enableLineAdjustments,
}: ComputeArgs): OperationRowCosts {
    const enteredPriceBs = item.currency === "D"
        ? (dollarRate ? round2(item.currencyCost * dollarRate) : 0)
        : item.currencyCost;

    const baseUnitBs = (item.vatRate > 0 && ivaMode === "incluido")
        ? round2(enteredPriceBs / (1 + item.vatRate))
        : enteredPriceBs;

    const adjustments: LineAdjustments = enableLineAdjustments ? item.adjustments : emptyLineAdjustments();

    const t = computeLineTotals({
        quantity: item.quantity,
        unitCost: baseUnitBs,
        vatRate: vatRateToString(item.vatRate),
        adjustments,
    });

    const adjustedUnitCost = item.quantity > 0 ? round2(t.baseIVA / item.quantity) : baseUnitBs;

    const baseCurrencyCost: number | null = item.currency === "D"
        ? (ivaMode === "incluido" && item.vatRate > 0
            ? round2(item.currencyCost / (1 + item.vatRate))
            : item.currencyCost)
        : null;

    return {
        unitCost: adjustedUnitCost,
        totalCost: t.baseIVA,
        vatAmountTotal: t.ivaMonto,
        totalWithVat: t.total,
        baseCurrencyCost,
        descuentoMonto: t.descuentoMonto,
        recargoMonto: t.recargoMonto,
        baseIVA: t.baseIVA,
    };
}

export function hasLineAdjustments(adj: LineAdjustments): boolean {
    return (
        (adj.descuentoTipo != null && adj.descuentoValor > 0) ||
        (adj.recargoTipo != null && adj.recargoValor > 0)
    );
}

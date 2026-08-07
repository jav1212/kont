// Pure pricing math for an operation row, parametrized by IVA mode and currency.
// Replaces the three near-identical inline `computeCosts` / `computeCostos` helpers
// that lived in adjustments/returns/self-consumption pages.
//
// All output amounts are expressed in Bs. `baseCurrencyCost` echoes back the net
// per-unit cost in the input currency (USD when currency==="D"), useful for the
// `Movement.currencyCost` audit trail.

import {
    computeInvoiceTotals,
    emptyHeaderAdjustments,
    emptyLineAdjustments,
    netFromGross,
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
    const vatRate = vatRateToString(item.vatRate);
    const baseSource = item.vatRate > 0 && ivaMode === "incluido"
        ? netFromGross(item.currencyCost, vatRate)
        : item.currencyCost;
    const unitCostBs = item.currency === "D"
        ? (dollarRate ? baseSource * dollarRate : 0)
        : baseSource;
    const adjustments: LineAdjustments = enableLineAdjustments ? item.adjustments : emptyLineAdjustments();
    const totals = computeInvoiceTotals(
        [{
            quantity: item.quantity,
            unitCost: unitCostBs,
            currency: item.currency,
            currencyCost: item.currency === "D" ? baseSource : null,
            vatRate,
            adjustments,
        }],
        emptyHeaderAdjustments(),
        2,
        0,
        [],
        dollarRate ?? 0,
        item.currency,
    );
    const line = totals.items[0];
    const adjustedUnitCost = item.quantity > 0 ? line.baseIVAFinal / item.quantity : baseSource;
    return {
        unitCost: adjustedUnitCost,
        totalCost: line.baseIVAFinal,
        vatAmountTotal: line.ivaMontoFinal,
        totalWithVat: line.totalFinal,
        baseCurrencyCost: item.currency === "D" ? baseSource : null,
        descuentoMonto: line.descuentoMonto,
        recargoMonto: line.recargoMonto,
        baseIVA: line.baseIVAFinal,
    };
}

export function hasLineAdjustments(adj: LineAdjustments): boolean {
    return (
        (adj.descuentoTipo != null && adj.descuentoValor > 0) ||
        (adj.recargoTipo != null && adj.recargoValor > 0)
    );
}

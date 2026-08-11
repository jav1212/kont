"use client";

import { CurrencyAdjustmentRow } from "@/src/modules/inventory/frontend/components/currency-adjustment-row";
import type { CurrencyCode } from "@/src/modules/inventory/shared/currency";
import type { HeaderAdjustments } from "@/src/modules/inventory/shared/totals";

interface Props {
    value: HeaderAdjustments;
    onChange: (value: HeaderAdjustments) => void;
    dollarRate?: number | null;
    readOnly?: boolean;
    currencyOptions?: Array<{ code: CurrencyCode; label: string }>;
}

export function HeaderAdjustmentsSection({
    value,
    onChange,
    readOnly,
    currencyOptions = [{ code: "VES", label: "Bolívares · VES" }],
}: Props) {
    return <div className="space-y-2.5">
        <CurrencyAdjustmentRow
            label="Descuento"
            accent="negative"
            tipo={value.descuentoTipo}
            valor={value.descuentoValor}
            moneda={value.descuentoMoneda ?? "B"}
            options={currencyOptions}
            readOnly={readOnly}
            onChange={(patch) => onChange({
                ...value,
                descuentoTipo: patch.tipo === undefined ? value.descuentoTipo : patch.tipo,
                descuentoValor: patch.valor === undefined ? value.descuentoValor : patch.valor,
                descuentoMoneda: patch.moneda ?? value.descuentoMoneda,
            })}
        />
        <CurrencyAdjustmentRow
            label="Recargo"
            accent="warning"
            tipo={value.recargoTipo}
            valor={value.recargoValor}
            moneda={value.recargoMoneda ?? "B"}
            options={currencyOptions}
            readOnly={readOnly}
            onChange={(patch) => onChange({
                ...value,
                recargoTipo: patch.tipo === undefined ? value.recargoTipo : patch.tipo,
                recargoValor: patch.valor === undefined ? value.recargoValor : patch.valor,
                recargoMoneda: patch.moneda ?? value.recargoMoneda,
            })}
        />
    </div>;
}

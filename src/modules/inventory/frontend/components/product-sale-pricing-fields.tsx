"use client";

import { BaseInput } from "@/src/shared/frontend/components/base-input";
import type { Product, SaleCurrency, SalePricing } from "../../backend/domain/product";

const fieldCls = "h-10 w-full rounded-lg border border-border-default bg-surface-1 px-3 font-mono text-[14px] text-foreground outline-none transition-colors hover:border-border-medium focus:border-primary-500";
const labelCls = "mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]";

export function formatProductSalePricing(product: Product): string {
    const pricing = product.salePricing;
    if (!pricing) return "Sin configurar";
    if (pricing.mode === "markup") return `${pricing.percentage.toLocaleString("es-VE")} % sobre costo`;
    const prefix = pricing.currency === "D" ? "USD" : "Bs.";
    return `${prefix} ${pricing.amount.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export function ProductSalePricingFields({
    product,
    onChange,
}: {
    product: Product;
    onChange: (pricing: SalePricing | undefined) => void;
}) {
    const pricing = product.salePricing;
    const mode = pricing?.mode ?? "none";
    const currency = pricing?.currency ?? "B";
    const value = pricing ? (pricing.mode === "fixed" ? pricing.amount : pricing.percentage) : 0;
    const markupPreview = pricing?.mode === "markup"
        ? product.averageCost * (1 + pricing.percentage / 100)
        : null;

    function changeMode(next: string) {
        if (next === "none") return onChange(undefined);
        if (next === "fixed") return onChange({ mode: "fixed", amount: 0, currency });
        onChange({ mode: "markup", percentage: 0, currency });
    }

    function changeCurrency(next: SaleCurrency) {
        if (!pricing) return;
        onChange({ ...pricing, currency: next });
    }

    function changeValue(raw: string) {
        if (!pricing) return;
        const next = Number(raw) || 0;
        onChange(pricing.mode === "fixed"
            ? { ...pricing, amount: next }
            : { ...pricing, percentage: next });
    }

    return (
        <div>
            <div className="grid gap-4 md:grid-cols-3">
                <div>
                    <label className={labelCls}>Modalidad</label>
                    <select className={fieldCls} value={mode} onChange={(event) => changeMode(event.target.value)}>
                        <option value="none">Sin configurar</option>
                        <option value="fixed">Monto fijo</option>
                        <option value="markup">Porcentaje sobre costo</option>
                    </select>
                </div>
                {pricing && (
                    <>
                        <BaseInput.Field
                            label={pricing.mode === "fixed" ? "Monto sin IVA" : "Porcentaje de ganancia"}
                            type="number"
                            min={pricing.mode === "fixed" ? 0.01 : 0}
                            step={pricing.mode === "fixed" ? 0.01 : 0.1}
                            value={value ? String(value) : ""}
                            onValueChange={changeValue}
                        />
                        <div>
                            <label className={labelCls}>Moneda preferida</label>
                            <select className={fieldCls} value={currency} onChange={(event) => changeCurrency(event.target.value as SaleCurrency)}>
                                <option value="B">Bolívares (Bs.)</option>
                                <option value="D">Dólares (USD)</option>
                            </select>
                        </div>
                    </>
                )}
            </div>
            {pricing?.mode === "markup" && (
                <p className="mt-3 rounded-lg border border-border-light bg-surface-2 px-3 py-2 font-sans text-[12px] text-[var(--text-secondary)]">
                    Precio base actual: <strong>Bs. {(markupPreview ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong>
                    {pricing.currency === "D" ? " · se convierte a USD con la tasa BCV de la factura." : ""}
                </p>
            )}
            <p className="mt-2 font-sans text-[11px] text-[var(--text-tertiary)]">El precio es sin IVA. La alícuota se aplica al facturar.</p>
        </div>
    );
}

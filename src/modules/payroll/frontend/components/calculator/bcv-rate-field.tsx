"use client";

import { RefreshCw } from "lucide-react";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import type { PayrollReferenceCurrencyCode } from "../../../shared/reference-currency";
import { ReferenceCurrencySelect } from "../reference-currency-select";
import { SectionHeader } from "./chrome";
import { LABEL_CLS } from "./field-styles";

// Calculator-flavour BCV rate widget. Renders the section label, a tiny
// refresh button, the currency + date pickers (same choices as the payroll
// run) and the editable rate input. Left-panel use only — the marketing
// pill / read-only header chip live in `bcv-pill.tsx`.

export interface BcvRateFieldProps {
    /** rate string for controlled <input> binding */
    value:        string;
    onChange(next: string): void;
    onRefresh():  void | Promise<void>;
    /** reference currency the rate is quoted in */
    currencyCode: PayrollReferenceCurrencyCode;
    onCurrencyChange(code: PayrollReferenceCurrencyCode): void;
    /** ISO date of the BCV publication to fetch */
    date:         string;
    onDateChange(iso: string): void;
    loading?:     boolean;
    error?:       string | null;
    /** override section label (defaults to "Tasa BCV") */
    label?:       string;
}

/**
 * Renders the rate section of a benefit calculator's left panel.
 *
 * @param props - Controlled rate, currency and date values with their callbacks,
 *                plus fetch status for the refresh button and error line.
 * @returns The rate section element.
 */
export function BcvRateField({
    value, onChange, onRefresh,
    currencyCode, onCurrencyChange, date, onDateChange,
    loading, error, label = "Tasa BCV",
}: BcvRateFieldProps) {
    return (
        <div className="space-y-3">
            <SectionHeader
                label={label}
                right={
                    <button
                        type="button"
                        onClick={() => { void onRefresh(); }}
                        disabled={!!loading || !date}
                        className="p-1 hover:bg-surface-2 rounded-md transition-colors text-[var(--text-tertiary)] hover:text-primary-500 disabled:opacity-40"
                        title="Consultar BCV"
                        aria-label="Consultar tasa BCV"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                    </button>
                }
            />
            <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                    <label className={LABEL_CLS}>Divisa</label>
                    <ReferenceCurrencySelect value={currencyCode} onChange={onCurrencyChange} />
                </div>
                <div className="min-w-0">
                    <label className={LABEL_CLS}>Fecha</label>
                    <BaseInput.Field
                        aria-label="Fecha de la tasa"
                        type="date"
                        value={date}
                        max={getTodayIsoDate()}
                        onValueChange={onDateChange}
                    />
                </div>
            </div>
            <BaseInput.Field
                label={`Tasa (Bs. por ${currencyCode})`}
                type="number"
                step={0.0001}
                value={value}
                onValueChange={onChange}
                prefix="Bs."
                inputClassName="text-right"
            />
            {error && (
                <p className="font-mono text-[10px] text-red-400 mt-1">{error}</p>
            )}
        </div>
    );
}

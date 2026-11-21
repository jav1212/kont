"use client";

import { Select, SelectItem } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { Flag } from "@/src/modules/tools/frontend/components/flag";
import {
    PAYROLL_REFERENCE_CURRENCIES,
    type PayrollReferenceCurrencyCode,
} from "../../shared/reference-currency";

// Currency picker for the BCV reference rate. Shared by the guided payroll
// run and the benefit calculators so both offer the same currencies.

export interface ReferenceCurrencySelectProps {
    value: PayrollReferenceCurrencyCode;
    onChange(code: PayrollReferenceCurrencyCode): void;
}

/**
 * Renders the flag + code dropdown of payroll reference currencies.
 *
 * @param props - Selected currency and the change callback.
 * @returns The HeroUI select element.
 */
export function ReferenceCurrencySelect({ value, onChange }: ReferenceCurrencySelectProps) {
    return (
        <Select
            aria-label="Divisa de referencia"
            selectedKeys={[value]}
            onSelectionChange={(keys) => {
                const next = Array.from(keys as Set<string>)[0];
                if (next) onChange(next as PayrollReferenceCurrencyCode);
            }}
            selectorIcon={<ChevronDown size={16} />}
            renderValue={() => {
                const current = PAYROLL_REFERENCE_CURRENCIES.find(
                    (currency) => currency.code === value,
                );
                if (!current) return null;
                return (
                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                        <Flag code={current.countryCode} size={16} />
                        <span className="min-w-0 flex-1 truncate font-mono text-[14px] font-medium text-foreground">
                            {current.code} · {current.label}
                        </span>
                    </div>
                );
            }}
            classNames={{
                trigger: [
                    "w-full min-w-0 !h-10 !min-h-10 px-3 rounded-lg !border !border-solid !border-[var(--control-border)] bg-surface-1 overflow-hidden",
                    "!shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-[border-color,box-shadow,background-color] duration-150",
                    "data-[hover=true]:!border-[var(--control-border-hover)]",
                    "data-[open=true]:!border-[var(--control-border-focus)] data-[open=true]:!shadow-[var(--control-focus-shadow)]",
                ].join(" "),
                value: "flex min-w-0 items-center w-full",
                selectorIcon: "shrink-0 text-[var(--text-tertiary)]",
                popoverContent: "bg-surface-1 border border-[var(--control-border)] rounded-lg overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,.12)]",
                listbox: "p-1",
            }}
            className="w-full min-w-0"
        >
            {PAYROLL_REFERENCE_CURRENCIES.map((currency) => (
                <SelectItem
                    key={currency.code}
                    textValue={`${currency.code} ${currency.label}`}
                    classNames={{
                        base: [
                            "rounded-md px-2 py-1.5",
                            "data-[hover=true]:bg-surface-2",
                            "data-[selected=true]:bg-surface-2 data-[selected=true]:text-foreground",
                        ].join(" "),
                    }}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Flag code={currency.countryCode} size={16} />
                        <div className="flex flex-col min-w-0">
                            <span className="font-mono text-[12px] font-bold text-foreground">
                                {currency.code}
                            </span>
                            <span className="text-[10px] text-foreground/50 truncate">
                                {currency.label}
                            </span>
                        </div>
                    </div>
                </SelectItem>
            ))}
        </Select>
    );
}

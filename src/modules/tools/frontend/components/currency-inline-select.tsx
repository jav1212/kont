"use client";

import { Select, SelectItem } from "@heroui/react";
import { CURRENCIES, currencyMeta } from "../utils/currency-codes";
import { Flag } from "./flag";

type Size = "sm" | "md" | "lg";

interface Props {
    value: string;
    onChange: (code: string) => void;
    ariaLabel: string;
    /** sm = h-10 / md = h-11 / lg = h-12. Default md. */
    size?: Size;
}

interface SizeSpec {
    base: string;
    trigger: string;
    flagSize: number;
    code: string;
    listFlagSize: number;
    listCode: string;
    listLabel: string;
}

const SIZE_MAP: Record<Size, SizeSpec> = {
    sm: {
        base: "w-[108px] shrink-0",
        trigger: "min-h-[40px] h-10 pl-3 pr-8 py-0",
        flagSize: 14,
        code: "text-[12px] font-mono font-bold text-foreground",
        listFlagSize: 14,
        listCode: "text-[12px] font-mono font-bold text-foreground",
        listLabel: "text-[10px] text-foreground/50 truncate",
    },
    md: {
        base: "w-[116px] shrink-0",
        trigger: "min-h-[44px] h-11 pl-3 pr-8 py-0",
        flagSize: 15,
        code: "text-[13px] font-mono font-bold text-foreground",
        listFlagSize: 15,
        listCode: "text-[12px] font-mono font-bold text-foreground",
        listLabel: "text-[10px] text-foreground/50 truncate",
    },
    lg: {
        base: "w-[124px] shrink-0",
        trigger: "min-h-[48px] h-12 pl-3 pr-8 py-0",
        flagSize: 16,
        code: "text-[13px] font-mono font-bold text-foreground",
        listFlagSize: 16,
        listCode: "text-[12px] font-mono font-bold text-foreground",
        listLabel: "text-[10px] text-foreground/50 truncate",
    },
};

/**
 * Unified inline currency selector used across the tools module
 * (converter, cross-converter, history chart).
 *
 * Replaces three duplicated copies with a single parameterized component.
 */
export function CurrencyInlineSelect({ value, onChange, ariaLabel, size = "md" }: Props) {
    const current = currencyMeta(value);
    const S = SIZE_MAP[size];

    return (
        <Select
            aria-label={ariaLabel}
            selectedKeys={[value]}
            onSelectionChange={(keys) => {
                const first = Array.from(keys as Set<string>)[0];
                if (first) onChange(first);
            }}
            disableAnimation={false}
            selectorIcon={
                <svg width="11" height="11" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M3 5L6.5 8.5L10 5" />
                </svg>
            }
            renderValue={() => (
                <div className="flex items-center gap-1.5 min-w-0">
                    <Flag code={current.countryCode} size={S.flagSize} />
                    <span className={S.code}>{value}</span>
                </div>
            )}
            classNames={{
                base: S.base,
                trigger: [
                    S.trigger,
                    "bg-surface-2 border border-border-light rounded-lg",
                    "transition-colors duration-150",
                    "data-[hover=true]:border-border-medium",
                    "data-[open=true]:border-primary-500",
                ].join(" "),
                value: "flex items-center w-full",
                selectorIcon: "text-foreground/50",
                popoverContent: [
                    "bg-surface-1 border border-border-light rounded-xl overflow-hidden",
                    "z-[9999]",
                ].join(" "),
                listbox: "p-1",
            }}
        >
            {CURRENCIES.map((c) => (
                <SelectItem
                    key={c.code}
                    textValue={`${c.code} ${c.label}`}
                    classNames={{
                        base: [
                            "rounded-md px-2 py-1.5",
                            "data-[hover=true]:bg-surface-2",
                            "data-[selected=true]:bg-surface-2 data-[selected=true]:text-foreground",
                        ].join(" "),
                    }}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Flag code={c.countryCode} size={S.listFlagSize} />
                        <div className="flex flex-col min-w-0">
                            <span className={S.listCode}>{c.code}</span>
                            <span className={S.listLabel}>{c.label}</span>
                        </div>
                    </div>
                </SelectItem>
            ))}
        </Select>
    );
}

"use client";

import { Select, SelectItem } from "@heroui/react";
import type { CompanyLite } from "../hooks/use-companies-lite";

interface CompanySelectorProps {
    companies: CompanyLite[];
    loading: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
}

export function CompanySelector({ companies, loading, selectedId, onSelect }: CompanySelectorProps) {
    if (loading) {
        return (
            <div className="animate-pulse bg-surface-2 rounded-lg h-10 w-[200px]" />
        );
    }

    if (companies.length === 0) return null;

    const withRif = companies.filter((c) => c.rif);
    const withoutRif = companies.filter((c) => !c.rif);
    const allItems = [...withRif, ...withoutRif];

    const selectedKeys = selectedId ? new Set([selectedId]) : new Set<string>();

    return (
        <Select
            aria-label="Seleccionar empresa"
            placeholder="Seleccionar empresa..."
            selectedKeys={selectedKeys}
            onSelectionChange={(keys) => {
                const arr = Array.from(keys as Set<string>);
                if (arr[0]) onSelect(arr[0]);
            }}
            selectionMode="single"
            classNames={{
                base: "min-w-[200px] max-w-[280px]",
                trigger: [
                    "min-h-[38px] h-auto py-1.5 px-3",
                    "bg-surface-1 border border-border-light rounded-lg",
                    "shadow-[inset_0_1px_2px_rgba(0,0,0,.03)]",
                    "transition-all duration-150",
                    "data-[hover=true]:border-border-medium",
                    "data-[open=true]:border-primary-400",
                    "data-[open=true]:ring-2 data-[open=true]:ring-primary-500/10",
                ].join(" "),
                value: "font-mono text-[13px] text-text-primary",
                popoverContent: [
                    "bg-surface-1 border border-border-light shadow-lg rounded-xl overflow-hidden z-[9999]",
                ].join(" "),
                listbox: "p-1.5",
            }}
        >
            {allItems.map((company) => (
                <SelectItem
                    key={company.id}
                    textValue={company.name}
                    isDisabled={company.disabled}
                    classNames={{
                        base: [
                            "rounded-md px-2.5 py-1.5 transition-colors duration-100",
                            "data-[hover=true]:bg-surface-2",
                            company.disabled ? "opacity-50" : "",
                        ].join(" "),
                    }}
                >
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-primary-100 text-primary-600 text-[10px] font-mono font-bold flex items-center justify-center flex-shrink-0 dark:bg-primary-50/10 dark:text-primary-500">
                            {company.name[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div className="min-w-0">
                            <p className="font-mono text-[12px] font-medium text-text-primary truncate">
                                {company.name}
                            </p>
                            <p className="font-mono text-[10px] text-text-tertiary truncate">
                                {company.rif ?? company.disabledReason ?? "Sin RIF"}
                            </p>
                        </div>
                    </div>
                </SelectItem>
            ))}
        </Select>
    );
}

"use client";

import type { ObligationCategory } from "../data/types";
import { CATEGORY_STYLES } from "../utils/category-colors";

const ALL_CATEGORIES: ObligationCategory[] = [
    "IVA",
    "ISLR_RETENCIONES",
    "ISLR_ANUAL",
    "IGTF",
    "LOCTI",
    "RETENCIONES_ISLR_TERCEROS",
    "OTROS",
];

interface FilterChipsProps {
    activeCategories: ObligationCategory[];
    onChange: (cats: ObligationCategory[]) => void;
}

export function FilterChips({ activeCategories, onChange }: FilterChipsProps) {
    const isAllActive = activeCategories.length === 0;

    function toggleAll() {
        onChange([]);
    }

    function toggleCategory(cat: ObligationCategory) {
        if (activeCategories.includes(cat)) {
            onChange(activeCategories.filter((c) => c !== cat));
        } else {
            onChange([...activeCategories, cat]);
        }
    }

    return (
        <div
            role="group"
            aria-label="Filtrar por categoría tributaria"
        >
            <div className="flex flex-wrap gap-1.5">
                {/* All chip */}
                <button
                    role="checkbox"
                    aria-checked={isAllActive}
                    onClick={toggleAll}
                    className={[
                        "inline-flex items-center h-6 px-2.5 rounded-full border whitespace-nowrap cursor-pointer",
                        "transition-[background-color,border-color,box-shadow] duration-150 flex-shrink-0",
                        "text-[10px] font-mono uppercase tracking-[0.12em] font-medium",
                        "focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 outline-none",
                        isAllActive
                            ? "border-primary-400 bg-primary-50 text-primary-600 shadow-[0_0_0_1px_var(--primary-400)] dark:bg-primary-50/10 dark:text-primary-400 dark:border-primary-400/60"
                            : "border-border-light bg-surface-1 text-text-tertiary hover:border-border-default hover:bg-surface-2 hover:text-text-secondary",
                    ].join(" ")}
                >
                    Todos
                </button>

                {ALL_CATEGORIES.map((cat) => {
                    const style = CATEGORY_STYLES[cat];
                    const isActive = activeCategories.includes(cat);
                    const Icon = style.icon;
                    return (
                        <button
                            key={cat}
                            role="checkbox"
                            aria-checked={isActive}
                            onClick={() => toggleCategory(cat)}
                            className={[
                                "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border whitespace-nowrap cursor-pointer",
                                "transition-[background-color,border-color,box-shadow,opacity] duration-150 flex-shrink-0",
                                "text-[10px] font-mono uppercase tracking-[0.12em] font-medium",
                                "focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 outline-none",
                                isActive
                                    ? `${style.borderClass} ${style.bgClass} ${style.textClass} shadow-[0_0_0_1px_currentColor/20]`
                                    : "border-border-light bg-surface-1 text-text-tertiary hover:border-border-default hover:bg-surface-2 hover:text-text-secondary",
                            ].join(" ")}
                        >
                            <Icon size={9} strokeWidth={2.5} aria-hidden />
                            {style.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

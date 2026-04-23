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
            className="relative"
            role="group"
            aria-label="Filtrar por categoría tributaria"
        >
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {/* All chip */}
                <button
                    role="checkbox"
                    aria-checked={isAllActive}
                    onClick={toggleAll}
                    className={[
                        "inline-flex items-center gap-1.5 h-7 px-3 rounded-full border whitespace-nowrap cursor-pointer transition-colors duration-150 text-[11px] font-mono uppercase tracking-[0.12em] flex-shrink-0",
                        "focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-1 outline-none",
                        isAllActive
                            ? "border-primary-500 bg-primary-50 text-text-link dark:bg-primary-50/10"
                            : "border-border-light bg-surface-1 text-text-tertiary hover:border-border-medium hover:bg-surface-2",
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
                                "inline-flex items-center gap-1.5 h-7 px-3 rounded-full border whitespace-nowrap cursor-pointer transition-colors duration-150 text-[11px] font-mono uppercase tracking-[0.12em] flex-shrink-0",
                                "focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-1 outline-none",
                                isActive
                                    ? `${style.borderClass} ${style.bgClass} ${style.textClass}`
                                    : "border-border-light bg-surface-1 text-text-tertiary hover:border-border-medium hover:bg-surface-2",
                            ].join(" ")}
                        >
                            <Icon size={10} strokeWidth={2} />
                            {style.label}
                        </button>
                    );
                })}
            </div>
            {/* Fade gradient on right edge for mobile scroll indicator */}
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent" />
        </div>
    );
}

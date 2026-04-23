// ============================================================================
// Category Colors — mapping ObligationCategory → visual tokens + icon
// All token names map to CSS custom properties defined in globals.css
// ============================================================================

import type { ObligationCategory } from "../data/types";
import type { LucideIcon } from "lucide-react";
import {
    Receipt,
    ArrowDownLeft,
    FileText,
    TrendingUp,
    Banknote,
    FlaskConical,
    Users,
    MoreHorizontal,
} from "lucide-react";

export interface CategoryStyle {
    textClass: string;
    bgClass: string;
    borderClass: string;
    icon: LucideIcon;
    label: string;
    /** Hex color for bar fills in the mini calendar grid */
    barColor: string;
}

export const CATEGORY_STYLES: Record<ObligationCategory, CategoryStyle> = {
    IVA: {
        textClass: "text-text-info",
        bgClass: "bg-badge-info-bg",
        borderClass: "border-badge-info-border",
        icon: Receipt,
        label: "IVA",
        barColor: "var(--badge-info-border)",
    },
    ISLR_RETENCIONES: {
        textClass: "text-text-warning",
        bgClass: "bg-badge-warning-bg",
        borderClass: "border-badge-warning-border",
        icon: ArrowDownLeft,
        label: "Ret. ISLR",
        barColor: "var(--badge-warning-border)",
    },
    ISLR_ANUAL: {
        textClass: "text-text-error",
        bgClass: "bg-badge-error-bg",
        borderClass: "border-badge-error-border",
        icon: FileText,
        label: "ISLR Anual",
        barColor: "var(--badge-error-border)",
    },
    ISLR_ESTIMADA: {
        textClass: "text-text-error",
        bgClass: "bg-badge-error-bg",
        borderClass: "border-badge-error-border",
        icon: TrendingUp,
        label: "ISLR Est.",
        barColor: "var(--badge-error-border)",
    },
    IGTF: {
        textClass: "text-text-secondary",
        bgClass: "bg-surface-2",
        borderClass: "border-border-light",
        icon: Banknote,
        label: "IGTF",
        barColor: "var(--border-default)",
    },
    LOCTI: {
        textClass: "text-text-success",
        bgClass: "bg-badge-success-bg",
        borderClass: "border-badge-success-border",
        icon: FlaskConical,
        label: "LOCTI",
        barColor: "var(--badge-success-border)",
    },
    RETENCIONES_ISLR_TERCEROS: {
        textClass: "text-text-warning",
        bgClass: "bg-badge-warning-bg",
        borderClass: "border-badge-warning-border",
        icon: Users,
        label: "Ret. 3ros",
        barColor: "var(--badge-warning-border)",
    },
    OTROS: {
        textClass: "text-text-tertiary",
        bgClass: "bg-surface-3",
        borderClass: "border-border-light",
        icon: MoreHorizontal,
        label: "Otros",
        barColor: "var(--border-light)",
    },
};

/**
 * Returns the "most critical" category color from a list of categories.
 * Priority: ISLR_ANUAL/ISLR_ESTIMADA > ISLR_RETENCIONES > IVA > LOCTI > IGTF > OTROS
 */
export function getMostCriticalCategory(categories: ObligationCategory[]): ObligationCategory {
    const PRIORITY: ObligationCategory[] = [
        "ISLR_ANUAL",
        "ISLR_ESTIMADA",
        "ISLR_RETENCIONES",
        "RETENCIONES_ISLR_TERCEROS",
        "IVA",
        "LOCTI",
        "IGTF",
        "OTROS",
    ];
    for (const cat of PRIORITY) {
        if (categories.includes(cat)) return cat;
    }
    return categories[0] ?? "OTROS";
}

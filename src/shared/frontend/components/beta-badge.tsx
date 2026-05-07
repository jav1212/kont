"use client";

// Pill compacta para marcar funcionalidades en fase beta — tinte ámbar para
// diferenciarse del accent naranja primario y aún denotar precaución sin
// alarma. Tamaño deliberadamente pequeño para sentarse junto a labels de
// navegación, títulos y cards.

interface BetaBadgeProps {
    className?: string;
    /** "xs" → para sidebar subnav (h-[14px]); "sm" → para títulos de página (h-[18px]). */
    size?: "xs" | "sm";
}

export function BetaBadge({ className = "", size = "xs" }: BetaBadgeProps) {
    const sizeStyles =
        size === "sm"
            ? "h-[18px] px-1.5 text-[10px]"
            : "h-[14px] px-1   text-[9px]";

    return (
        <span
            aria-label="Funcionalidad en fase beta"
            title="En fase beta — sujeto a cambios"
            className={[
                "inline-flex items-center rounded-sm",
                "font-mono font-bold uppercase tracking-[0.12em]",
                "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
                "border border-amber-500/30",
                "flex-shrink-0",
                sizeStyles,
                className,
            ].join(" ")}
        >
            BETA
        </span>
    );
}

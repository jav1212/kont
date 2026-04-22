import type { ServiceStatus } from "@/app/api/status/_lib";

const MAP: Record<string, { label: string; dot: string; text: string; bg: string }> = {
    operational: {
        label: "Operacional",
        dot: "bg-emerald-500",
        text: "text-emerald-700 dark:text-emerald-400",
        bg: "bg-emerald-500/10",
    },
    degraded: {
        label: "Degradado",
        dot: "bg-amber-500",
        text: "text-amber-700 dark:text-amber-400",
        bg: "bg-amber-500/10",
    },
    down: {
        label: "Caído",
        dot: "bg-red-500",
        text: "text-red-700 dark:text-red-400",
        bg: "bg-red-500/10",
    },
    unknown: {
        label: "Sin datos",
        dot: "bg-foreground/30",
        text: "text-foreground/50",
        bg: "bg-surface-2",
    },
};

interface Props {
    status: ServiceStatus | null;
    size?: "sm" | "md";
    showLabel?: boolean;
    pulse?: boolean;
}

export function StatusBadge({ status, size = "md", showLabel = true, pulse = false }: Props) {
    const meta = MAP[status ?? "unknown"];
    const dotSize = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
    const textSize = size === "sm" ? "text-[10px]" : "text-[11px]";

    return (
        <span className={[
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono font-bold uppercase tracking-[0.1em]",
            meta.bg,
            meta.text,
            textSize,
        ].join(" ")}>
            <span className="relative inline-flex">
                <span className={[dotSize, "rounded-full", meta.dot].join(" ")} />
                {pulse && status !== "operational" && status !== null && (
                    <span className={[dotSize, "absolute inset-0 rounded-full animate-ping opacity-60", meta.dot].join(" ")} />
                )}
            </span>
            {showLabel && meta.label}
        </span>
    );
}

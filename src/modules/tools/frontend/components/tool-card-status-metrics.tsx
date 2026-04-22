"use client";

import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface Summary {
    operational: number;
    degraded: number;
    down: number;
}

interface ToolCardStatusMetricsProps {
    summary: Summary | null;
    loading?: boolean;
}

/**
 * Decorative mini-stats row for the /tools dashboard "Status de Portales" card.
 * Rendered inside a `<Link>` card — must NOT contain any anchors itself.
 *
 * Solid palette only: emerald / amber / red with 100/900 shades. No alpha fills.
 */
export function ToolCardStatusMetrics({ summary, loading }: ToolCardStatusMetricsProps) {
    if (loading) {
        return (
            <div className="grid grid-cols-3 gap-2">
                <MiniStatSkeleton />
                <MiniStatSkeleton />
                <MiniStatSkeleton />
            </div>
        );
    }

    const ops = summary?.operational ?? 0;
    const deg = summary?.degraded ?? 0;
    const down = summary?.down ?? 0;

    return (
        <div className="grid grid-cols-3 gap-2">
            <MiniStat
                icon={<CheckCircle2 size={12} strokeWidth={2.5} />}
                label="OK"
                value={ops}
                tone="emerald"
            />
            <MiniStat
                icon={<AlertTriangle size={12} strokeWidth={2.5} />}
                label="Degr"
                value={deg}
                tone="amber"
            />
            <MiniStat
                icon={<XCircle size={12} strokeWidth={2.5} />}
                label="Down"
                value={down}
                tone="red"
            />
        </div>
    );
}

interface MiniStatProps {
    icon: React.ReactNode;
    label: string;
    value: number;
    tone: "emerald" | "amber" | "red";
}

function MiniStat({ icon, label, value, tone }: MiniStatProps) {
    const toneCls = {
        emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
        amber:   "bg-amber-100   text-amber-700   dark:bg-amber-900   dark:text-amber-300",
        red:     "bg-red-100     text-red-700     dark:bg-red-900     dark:text-red-300",
    }[tone];

    return (
        <div
            className={[
                "flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5",
                toneCls,
            ].join(" ")}
        >
            <div className="flex items-center gap-1 min-w-0">
                <span className="shrink-0">{icon}</span>
                <span className="text-[9px] font-mono font-bold uppercase tracking-[0.12em]">
                    {label}
                </span>
            </div>
            <span className="text-[13px] font-mono font-bold tabular-nums leading-none">
                {value}
            </span>
        </div>
    );
}

function MiniStatSkeleton() {
    return (
        <div
            aria-busy="true"
            className="h-7 rounded-lg bg-surface-2 border border-border-light animate-pulse"
        />
    );
}

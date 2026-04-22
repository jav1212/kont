"use client";

import type { ServiceStatus } from "@/app/api/status/_lib";

interface Bucket {
    date: string;            // YYYY-MM-DD
    status: ServiceStatus | null;
    avgMs: number | null;
}

interface Props {
    buckets: Bucket[];       // ordered ascending (oldest → today)
    compact?: boolean;
}

/**
 * 90-day uptime bars, Atlassian-style. Each cell represents one day.
 * - green: all operational
 * - amber: at least one degraded
 * - red: at least one down
 * - gray: no data
 */
export function UptimeBars({ buckets, compact = false }: Props) {
    const barWidth = compact ? "w-[3px]" : "w-[4px]";
    const barHeight = compact ? "h-6" : "h-8";
    const gap = compact ? "gap-[1px]" : "gap-[2px]";

    return (
        <div className={`flex items-end ${gap}`} role="img" aria-label="Uptime de los últimos 90 días">
            {buckets.map((b) => (
                <div
                    key={b.date}
                    className={[
                        barWidth,
                        barHeight,
                        "rounded-sm transition-colors",
                        colorFor(b.status),
                    ].join(" ")}
                    title={tooltip(b)}
                />
            ))}
        </div>
    );
}

function colorFor(status: ServiceStatus | null): string {
    switch (status) {
        case "operational": return "bg-emerald-500 hover:bg-emerald-400";
        case "degraded":    return "bg-amber-500 hover:bg-amber-400";
        case "down":        return "bg-red-500 hover:bg-red-400";
        default:            return "bg-foreground/10 hover:bg-foreground/20";
    }
}

function tooltip(b: Bucket): string {
    if (!b.status) return `${b.date} — sin datos`;
    const label = b.status === "operational" ? "operacional" : b.status === "degraded" ? "degradado" : "caído";
    const ms = b.avgMs != null ? `, ~${b.avgMs}ms` : "";
    return `${b.date}: ${label}${ms}`;
}

"use client";

import { Tooltip } from "@heroui/react";
import type { ServiceStatus } from "@/app/api/status/_lib";

interface Bucket {
    date: string;            // YYYY-MM-DD
    status: ServiceStatus | null;
    avgMs: number | null;
}

interface Props {
    buckets: Bucket[];       // ordered ascending (oldest → today)
    compact?: boolean;
    /** When false, bars render a bit taller — used in the service detail full view. */
    expanded?: boolean;
}

const STATUS_LABEL: Record<ServiceStatus, string> = {
    operational: "Operacional",
    degraded:    "Degradado",
    down:        "Caído",
};

const STATUS_DOT: Record<ServiceStatus, string> = {
    operational: "bg-emerald-500",
    degraded:    "bg-amber-500",
    down:        "bg-red-500",
};

/**
 * 90-day uptime bars, Atlassian-style. Each cell represents one day.
 * - green: all operational
 * - amber: at least one degraded
 * - red: at least one down
 * - gray: no data
 *
 * Each cell gets a HeroUI Tooltip with the date, status label, dot and avg ms.
 */
export function UptimeBars({ buckets, compact = false, expanded = false }: Props) {
    const barWidth  = expanded ? "w-[5px]" : compact ? "w-[3px]" : "w-[4px]";
    const barHeight = expanded ? "h-10"    : compact ? "h-6"     : "h-8";
    const gap       = expanded ? "gap-[2px]" : compact ? "gap-[1px]" : "gap-[2px]";

    return (
        <div className={`flex items-end ${gap}`} role="img" aria-label="Disponibilidad día por día">
            {buckets.map((b) => (
                <Tooltip
                    key={b.date}
                    delay={200}
                    closeDelay={50}
                    placement="top"
                    content={<BucketTooltip bucket={b} />}
                    classNames={{
                        base: "bg-transparent",
                        content: "bg-background border border-border-light rounded-lg px-3 py-2 text-foreground",
                    }}
                >
                    <div
                        className={[
                            barWidth,
                            barHeight,
                            "rounded-sm transition-colors duration-150",
                            "cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                            colorFor(b.status),
                        ].join(" ")}
                        tabIndex={0}
                        aria-label={ariaLabel(b)}
                    />
                </Tooltip>
            ))}
        </div>
    );
}

function BucketTooltip({ bucket }: { bucket: Bucket }) {
    if (!bucket.status) {
        return (
            <div className="flex flex-col gap-1 min-w-[140px]">
                <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-foreground/55">
                    {formatDate(bucket.date)}
                </span>
                <span className="text-[12px] font-mono text-foreground/60">Sin datos</span>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-1.5 min-w-[160px]">
            <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-foreground/55">
                {formatDate(bucket.date)}
            </span>
            <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[bucket.status]}`} />
                <span className="text-[12px] font-mono font-bold text-foreground">
                    {STATUS_LABEL[bucket.status]}
                </span>
            </div>
            {bucket.avgMs != null && (
                <span className="text-[11px] font-mono tabular-nums text-foreground/60">
                    ~{bucket.avgMs} ms
                </span>
            )}
        </div>
    );
}

function colorFor(status: ServiceStatus | null): string {
    switch (status) {
        case "operational": return "bg-emerald-500 hover:bg-emerald-400";
        case "degraded":    return "bg-amber-500 hover:bg-amber-400";
        case "down":        return "bg-red-500 hover:bg-red-400";
        default:            return "bg-surface-2 hover:bg-surface-3";
    }
}

function ariaLabel(b: Bucket): string {
    if (!b.status) return `${b.date} sin datos`;
    const label = STATUS_LABEL[b.status].toLowerCase();
    const ms = b.avgMs != null ? `, ${b.avgMs} milisegundos` : "";
    return `${b.date}: ${label}${ms}`;
}

function formatDate(iso: string): string {
    try {
        const d = new Date(iso + "T00:00:00Z");
        return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
    } catch {
        return iso;
    }
}

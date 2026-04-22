"use client";

import Link from "next/link";
import type { StatusFilter } from "./status-shell";

interface Summary {
    operational: number;
    degraded:    number;
    down:        number;
    unknown:     number;
    total:       number;
}

interface Props {
    summary:       Summary;
    currentFilter: StatusFilter | null;
    hrefBase:      string;
    /** Compact flag — slightly smaller chips, used in the authed strip. */
    compact?:      boolean;
}

interface TabDef {
    key:   "all" | StatusFilter;
    label: string;
    dot:   string | null;
    count: number;
}

export function StatusTabs({ summary, currentFilter, hrefBase, compact = false }: Props) {
    const tabs: TabDef[] = [
        { key: "all",         label: "Todos",          dot: null,           count: summary.total       },
        { key: "operational", label: "Operacionales",  dot: "bg-emerald-500", count: summary.operational },
        { key: "degraded",    label: "Degradados",     dot: "bg-amber-500",   count: summary.degraded    },
        { key: "down",        label: "Caídos",         dot: "bg-red-500",     count: summary.down        },
    ];

    const height = compact ? "h-7" : "h-8";
    const px     = compact ? "px-2.5" : "px-3";
    const text   = compact ? "text-[10px]" : "text-[11px]";
    const dotSz  = compact ? "w-1 h-1" : "w-1.5 h-1.5";

    return (
        <nav
            role="tablist"
            aria-label="Filtrar por estado"
            className="flex items-center gap-1.5 flex-wrap"
        >
            {tabs.map((tab) => {
                const isActive = tab.key === "all" ? currentFilter == null : currentFilter === tab.key;
                const isDisabled = tab.count === 0 && tab.key !== "all";
                const href = tab.key === "all"
                    ? hrefBase
                    : `${hrefBase}?filter=${tab.key}`;

                const classes = [
                    "inline-flex items-center gap-1.5",
                    height, px, text,
                    "rounded-full border font-mono uppercase tracking-[0.1em] transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                    isActive
                        ? "border-primary-500 bg-surface-2 text-foreground"
                        : "border-border-light text-foreground/60 hover:bg-surface-2 hover:text-foreground",
                    isDisabled ? "opacity-40 pointer-events-none" : "",
                ].join(" ");

                return (
                    <Link
                        key={tab.key}
                        href={href}
                        scroll={false}
                        role="tab"
                        aria-selected={isActive}
                        aria-disabled={isDisabled || undefined}
                        tabIndex={isDisabled ? -1 : 0}
                        className={classes}
                    >
                        {tab.dot && <span className={[dotSz, "rounded-full", tab.dot].join(" ")} />}
                        <span>{tab.label}</span>
                        <span className="font-bold tabular-nums text-foreground/70">{tab.count}</span>
                    </Link>
                );
            })}
        </nav>
    );
}

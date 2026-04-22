"use client";

import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { currencyMeta } from "../utils/currency-codes";
import { useBcvHistory } from "../hooks/use-bcv-history";
import { formatRate, formatIsoDateEs } from "../utils/format-number";
import { CurrencyInlineSelect } from "./currency-inline-select";

const WIDTH = 720;
const HEIGHT = 240;
const PADDING = { top: 16, right: 16, bottom: 28, left: 56 };
const INNER_W = WIDTH - PADDING.left - PADDING.right;
const INNER_H = HEIGHT - PADDING.top - PADDING.bottom;

// Tooltip dimensions used for edge-clamping in viewBox units.
const TOOLTIP_W = 150;
const TOOLTIP_H = 56;

const RANGES = [
    { days: 7,  label: "7D" },
    { days: 14, label: "14D" },
    { days: 30, label: "30D" },
    { days: 60, label: "60D" },
    { days: 90, label: "90D" },
];

export function HistoryChart() {
    const [code, setCode] = useState<string>("USD");
    const [days, setDays] = useState<number>(30);
    const { points, loading, error } = useBcvHistory(code, days);
    const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);
    // Unique per-instance id so multiple charts on the same page don't share Framer layoutId.
    const pillGroupId = useId();

    const { path, dots, minY, maxY, xAt, yAt, first, last, pct } = useMemo(() => {
        if (points.length === 0) {
            return { path: "", dots: [] as { x: number; y: number; p: typeof points[number] }[], minY: 0, maxY: 0, xAt: () => 0, yAt: () => 0, first: null, last: null, pct: null };
        }
        const values = points.map((p) => p.sell);
        const rawMin = Math.min(...values);
        const rawMax = Math.max(...values);
        const range = rawMax - rawMin || 1;
        const padRange = range * 0.1;
        const minY = rawMin - padRange;
        const maxY = rawMax + padRange;

        const xAt = (i: number) => PADDING.left + (i / Math.max(1, points.length - 1)) * INNER_W;
        const yAt = (v: number) => PADDING.top + (1 - (v - minY) / (maxY - minY)) * INNER_H;

        const dots = points.map((p, i) => ({ x: xAt(i), y: yAt(p.sell), p }));
        const path = dots.map((d, i) => `${i === 0 ? "M" : "L"} ${d.x.toFixed(2)} ${d.y.toFixed(2)}`).join(" ");

        const first = points[0];
        const last = points[points.length - 1];
        const pct = first && last && first.sell > 0 ? ((last.sell - first.sell) / first.sell) * 100 : null;

        return { path, dots, minY, maxY, xAt, yAt, first, last, pct };
    }, [points]);

    const yTicks = useMemo(() => {
        if (!isFinite(minY) || !isFinite(maxY) || minY === maxY) return [];
        const n = 4;
        return Array.from({ length: n + 1 }).map((_, i) => minY + ((maxY - minY) * i) / n);
    }, [minY, maxY]);

    const xTicks = useMemo(() => {
        if (points.length === 0) return [];
        const n = Math.min(5, points.length);
        return Array.from({ length: n }).map((_, i) => {
            const idx = Math.round((i / (n - 1 || 1)) * (points.length - 1));
            return { idx, label: points[idx]?.date.slice(5) ?? "" };
        });
    }, [points]);

    function handleMove(e: React.MouseEvent<SVGRectElement>) {
        if (!dots.length) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
        const closest = dots.reduce((best, d, i) => {
            const dist = Math.abs(d.x - px);
            return dist < best.dist ? { dist, idx: i, x: d.x, y: d.y } : best;
        }, { dist: Infinity, idx: 0, x: 0, y: 0 });
        setHover({ idx: closest.idx, x: closest.x, y: closest.y });
    }

    const active = hover ? points[hover.idx] : null;
    const trend = pct == null ? 0 : pct > 0 ? 1 : pct < 0 ? -1 : 0;
    const currentMeta = currencyMeta(code);

    // Tooltip clamping — keep inside viewBox.
    let tooltipLeftPct = 50;
    let tooltipTopPct = 50;
    let tooltipTransform = "translate(-50%, -130%)";
    if (hover) {
        const clampedX = Math.min(Math.max(hover.x, TOOLTIP_W / 2 + 4), WIDTH - TOOLTIP_W / 2 - 4);
        tooltipLeftPct = (clampedX / WIDTH) * 100;
        tooltipTopPct = (hover.y / HEIGHT) * 100;
        // If hover is near the top, flip tooltip below the cursor.
        const flipBelow = hover.y < TOOLTIP_H + PADDING.top + 10;
        tooltipTransform = flipBelow ? "translate(-50%, 30%)" : "translate(-50%, -130%)";
    }

    // Unique key for line animation — only replays when series identity changes.
    const seriesKey = `${code}-${days}-${points.length}`;

    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden">
            {/* Header — two rows on mobile, one on desktop */}
            <div className="px-6 py-4 border-b border-border-light flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    <CurrencyInlineSelect
                        value={code}
                        onChange={setCode}
                        ariaLabel="Moneda del histórico"
                        size="sm"
                    />
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Evolución {currentMeta.code}
                        </p>
                        <div className="flex items-baseline gap-2 mt-0.5">
                            {last && (
                                <>
                                    <span className="text-[15px] font-mono font-bold tabular-nums text-foreground">
                                        Bs. {formatRate(last.sell)}
                                    </span>
                                    {pct != null && (
                                        <span
                                            className={[
                                                "inline-flex items-center gap-0.5 text-[11px] font-mono tabular-nums font-bold",
                                                trend > 0 ? "text-emerald-700 dark:text-emerald-300" : "",
                                                trend < 0 ? "text-red-700 dark:text-red-300" : "",
                                                trend === 0 ? "text-foreground/50" : "",
                                            ].join(" ")}
                                        >
                                            {trend > 0 ? <TrendingUp size={10} /> : trend < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                                            {pct > 0 ? "+" : ""}{pct.toFixed(2)}%
                                        </span>
                                    )}
                                </>
                            )}
                            {!last && (
                                <span className="text-[11px] text-foreground/50 font-mono">
                                    Precio de venta oficial BCV
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Range pills — segmented control with layoutId indicator */}
                <div
                    role="group"
                    aria-label="Rango de tiempo"
                    className="inline-flex items-center p-1 rounded-lg bg-surface-2 border border-border-light self-start md:self-auto"
                >
                    {RANGES.map((r) => {
                        const isActive = days === r.days;
                        return (
                            <button
                                key={r.days}
                                type="button"
                                onClick={() => setDays(r.days)}
                                aria-pressed={isActive}
                                className={[
                                    "relative h-8 px-3 rounded-md text-[11px] font-mono font-bold uppercase tracking-[0.12em]",
                                    "transition-colors duration-150",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                                    isActive ? "text-foreground" : "text-foreground/55 hover:text-foreground",
                                ].join(" ")}
                            >
                                {isActive && (
                                    <motion.span
                                        layoutId={`range-pill-${pillGroupId}`}
                                        aria-hidden
                                        className="absolute inset-0 rounded-md bg-surface-1 border border-border-medium"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                                    />
                                )}
                                <span className="relative">{r.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="p-4 relative">
                {error ? (
                    <div className="py-12 text-center text-[12px] text-foreground/50 uppercase tracking-[0.12em] font-mono">
                        {error}
                    </div>
                ) : loading && !points.length ? (
                    <div className="aspect-[3/1] bg-surface-2 rounded-lg animate-pulse" />
                ) : !points.length ? (
                    <div className="py-12 text-center text-[12px] text-foreground/50 uppercase tracking-[0.12em] font-mono">
                        Sin datos disponibles
                    </div>
                ) : (
                    <svg
                        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                        className="w-full h-auto"
                        role="img"
                        aria-label={`Histórico de ${code} (${days} días)`}
                    >
                        <defs>
                            <linearGradient id="kont-hist-area" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"  stopColor="rgb(255,74,24)" stopOpacity="0.22" />
                                <stop offset="60%" stopColor="rgb(255,74,24)" stopOpacity="0.06" />
                                <stop offset="100%" stopColor="rgb(255,74,24)" stopOpacity="0" />
                            </linearGradient>
                            <linearGradient id="kont-hist-line" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="rgb(217,58,16)" />
                                <stop offset="100%" stopColor="rgb(255,74,24)" />
                            </linearGradient>
                        </defs>

                        {/* Grid + Y ticks */}
                        {yTicks.map((v, i) => {
                            const y = yAt(v);
                            return (
                                <g key={i}>
                                    <line
                                        x1={PADDING.left}
                                        x2={WIDTH - PADDING.right}
                                        y1={y} y2={y}
                                        stroke="currentColor"
                                        strokeOpacity={0.07}
                                        strokeDasharray="2 4"
                                    />
                                    <text
                                        x={PADDING.left - 10} y={y + 3.5}
                                        textAnchor="end" fontSize={10}
                                        fill="currentColor" fillOpacity={0.45}
                                        fontFamily="ui-monospace, monospace"
                                    >
                                        {formatRate(v)}
                                    </text>
                                </g>
                            );
                        })}

                        {/* X ticks */}
                        {xTicks.map((t, i) => (
                            <text
                                key={i}
                                x={xAt(t.idx)} y={HEIGHT - 8}
                                textAnchor="middle" fontSize={10}
                                fill="currentColor" fillOpacity={0.45}
                                fontFamily="ui-monospace, monospace"
                            >
                                {t.label}
                            </text>
                        ))}

                        {/* Area fill under the line */}
                        {path && (
                            <path
                                d={`${path} L ${dots[dots.length - 1].x} ${PADDING.top + INNER_H} L ${dots[0].x} ${PADDING.top + INNER_H} Z`}
                                fill="url(#kont-hist-area)"
                            />
                        )}

                        {/* Line — animated pathLength on series change */}
                        {path && (
                            <motion.path
                                key={seriesKey}
                                d={path}
                                fill="none"
                                stroke="url(#kont-hist-line)"
                                strokeWidth={2.25}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                initial={{ pathLength: 0, opacity: 0.4 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                            />
                        )}

                        {/* First + last markers */}
                        {first && last && dots.length > 1 && (
                            <>
                                <circle cx={dots[0].x} cy={dots[0].y} r={3} fill="var(--surface-1, white)" stroke="rgb(255,74,24)" strokeWidth={2} />
                                <circle cx={dots[dots.length - 1].x} cy={dots[dots.length - 1].y} r={4.5} fill="rgb(255,74,24)" stroke="var(--surface-1, white)" strokeWidth={2} />
                            </>
                        )}

                        {/* Hover dot */}
                        {hover && (
                            <circle
                                cx={hover.x}
                                cy={hover.y}
                                r={5}
                                fill="rgb(255,74,24)"
                                stroke="var(--surface-1, white)"
                                strokeWidth={2}
                            />
                        )}

                        {/* Hover guide */}
                        {hover && (
                            <line
                                x1={hover.x} x2={hover.x}
                                y1={PADDING.top} y2={HEIGHT - PADDING.bottom}
                                stroke="currentColor" strokeOpacity={0.18}
                                strokeDasharray="3 3"
                            />
                        )}

                        {/* Hover capture layer */}
                        <rect
                            x={PADDING.left}
                            y={PADDING.top}
                            width={INNER_W}
                            height={INNER_H}
                            fill="transparent"
                            onMouseMove={handleMove}
                            onMouseLeave={() => setHover(null)}
                        />
                    </svg>
                )}

                {/* Tooltip — edge-clamped so it never overflows the chart area */}
                {active && hover && (
                    <div
                        className="absolute pointer-events-none rounded-lg border border-border-medium bg-surface-1 px-3 py-2"
                        style={{
                            left: `${tooltipLeftPct}%`,
                            top: `${tooltipTopPct}%`,
                            transform: tooltipTransform,
                        }}
                    >
                        <div className="text-foreground/50 text-[10px] uppercase tracking-[0.14em] font-mono">
                            {formatIsoDateEs(active.date)}
                        </div>
                        <div className="font-mono font-bold tabular-nums text-[13px] text-foreground">
                            Bs. {formatRate(active.sell)}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

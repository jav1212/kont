"use client";

// Compact dual-line chart comparing USD and EUR BCV sell rates over time.
// Uses two Y-axes (USD left, EUR right) since absolute prices differ in scale.
// Designed for the /tools dashboard overview.

import { useMemo, useState } from "react";
import { useBcvHistory } from "../hooks/use-bcv-history";
import { formatRate, formatIsoDateEs } from "../utils/format-number";

const WIDTH = 720;
const HEIGHT = 220;
const PADDING = { top: 18, right: 56, bottom: 28, left: 56 };
const INNER_W = WIDTH - PADDING.left - PADDING.right;
const INNER_H = HEIGHT - PADDING.top - PADDING.bottom;

const COLORS = {
    usd: { stroke: "rgb(16, 185, 129)",  area: "rgba(16, 185, 129, 0.08)" },   // emerald-500
    eur: { stroke: "rgb(59, 130, 246)",  area: "rgba(59, 130, 246, 0.08)" },   // blue-500
} as const;

type Series = { code: "USD" | "EUR"; label: string; points: { date: string; sell: number }[]; min: number; max: number };

export function DualRateChart() {
    const [days, setDays] = useState<number>(30);
    const usd = useBcvHistory("USD", days);
    const eur = useBcvHistory("EUR", days);
    const [hover, setHover] = useState<{ idx: number; x: number } | null>(null);

    const loading = usd.loading || eur.loading;
    const error = usd.error ?? eur.error;

    // Align both series on a shared ordered date axis
    const dates = useMemo(() => {
        const set = new Set<string>();
        for (const p of usd.points) set.add(p.date);
        for (const p of eur.points) set.add(p.date);
        return [...set].sort();
    }, [usd.points, eur.points]);

    const series: { usd: Series; eur: Series } | null = useMemo(() => {
        if (!dates.length) return null;
        const usdMap = new Map(usd.points.map((p) => [p.date, p.sell]));
        const eurMap = new Map(eur.points.map((p) => [p.date, p.sell]));

        const usdPoints = dates.map((d) => ({ date: d, sell: usdMap.get(d) ?? NaN }));
        const eurPoints = dates.map((d) => ({ date: d, sell: eurMap.get(d) ?? NaN }));

        const usdVals = usdPoints.map((p) => p.sell).filter(isFinite);
        const eurVals = eurPoints.map((p) => p.sell).filter(isFinite);
        if (!usdVals.length || !eurVals.length) return null;

        return {
            usd: { code: "USD", label: "Dólar", points: usdPoints, min: Math.min(...usdVals), max: Math.max(...usdVals) },
            eur: { code: "EUR", label: "Euro",  points: eurPoints, min: Math.min(...eurVals), max: Math.max(...eurVals) },
        };
    }, [dates, usd.points, eur.points]);

    const geom = useMemo(() => {
        if (!series) return null;
        const pad = (min: number, max: number) => {
            const range = max - min || 1;
            const p = range * 0.12;
            return { lo: min - p, hi: max + p };
        };
        const u = pad(series.usd.min, series.usd.max);
        const e = pad(series.eur.min, series.eur.max);

        const xAt = (i: number) => PADDING.left + (dates.length === 1 ? INNER_W / 2 : (i / (dates.length - 1)) * INNER_W);
        const yUsd = (v: number) => PADDING.top + (1 - (v - u.lo) / (u.hi - u.lo)) * INNER_H;
        const yEur = (v: number) => PADDING.top + (1 - (v - e.lo) / (e.hi - e.lo)) * INNER_H;

        const mkPath = (points: { sell: number }[], yFn: (v: number) => number) => {
            let d = "";
            let started = false;
            points.forEach((p, i) => {
                if (!isFinite(p.sell)) { started = false; return; }
                d += `${started ? " L" : "M"} ${xAt(i).toFixed(2)} ${yFn(p.sell).toFixed(2)}`;
                started = true;
            });
            return d;
        };

        return {
            xAt,
            yUsd,
            yEur,
            usdPath: mkPath(series.usd.points, yUsd),
            eurPath: mkPath(series.eur.points, yEur),
            usdDomain: u,
            eurDomain: e,
        };
    }, [series, dates]);

    const xTicks = useMemo(() => {
        if (!dates.length) return [];
        const n = Math.min(5, dates.length);
        return Array.from({ length: n }).map((_, i) => {
            const idx = Math.round((i / (n - 1 || 1)) * (dates.length - 1));
            return { idx, label: dates[idx]?.slice(5) ?? "" };
        });
    }, [dates]);

    const yTicks = (lo: number, hi: number) =>
        Array.from({ length: 5 }).map((_, i) => lo + ((hi - lo) * i) / 4);

    function handleMove(e: React.MouseEvent<SVGRectElement>) {
        if (!dates.length || !geom) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
        let bestIdx = 0;
        let bestDist = Infinity;
        dates.forEach((_, i) => {
            const dist = Math.abs(geom.xAt(i) - px);
            if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        });
        setHover({ idx: bestIdx, x: geom.xAt(bestIdx) });
    }

    const active = hover && series
        ? { date: dates[hover.idx], usd: series.usd.points[hover.idx]?.sell, eur: series.eur.points[hover.idx]?.sell }
        : null;

    const latestUsd = series?.usd.points.findLast?.((p) => isFinite(p.sell))?.sell
        ?? series?.usd.points.slice().reverse().find((p) => isFinite(p.sell))?.sell;
    const latestEur = series?.eur.points.findLast?.((p) => isFinite(p.sell))?.sell
        ?? series?.eur.points.slice().reverse().find((p) => isFinite(p.sell))?.sell;

    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm shadow-black/5">
            <div className="px-5 sm:px-6 py-4 border-b border-border-light flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-col min-w-0">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                        Dólar vs Euro
                    </p>
                    <p className="text-[11px] text-foreground/50 mt-0.5">
                        Tasa oficial BCV — precio de venta
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-4 text-[11px] font-mono" aria-label="Leyenda">
                        <LegendItem color={COLORS.usd.stroke} label="USD" value={latestUsd} />
                        <LegendItem color={COLORS.eur.stroke} label="EUR" value={latestEur} />
                    </div>
                    <select
                        value={days}
                        onChange={(e) => setDays(parseInt(e.target.value, 10))}
                        className="h-9 rounded-lg border border-border-light bg-surface-2 px-3 text-[13px] font-mono focus:outline-none focus:border-primary-500"
                        aria-label="Rango de días"
                    >
                        <option value={7}>7 días</option>
                        <option value={14}>14 días</option>
                        <option value={30}>30 días</option>
                        <option value={60}>60 días</option>
                        <option value={90}>90 días</option>
                    </select>
                </div>
            </div>

            {/* Mobile legend row — duplicate of header legend for small screens */}
            <div className="sm:hidden flex items-center justify-start gap-4 px-5 pt-3 text-[11px] font-mono border-b border-border-light/60">
                <LegendItem color={COLORS.usd.stroke} label="USD" value={latestUsd} />
                <LegendItem color={COLORS.eur.stroke} label="EUR" value={latestEur} />
            </div>

            <div className="p-4 relative">
                {error ? (
                    <div className="py-12 text-center text-[12px] text-foreground/50 uppercase tracking-[0.12em]">
                        {error}
                    </div>
                ) : loading && !series ? (
                    <div className="aspect-[3/1] bg-surface-2/50 rounded-lg animate-pulse" />
                ) : !series || !geom ? (
                    <div className="py-12 text-center text-[12px] text-foreground/50 uppercase tracking-[0.12em]">
                        Sin datos disponibles
                    </div>
                ) : (
                    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label={`Histórico USD vs EUR ${days} días`}>
                        {/* Y ticks (USD left) */}
                        {yTicks(geom.usdDomain.lo, geom.usdDomain.hi).map((v, i) => {
                            const y = geom.yUsd(v);
                            return (
                                <g key={`uy-${i}`}>
                                    <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.06} />
                                    <text x={PADDING.left - 8} y={y + 3} textAnchor="end" fontSize={10} fill={COLORS.usd.stroke} fillOpacity={0.8} fontFamily="ui-monospace, monospace">
                                        {formatRate(v)}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Y ticks (EUR right) */}
                        {yTicks(geom.eurDomain.lo, geom.eurDomain.hi).map((v, i) => {
                            const y = geom.yEur(v);
                            return (
                                <text key={`ey-${i}`} x={WIDTH - PADDING.right + 8} y={y + 3} textAnchor="start" fontSize={10} fill={COLORS.eur.stroke} fillOpacity={0.8} fontFamily="ui-monospace, monospace">
                                    {formatRate(v)}
                                </text>
                            );
                        })}

                        {/* X ticks */}
                        {xTicks.map((t, i) => (
                            <text key={i} x={geom.xAt(t.idx)} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.5} fontFamily="ui-monospace, monospace">
                                {t.label}
                            </text>
                        ))}

                        {/* USD area + line */}
                        <path d={geom.usdPath} fill="none" stroke={COLORS.usd.stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                        {/* EUR area + line */}
                        <path d={geom.eurPath} fill="none" stroke={COLORS.eur.stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

                        {/* Hover guide + markers */}
                        {hover && (
                            <>
                                <line x1={hover.x} x2={hover.x} y1={PADDING.top} y2={HEIGHT - PADDING.bottom} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" />
                                {isFinite(series.usd.points[hover.idx]?.sell) && (
                                    <circle cx={hover.x} cy={geom.yUsd(series.usd.points[hover.idx].sell)} r={4} fill={COLORS.usd.stroke} stroke="var(--surface-1, white)" strokeWidth={1.5} />
                                )}
                                {isFinite(series.eur.points[hover.idx]?.sell) && (
                                    <circle cx={hover.x} cy={geom.yEur(series.eur.points[hover.idx].sell)} r={4} fill={COLORS.eur.stroke} stroke="var(--surface-1, white)" strokeWidth={1.5} />
                                )}
                            </>
                        )}

                        {/* Hover capture */}
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

                {active && hover && (
                    <div
                        className="absolute pointer-events-none rounded-lg border border-border-light bg-surface-1 shadow-lg px-3 py-2 text-[12px] font-mono"
                        style={{
                            left: `${(hover.x / WIDTH) * 100}%`,
                            top: `${PADDING.top / HEIGHT * 100}%`,
                            transform: "translate(-50%, -100%)",
                        }}
                    >
                        <div className="text-foreground/50 text-[10px] uppercase tracking-[0.1em] mb-0.5">
                            {formatIsoDateEs(active.date)}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ background: COLORS.usd.stroke }} />
                                <span className="tabular-nums font-bold">{active.usd != null && isFinite(active.usd) ? `Bs. ${formatRate(active.usd)}` : "—"}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ background: COLORS.eur.stroke }} />
                                <span className="tabular-nums font-bold">{active.eur != null && isFinite(active.eur) ? `Bs. ${formatRate(active.eur)}` : "—"}</span>
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number | undefined }) {
    return (
        <span className="inline-flex items-center gap-1.5" aria-label={`${label} actual`}>
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            <span className="font-bold tracking-[0.08em] uppercase text-foreground/60 text-[10px]">{label}</span>
            <span className="tabular-nums font-bold text-foreground">
                {value != null && isFinite(value) ? `Bs. ${formatRate(value)}` : "—"}
            </span>
        </span>
    );
}

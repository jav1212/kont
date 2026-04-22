"use client";

import { useMemo, useState } from "react";
import { CURRENCIES } from "../utils/currency-codes";
import { useBcvHistory } from "../hooks/use-bcv-history";
import { formatRate, formatIsoDateEs } from "../utils/format-number";

const WIDTH = 720;
const HEIGHT = 240;
const PADDING = { top: 16, right: 16, bottom: 28, left: 56 };
const INNER_W = WIDTH - PADDING.left - PADDING.right;
const INNER_H = HEIGHT - PADDING.top - PADDING.bottom;

export function HistoryChart() {
    const [code, setCode] = useState<string>("USD");
    const [days, setDays] = useState<number>(30);
    const { points, loading, error } = useBcvHistory(code, days);
    const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);

    const { path, dots, minY, maxY, xAt, yAt } = useMemo(() => {
        if (points.length === 0) {
            return { path: "", dots: [] as { x: number; y: number; p: typeof points[number] }[], minY: 0, maxY: 0, xAt: () => 0, yAt: () => 0 };
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
        return { path, dots, minY, maxY, xAt, yAt };
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

    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm shadow-black/5">
            <div className="px-6 py-4 border-b border-border-light bg-surface-1/60 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex flex-col">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                        Evolución histórica
                    </p>
                    <p className="text-[11px] text-foreground/50 mt-0.5">
                        Precio de venta oficial BCV
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="h-9 rounded-lg border border-border-light bg-surface-2 px-3 text-[13px] font-mono font-bold focus:outline-none focus:border-primary-500"
                    >
                        {CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code}>{c.code}</option>
                        ))}
                    </select>
                    <select
                        value={days}
                        onChange={(e) => setDays(parseInt(e.target.value, 10))}
                        className="h-9 rounded-lg border border-border-light bg-surface-2 px-3 text-[13px] font-mono focus:outline-none focus:border-primary-500"
                    >
                        <option value={7}>7 días</option>
                        <option value={14}>14 días</option>
                        <option value={30}>30 días</option>
                        <option value={60}>60 días</option>
                        <option value={90}>90 días</option>
                    </select>
                </div>
            </div>

            <div className="p-4 relative">
                {error ? (
                    <div className="py-12 text-center text-[12px] text-foreground/50 uppercase tracking-[0.12em]">
                        {error}
                    </div>
                ) : loading && !points.length ? (
                    <div className="aspect-[3/1] bg-surface-2/50 rounded-lg animate-pulse" />
                ) : !points.length ? (
                    <div className="py-12 text-center text-[12px] text-foreground/50 uppercase tracking-[0.12em]">
                        Sin datos disponibles
                    </div>
                ) : (
                    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label={`Histórico de ${code} (${days} días)`}>
                        {/* Grid + Y ticks */}
                        {yTicks.map((v, i) => {
                            const y = yAt(v);
                            return (
                                <g key={i}>
                                    <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.08} />
                                    <text x={PADDING.left - 8} y={y + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.5} fontFamily="ui-monospace, monospace">
                                        {formatRate(v)}
                                    </text>
                                </g>
                            );
                        })}

                        {/* X ticks */}
                        {xTicks.map((t, i) => (
                            <text key={i} x={xAt(t.idx)} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.5} fontFamily="ui-monospace, monospace">
                                {t.label}
                            </text>
                        ))}

                        {/* Area fill under the line */}
                        {path && (
                            <path
                                d={`${path} L ${dots[dots.length - 1].x} ${PADDING.top + INNER_H} L ${dots[0].x} ${PADDING.top + INNER_H} Z`}
                                fill="rgba(255,74,24,0.08)"
                            />
                        )}

                        {/* Line */}
                        {path && (
                            <path d={path} fill="none" stroke="rgb(255,74,24)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                        )}

                        {/* Dots */}
                        {dots.map((d, i) => (
                            <circle key={i} cx={d.x} cy={d.y} r={hover?.idx === i ? 4 : 2} fill="rgb(255,74,24)" stroke="var(--surface-1, white)" strokeWidth={1.5} />
                        ))}

                        {/* Hover guide */}
                        {hover && (
                            <line x1={hover.x} x2={hover.x} y1={PADDING.top} y2={HEIGHT - PADDING.bottom} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" />
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

                {/* Tooltip */}
                {active && hover && (
                    <div
                        className="absolute pointer-events-none rounded-lg border border-border-light bg-surface-1 shadow-lg px-3 py-2 text-[12px] font-mono"
                        style={{
                            left: `${(hover.x / WIDTH) * 100}%`,
                            top: `${(hover.y / HEIGHT) * 100}%`,
                            transform: "translate(-50%, -120%)",
                        }}
                    >
                        <div className="text-foreground/50 text-[10px] uppercase tracking-[0.1em]">
                            {formatIsoDateEs(active.date)}
                        </div>
                        <div className="font-bold tabular-nums">Bs. {formatRate(active.sell)}</div>
                    </div>
                )}
            </div>
        </div>
    );
}

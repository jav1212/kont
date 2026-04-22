"use client";

import { useMemo } from "react";
import { useBcvHistory } from "../hooks/use-bcv-history";

interface Props {
    code: string;
    /** Days of history to plot. Default 7. */
    days?: number;
    /** Width (px) of the SVG viewBox. Default 84. */
    width?: number;
    /** Height (px) of the SVG viewBox. Default 28. */
    height?: number;
}

/**
 * Tiny trend line next to a rate value. Pure SVG, no grid, no axes, no ticks.
 * Uses the shared `useBcvHistory` cache (5 min TTL) so the same code/days
 * across multiple sparklines hits the network once.
 *
 * Placeholder states keep the same footprint to avoid CLS:
 * - `loading` before first fetch → pulsing bar
 * - `error` or < 2 points → empty spacer
 */
export function RateSparkline({ code, days = 7, width = 84, height = 28 }: Props) {
    const { points, loading, error } = useBcvHistory(code, days);

    const { path, area, trendUp } = useMemo(() => {
        if (points.length < 2) return { path: "", area: "", trendUp: true };

        const values = points.map((p) => p.sell);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const pad = 2;

        const xAt = (i: number) => (i / (points.length - 1)) * width;
        const yAt = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2);

        const segments = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(p.sell).toFixed(2)}`).join(" ");
        const areaPath = `${segments} L ${xAt(points.length - 1).toFixed(2)} ${height} L 0 ${height} Z`;
        const up = values[values.length - 1] >= values[0];
        return { path: segments, area: areaPath, trendUp: up };
    }, [points, width, height]);

    if (loading && points.length < 2) {
        return (
            <div
                aria-hidden
                className="h-[28px] w-full max-w-[120px] rounded bg-surface-2 animate-pulse"
                style={{ height }}
            />
        );
    }

    if (error || points.length < 2) {
        return <div aria-hidden className="h-[28px] w-full max-w-[120px]" style={{ height }} />;
    }

    const gradientId = `kont-spark-area-${code}`;
    const lineGradientId = `kont-spark-line-${code}`;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full max-w-[120px]"
            style={{ height }}
            role="img"
            aria-label={`Tendencia ${days}d · ${code}`}
            preserveAspectRatio="none"
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor="rgb(255,74,24)" stopOpacity={trendUp ? 0.22 : 0.14} />
                    <stop offset="100%" stopColor="rgb(255,74,24)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id={lineGradientId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"  stopColor="rgb(217,58,16)" />
                    <stop offset="100%" stopColor="rgb(255,74,24)" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            <path
                d={path}
                fill="none"
                stroke={`url(#${lineGradientId})`}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}

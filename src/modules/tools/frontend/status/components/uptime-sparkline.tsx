"use client";

import { useMemo } from "react";
import type { ServiceWithStatus } from "../hooks/use-status-services";

interface Props {
    services: ServiceWithStatus[];
    /** Number of trailing days to plot. Default 30. */
    days?: number;
    /** Width (px) of the SVG viewBox. Default 120. */
    width?: number;
    /** Height (px) of the SVG viewBox. Default 28. */
    height?: number;
    className?: string;
}

/**
 * Tiny trend line summarising global uptime % over the last `days` days.
 * Pure SVG, no grid, no axes — sister component of `RateSparkline`.
 *
 * Per-day uptime = average across all services that had data that day, where
 *   operational = 1, degraded = 0.5, down = 0, null = excluded from average.
 * Days where every service is `null` become null and are skipped in the path.
 *
 * Colour tiers (based on trailing 7-day average):
 *   >= 95 → primary gradient (brand)
 *   >= 90 → amber
 *   <  90 → red
 */
export function UptimeSparkline({ services, days = 30, width = 120, height = 28, className }: Props) {
    const { path, area, trendColor, points } = useMemo(() => {
        if (!services.length) return { path: "", area: "", trendColor: "primary" as const, points: [] as (number | null)[] };

        const allBuckets = services.map((s) => s.uptimeBuckets);
        const bucketCount = Math.max(0, ...allBuckets.map((b) => b.length));
        const dayCount = Math.min(days, bucketCount);
        if (dayCount < 2) return { path: "", area: "", trendColor: "primary" as const, points: [] };

        const startIdx = bucketCount - dayCount;
        const daily: (number | null)[] = [];

        for (let i = 0; i < dayCount; i++) {
            let sum = 0;
            let n = 0;
            for (const buckets of allBuckets) {
                const b = buckets[startIdx + i];
                if (!b || b.status === null) continue;
                const v = b.status === "operational" ? 1 : b.status === "degraded" ? 0.5 : 0;
                sum += v;
                n++;
            }
            daily.push(n > 0 ? (sum / n) * 100 : null);
        }

        // Linear interpolation for null gaps so the path stays continuous
        const filled = daily.map((v) => v);
        for (let i = 0; i < filled.length; i++) {
            if (filled[i] == null) {
                let left = i - 1, right = i + 1;
                while (left >= 0 && filled[left] == null) left--;
                while (right < filled.length && filled[right] == null) right++;
                if (left >= 0 && right < filled.length) {
                    const a = filled[left]!, b = filled[right]!;
                    filled[i] = a + ((b - a) * (i - left)) / (right - left);
                } else if (left >= 0) {
                    filled[i] = filled[left];
                } else if (right < filled.length) {
                    filled[i] = filled[right];
                } else {
                    filled[i] = 100;
                }
            }
        }

        const values = filled.map((v) => v ?? 100);
        if (values.length < 2) return { path: "", area: "", trendColor: "primary" as const, points: daily };

        // Domain: clamp between 0-100 but add small padding so the line doesn't hug the top
        const min = 0;
        const max = 100;
        const range = max - min || 1;
        const pad = 2;

        const xAt = (i: number) => (i / (values.length - 1)) * width;
        const yAt = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2);

        const segments = values.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`).join(" ");
        const areaPath = `${segments} L ${xAt(values.length - 1).toFixed(2)} ${height} L 0 ${height} Z`;

        // Trailing 7-day average to decide colour
        const tail = values.slice(-7);
        const tailAvg = tail.reduce((s, v) => s + v, 0) / tail.length;
        const tier: "primary" | "amber" | "red" = tailAvg >= 95 ? "primary" : tailAvg >= 90 ? "amber" : "red";

        return { path: segments, area: areaPath, trendColor: tier, points: daily };
    }, [services, days, width, height]);

    if (!services.length || points.length < 2) {
        return (
            <div
                aria-hidden
                className={["w-full max-w-[120px] rounded bg-surface-2 animate-pulse", className ?? ""].join(" ")}
                style={{ height, maxWidth: width }}
            />
        );
    }

    const palette: Record<typeof trendColor, { line: [string, string]; fill: string }> = {
        primary: { line: ["rgb(217,58,16)", "rgb(255,74,24)"], fill: "rgb(255,74,24)" },
        amber:   { line: ["rgb(217,119,6)", "rgb(245,158,11)"], fill: "rgb(245,158,11)" },
        red:     { line: ["rgb(185,28,28)", "rgb(239,68,68)"], fill: "rgb(239,68,68)" },
    };
    const colors = palette[trendColor];
    const gradientId = `kont-uptime-area-${trendColor}-${width}`;
    const lineGradientId = `kont-uptime-line-${trendColor}-${width}`;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className={["w-full max-w-[120px]", className ?? ""].join(" ")}
            style={{ height, maxWidth: width }}
            role="img"
            aria-label={`Tendencia de uptime últimos ${days} días`}
            preserveAspectRatio="none"
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor={colors.fill} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={colors.fill} stopOpacity="0" />
                </linearGradient>
                <linearGradient id={lineGradientId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"  stopColor={colors.line[0]} />
                    <stop offset="100%" stopColor={colors.line[1]} />
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

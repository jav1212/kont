"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, Server, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Tooltip } from "@heroui/react";
import type { HistoryResponse } from "@/app/api/status/history/route";
import { StatusBadge } from "./status-badge";
import { UptimeBars } from "./uptime-bars";
import { AnimatedNumber } from "../../components/animated-number";

interface Props {
    slug:      string;
    hrefBase:  string; // "/herramientas/status" | "/tools/status"
    backLabel?: string;
}

type Range = "24h" | "7d";

const STAGGER_STEP = 0.08;
const section = (i: number) => ({
    initial:    { opacity: 0, y: 8 },
    animate:    { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay: i * STAGGER_STEP, ease: "easeOut" as const },
});

export function ServiceDetail({ slug, hrefBase, backLabel = "Volver" }: Props) {
    const [data, setData]       = useState<HistoryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);
    const [range, setRange]     = useState<Range>("24h");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const hours = range === "24h" ? 24 : 168;
                const res = await fetch(`/api/status/history?slug=${encodeURIComponent(slug)}&hours=${hours}`, { cache: "no-store" });
                const body = await res.json();
                if (cancelled) return;
                if (!res.ok) { setError(body.error ?? "No se pudo cargar."); setLoading(false); return; }
                setData(body.data);
            } catch {
                if (!cancelled) setError("No se pudo conectar.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [slug, range]);

    // Buckets-from-points: the service API doesn't return 90d buckets for detail,
    // so we reconstruct them from `points` when possible. Fallback: 90 empty days.
    // Memoised before any early return so the hook order stays stable.
    const detailBuckets = useMemo(
        () => buildBucketsFromPoints(data?.points ?? [], 90),
        [data?.points],
    );

    if (loading && !data) {
        return <DetailSkeleton hrefBase={hrefBase} backLabel={backLabel} />;
    }
    if (error || !data) {
        return (
            <div className="flex flex-col gap-6">
                <Link href={hrefBase} className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.12em] text-foreground/60 hover:text-foreground w-fit">
                    <ArrowLeft size={14} />
                    {backLabel}
                </Link>
                <div className="rounded-2xl border border-red-500 bg-red-100 dark:bg-red-900 px-4 py-3 text-[13px] text-red-700 dark:text-red-300 font-mono">
                    {error ?? "Sin datos."}
                </div>
            </div>
        );
    }

    const latestStatus = data.points.length ? data.points[data.points.length - 1].status : null;
    const serverPoints = data.points.filter((p) => p.source === "server").length;
    const clientPoints = data.points.filter((p) => p.source === "client").length;
    const lastCheckAt  = data.points.length ? data.points[data.points.length - 1].checkedAt : null;

    return (
        <div className="flex flex-col gap-6">
            <Link href={hrefBase} className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.12em] text-foreground/60 hover:text-foreground w-fit">
                <ArrowLeft size={14} />
                {backLabel}
            </Link>

            {/* Section 0 — Hero */}
            <motion.div {...section(0)}>
                <header className="relative rounded-2xl overflow-hidden border border-border-light bg-surface-1">
                    <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-8 p-6 sm:p-8 items-start md:items-center">
                        <div className="min-w-0 flex flex-col gap-3">
                            <div className="flex items-center gap-3 flex-wrap">
                                <StatusBadge status={latestStatus} size="md" pulse />
                                <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-foreground/50">
                                    {data.service.category}
                                </span>
                            </div>
                            <h1 className="text-[28px] sm:text-[32px] font-mono font-bold tracking-[-0.01em] leading-tight text-foreground">
                                {data.service.name}
                            </h1>
                            <a
                                href={data.service.url}
                                target="_blank"
                                rel="noreferrer nofollow"
                                className="inline-flex items-center gap-1 text-[12px] text-foreground/55 hover:text-foreground font-mono w-fit"
                            >
                                {data.service.url}
                                <ExternalLink size={12} />
                            </a>
                        </div>

                        <UptimeStatsCards uptime={data.uptime} />
                    </div>

                    <div className="relative border-t border-border-light bg-surface-2 px-6 sm:px-8 py-3 flex items-center gap-3 flex-wrap text-[11px] font-mono uppercase tracking-[0.12em] text-foreground/55">
                        <span className="inline-flex items-center gap-1.5">
                            <Server size={11} />
                            <span className="tabular-nums">{serverPoints}</span> desde servidor
                        </span>
                        <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
                        <span className="inline-flex items-center gap-1.5">
                            <Users size={11} />
                            <span className="tabular-nums">{clientPoints}</span> desde usuarios
                        </span>
                        {lastCheckAt && (
                            <>
                                <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
                                <span>Último check {formatRelative(lastCheckAt)}</span>
                            </>
                        )}
                    </div>
                </header>
            </motion.div>

            {/* Section 1 — 90d uptime bars full-width */}
            <motion.div {...section(1)}>
                <div className="rounded-2xl border border-border-light bg-surface-1 px-6 py-5">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/60">
                            Disponibilidad últimos 90 días
                        </h2>
                        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.12em] text-foreground/55">
                            <LegendDot color="bg-emerald-500" label="Operacional" />
                            <LegendDot color="bg-amber-500"   label="Degradado"   />
                            <LegendDot color="bg-red-500"     label="Caído"        />
                            <LegendDot color="bg-surface-2"   label="Sin datos"    outline />
                        </div>
                    </div>
                    <UptimeBars buckets={detailBuckets} expanded />
                    <div className="flex items-center justify-between mt-3 text-[10px] font-mono uppercase tracking-[0.12em] text-foreground/40">
                        <span>hace 90 días</span>
                        <span>hoy</span>
                    </div>
                </div>
            </motion.div>

            {/* Section 2 — Latency chart */}
            <motion.div {...section(2)}>
                <LatencyChart points={data.points} range={range} onRangeChange={setRange} />
            </motion.div>

            {/* Section 3 — Stat cards */}
            <motion.div {...section(3)}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Stat
                        label="Puntos de datos"
                        value={String(data.points.length)}
                        hint={`${serverPoints} servidor · ${clientPoints} visitantes`}
                    />
                    <Stat
                        label="Ventana"
                        value={`${data.hours}h`}
                        hint={range === "24h" ? "Últimas 24 horas" : "Últimos 7 días"}
                    />
                    <Stat
                        label="Incidentes"
                        value={String(data.incidents.length)}
                        hint={data.incidents.length === 0 ? "Sin registros" : "En los últimos 90 días"}
                    />
                </div>
            </motion.div>

            {/* Section 4 — Incidents */}
            <motion.div {...section(4)}>
                <IncidentsTimeline incidents={data.incidents} />
            </motion.div>

            {/* Section 5 — Recent checks */}
            <motion.div {...section(5)}>
                <RecentChecksList points={data.points.slice(-30).reverse()} />
            </motion.div>
        </div>
    );
}

// ── UptimeStatsCards ────────────────────────────────────────────────────────

function UptimeStatsCards({ uptime }: { uptime: HistoryResponse["uptime"] }) {
    return (
        <div className="grid grid-cols-3 gap-2 md:gap-3">
            <PctCard label="7d"  value={uptime.days7}  />
            <PctCard label="30d" value={uptime.days30} />
            <PctCard label="90d" value={uptime.days90} />
        </div>
    );
}

function PctCard({ label, value }: { label: string; value: number | null }) {
    const text = value == null ? "—" : `${value.toFixed(2)}%`;
    const color = value == null
        ? "text-foreground/40"
        : value >= 99 ? "text-emerald-600 dark:text-emerald-400"
        : value >= 95 ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
    return (
        <div className="rounded-xl border border-border-light bg-surface-2 px-4 py-3 flex flex-col items-start min-w-[88px]">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/55">
                {label}
            </span>
            <AnimatedNumber
                value={text}
                className={`text-[24px] font-mono font-bold tabular-nums ${color} mt-0.5`}
            />
        </div>
    );
}

// ── Legend ──────────────────────────────────────────────────────────────────

function LegendDot({ color, label, outline = false }: { color: string; label: string; outline?: boolean }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span
                className={[
                    "w-2 h-2 rounded-sm",
                    outline ? "border border-border-medium" : "",
                    color,
                ].join(" ")}
            />
            {label}
        </span>
    );
}

// ── Stat ────────────────────────────────────────────────────────────────────

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/55">{label}</div>
            <AnimatedNumber
                value={value}
                className="text-[22px] font-mono font-bold tabular-nums text-foreground mt-1"
            />
            {hint && <div className="text-[11px] text-foreground/45 mt-0.5 font-mono">{hint}</div>}
        </div>
    );
}

// ── LatencyChart ────────────────────────────────────────────────────────────

interface LatencyChartProps {
    points:         HistoryResponse["points"];
    range:          Range;
    onRangeChange:  (r: Range) => void;
}

function LatencyChart({ points, range, onRangeChange }: LatencyChartProps) {
    if (!points.length) {
        return (
            <div className="rounded-2xl border border-border-light bg-surface-1 px-6 py-8 flex flex-col gap-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/60">
                        Latencia
                    </h2>
                    <RangeToggle range={range} onChange={onRangeChange} />
                </div>
                <div className="text-center text-[12px] text-foreground/40 uppercase tracking-[0.12em] font-mono py-6">
                    Sin datos suficientes aún
                </div>
            </div>
        );
    }

    const responseValues = points.map((p) => p.responseMs ?? 0).filter((v) => v > 0);
    const maxMs = responseValues.length ? Math.max(...responseValues) : 1000;
    const minMs = responseValues.length ? Math.min(...responseValues) : 0;
    const avgMs = responseValues.length ? Math.round(responseValues.reduce((s, v) => s + v, 0) / responseValues.length) : 0;
    const scaleMax = Math.max(maxMs, 1000);

    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 px-6 py-5">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                <div className="flex flex-col gap-1">
                    <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/60">
                        Latencia
                    </h2>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-foreground/60">
                        <span className="inline-flex items-center gap-1">
                            <span className="text-foreground/40 uppercase tracking-[0.12em] text-[10px]">max</span>
                            <span className="tabular-nums font-bold text-foreground">{maxMs}</span>
                            <span className="text-foreground/40">ms</span>
                        </span>
                        <span className="text-foreground/30">·</span>
                        <span className="inline-flex items-center gap-1">
                            <span className="text-foreground/40 uppercase tracking-[0.12em] text-[10px]">avg</span>
                            <span className="tabular-nums font-bold text-foreground">{avgMs}</span>
                            <span className="text-foreground/40">ms</span>
                        </span>
                        <span className="text-foreground/30">·</span>
                        <span className="inline-flex items-center gap-1">
                            <span className="text-foreground/40 uppercase tracking-[0.12em] text-[10px]">min</span>
                            <span className="tabular-nums font-bold text-foreground">{minMs}</span>
                            <span className="text-foreground/40">ms</span>
                        </span>
                    </div>
                </div>
                <RangeToggle range={range} onChange={onRangeChange} />
            </div>

            <div className="flex items-end gap-[2px] h-28" role="img" aria-label="Gráfica de latencia">
                {points.map((p, i) => {
                    const h = p.responseMs != null ? Math.max(2, (p.responseMs / scaleMax) * 100) : 2;
                    const color = p.status === "operational" ? "bg-emerald-500"
                        : p.status === "degraded" ? "bg-amber-500"
                        : "bg-red-500";
                    return (
                        <Tooltip
                            key={i}
                            delay={200}
                            closeDelay={50}
                            placement="top"
                            content={<LatencyBarTooltip point={p} />}
                            classNames={{
                                base: "bg-transparent",
                                content: "bg-background border border-border-light rounded-lg px-3 py-2 text-foreground",
                            }}
                        >
                            <motion.div
                                className={`flex-1 rounded-sm origin-bottom ${color}`}
                                style={{ minWidth: 2, height: `${h}%` }}
                                initial={{ scaleY: 0 }}
                                animate={{ scaleY: 1 }}
                                transition={{ duration: 0.35, delay: Math.min(i * 0.006, 0.6), ease: "easeOut" }}
                                role="img"
                                aria-label={`${new Date(p.checkedAt).toLocaleString("es-VE")}: ${p.responseMs ?? "sin datos"} ms, ${p.status}`}
                            />
                        </Tooltip>
                    );
                })}
            </div>
        </div>
    );
}

function LatencyBarTooltip({ point }: { point: HistoryResponse["points"][number] }) {
    return (
        <div className="flex flex-col gap-1 min-w-[180px]">
            <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-foreground/55">
                {new Date(point.checkedAt).toLocaleString("es-VE")}
            </span>
            <div className="flex items-center gap-1.5">
                <StatusBadge status={point.status} size="sm" />
                {point.responseMs != null && (
                    <span className="text-[12px] font-mono tabular-nums text-foreground">
                        {point.responseMs} ms
                    </span>
                )}
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.12em] text-foreground/50">
                {point.source === "server" ? <Server size={10} /> : <Users size={10} />}
                {point.source === "server" ? "Desde nuestro servidor" : "Desde un usuario"}
            </span>
        </div>
    );
}

function RangeToggle({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
    const btn = (key: Range, label: string) => {
        const isActive = range === key;
        return (
            <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                aria-pressed={isActive}
                className={[
                    "h-7 px-2.5 rounded-full border text-[10px] font-mono uppercase tracking-[0.14em] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                    isActive
                        ? "border-primary-500 bg-surface-2 text-foreground"
                        : "border-border-light text-foreground/60 hover:bg-surface-2 hover:text-foreground",
                ].join(" ")}
            >
                {label}
            </button>
        );
    };
    return (
        <div className="flex items-center gap-1" role="group" aria-label="Ventana de tiempo">
            {btn("24h", "24h")}
            {btn("7d", "7d")}
        </div>
    );
}

// ── IncidentsTimeline ───────────────────────────────────────────────────────

function IncidentsTimeline({ incidents }: { incidents: HistoryResponse["incidents"] }) {
    if (!incidents.length) {
        return (
            <div className="rounded-2xl border border-emerald-500 bg-emerald-100 dark:bg-emerald-900 px-6 py-5 flex items-center gap-3">
                <CheckCircle2 className="text-emerald-700 dark:text-emerald-300 shrink-0" size={20} strokeWidth={2.25} />
                <div className="flex flex-col min-w-0">
                    <span className="text-[14px] font-mono font-bold text-emerald-700 dark:text-emerald-300">
                        Sin incidentes en los últimos 90 días
                    </span>
                    <span className="text-[12px] text-emerald-700/80 dark:text-emerald-300/80 font-mono">
                        El servicio ha estado estable
                    </span>
                </div>
            </div>
        );
    }

    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/60">
                Incidentes recientes
            </h2>
            <div className="relative pl-5 ml-2 border-l-2 border-border-light">
                <div className="flex flex-col gap-3">
                    {incidents.map((inc, i) => {
                        const resolved = !!inc.resolvedAt;
                        const duration = resolved && inc.resolvedAt
                            ? formatDuration(new Date(inc.resolvedAt).getTime() - new Date(inc.startedAt).getTime())
                            : null;
                        const dotColor = resolved ? "bg-emerald-500" : "bg-red-500";
                        return (
                            <motion.div
                                key={inc.id}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.25, delay: i * 0.05, ease: "easeOut" }}
                                className="relative rounded-xl border border-border-light bg-surface-1 px-4 py-3"
                            >
                                <span
                                    className={[
                                        "absolute -left-[calc(1.25rem+5px)] top-4 w-3 h-3 rounded-full border-2 border-background",
                                        dotColor,
                                        !resolved ? "animate-pulse" : "",
                                    ].join(" ")}
                                    aria-hidden
                                />
                                <div className="flex items-center gap-2 justify-between flex-wrap">
                                    <span className="text-[12px] font-mono uppercase tracking-[0.1em] text-foreground/60">
                                        Inicio: {new Date(inc.startedAt).toLocaleString("es-VE")}
                                    </span>
                                    <span className={[
                                        "text-[11px] font-mono uppercase tracking-[0.1em] font-bold",
                                        resolved ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300",
                                    ].join(" ")}>
                                        {resolved
                                            ? `Resuelto · ${duration}`
                                            : "En curso"}
                                    </span>
                                </div>
                                {inc.description && (
                                    <p className="text-[13px] text-foreground/70 mt-1 font-mono leading-relaxed">
                                        {inc.description}
                                    </p>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

// ── RecentChecksList ────────────────────────────────────────────────────────

function RecentChecksList({ points }: { points: HistoryResponse["points"] }) {
    if (!points.length) return null;
    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/60">
                Checks recientes
            </h2>
            <div className="rounded-xl border border-border-light bg-surface-1 divide-y divide-border-light overflow-hidden">
                {points.map((p, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-[12px] font-mono hover:bg-surface-2 transition-colors">
                        <StatusBadge status={p.status} size="sm" showLabel={false} />
                        <Tooltip
                            delay={200}
                            closeDelay={50}
                            placement="top"
                            content={
                                <span className="text-[11px] font-mono">
                                    {new Date(p.checkedAt).toLocaleString("es-VE")}
                                </span>
                            }
                            classNames={{
                                base: "bg-transparent",
                                content: "bg-background border border-border-light rounded-lg px-2.5 py-1.5 text-foreground",
                            }}
                        >
                            <span className="flex-1 text-foreground/70 cursor-default">
                                {formatRelative(p.checkedAt)}
                            </span>
                        </Tooltip>
                        <span className="text-foreground/55 tabular-nums w-16 text-right">{p.responseMs ?? "—"} ms</span>
                        <Tooltip
                            delay={200}
                            closeDelay={50}
                            placement="top"
                            content={
                                <span className="text-[11px] font-mono">
                                    {p.source === "server" ? "Desde nuestro servidor" : "Desde un usuario"}
                                </span>
                            }
                            classNames={{
                                base: "bg-transparent",
                                content: "bg-background border border-border-light rounded-lg px-2.5 py-1.5 text-foreground",
                            }}
                        >
                            <span
                                className="text-foreground/40 inline-flex items-center shrink-0 cursor-default"
                                aria-label={p.source === "server" ? "Desde nuestro servidor" : "Desde un usuario"}
                            >
                                {p.source === "server" ? <Server size={12} /> : <Users size={12} />}
                            </span>
                        </Tooltip>
                    </div>
                ))}
            </div>
        </section>
    );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function DetailSkeleton({ hrefBase, backLabel }: { hrefBase: string; backLabel: string }) {
    return (
        <div className="flex flex-col gap-6">
            <Link href={hrefBase} className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.12em] text-foreground/60 hover:text-foreground w-fit">
                <ArrowLeft size={14} />
                {backLabel}
            </Link>
            <div aria-hidden className="rounded-2xl border border-border-light bg-surface-1 h-48 animate-pulse" />
            <div aria-hidden className="rounded-2xl border border-border-light bg-surface-1 h-32 animate-pulse" />
            <div aria-hidden className="rounded-2xl border border-border-light bg-surface-1 h-40 animate-pulse" />
        </div>
    );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60_000);
    if (mins < 1) return "ahora mismo";
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.round(hours / 24);
    return `hace ${days}d`;
}

function formatDuration(ms: number): string {
    const minutes = Math.round(ms / 60_000);
    if (minutes < 1) return "<1m";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.round(hours / 24);
    return `${days}d ${hours % 24}h`;
}

function buildBucketsFromPoints(
    points: HistoryResponse["points"],
    days: number,
): { date: string; status: "operational" | "degraded" | "down" | null; avgMs: number | null }[] {
    const byDay = new Map<string, { statuses: ("operational" | "degraded" | "down")[]; ms: number[] }>();
    for (const p of points) {
        const day = p.checkedAt.slice(0, 10);
        const entry = byDay.get(day) ?? { statuses: [], ms: [] };
        entry.statuses.push(p.status);
        if (p.responseMs != null) entry.ms.push(p.responseMs);
        byDay.set(day, entry);
    }

    const rank = { down: 3, degraded: 2, operational: 1 } as const;
    const today = new Date();
    const out: { date: string; status: "operational" | "degraded" | "down" | null; avgMs: number | null }[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() - i);
        const iso = d.toISOString().slice(0, 10);
        const entry = byDay.get(iso);
        if (!entry || entry.statuses.length === 0) {
            out.push({ date: iso, status: null, avgMs: null });
            continue;
        }
        let worst: "operational" | "degraded" | "down" = "operational";
        for (const s of entry.statuses) if (rank[s] > rank[worst]) worst = s;
        const avg = entry.ms.length ? Math.round(entry.ms.reduce((s, v) => s + v, 0) / entry.ms.length) : null;
        out.push({ date: iso, status: worst, avgMs: avg });
    }
    return out;
}

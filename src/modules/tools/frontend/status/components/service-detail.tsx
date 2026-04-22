"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Server, Users } from "lucide-react";
import type { HistoryResponse } from "@/app/api/status/history/route";
import { StatusBadge } from "./status-badge";

interface Props {
    slug: string;
    hrefBase: string; // "/herramientas/status" | "/tools/status"
    backLabel?: string;
}

export function ServiceDetail({ slug, hrefBase, backLabel = "Volver" }: Props) {
    const [data, setData] = useState<HistoryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/status/history?slug=${encodeURIComponent(slug)}&hours=24`, { cache: "no-store" });
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
    }, [slug]);

    if (loading) {
        return <div className="rounded-2xl border border-border-light bg-surface-1 h-40 animate-pulse" />;
    }
    if (error || !data) {
        return (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13px] text-red-700 dark:text-red-300">
                {error ?? "Sin datos."}
            </div>
        );
    }

    const latestStatus = data.points.length ? data.points[data.points.length - 1].status : null;
    const serverPoints = data.points.filter((p) => p.source === "server").length;
    const clientPoints = data.points.filter((p) => p.source === "client").length;

    return (
        <div className="flex flex-col gap-6">
            <Link href={hrefBase} className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.12em] text-foreground/60 hover:text-foreground w-fit">
                <ArrowLeft size={14} />
                {backLabel}
            </Link>

            <div className="rounded-2xl border border-border-light bg-surface-1 px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-[22px] font-mono font-bold text-foreground">{data.service.name}</h1>
                        <StatusBadge status={latestStatus} />
                    </div>
                    <a
                        href={data.service.url}
                        target="_blank"
                        rel="noreferrer nofollow"
                        className="inline-flex items-center gap-1 text-[12px] text-foreground/50 hover:text-foreground mt-1"
                    >
                        {data.service.url}
                        <ExternalLink size={12} />
                    </a>
                </div>
                <UptimeStats uptime={data.uptime} />
            </div>

            <LatencyChart points={data.points} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Stat label="Puntos de datos" value={`${data.points.length}`} hint={`${serverPoints} servidor · ${clientPoints} crowd`} />
                <Stat label="Ventana" value={`${data.hours}h`} hint="Últimas" />
                <Stat label="Incidentes" value={`${data.incidents.length}`} hint="Recientes" />
            </div>

            {data.incidents.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/60">Incidentes recientes</h2>
                    <div className="flex flex-col gap-2">
                        {data.incidents.map((inc) => (
                            <div key={inc.id} className="rounded-xl border border-border-light bg-surface-1 px-4 py-3">
                                <div className="flex items-center gap-2 justify-between flex-wrap">
                                    <span className="text-[12px] font-mono uppercase tracking-[0.1em] text-foreground/60">
                                        Inicio: {new Date(inc.startedAt).toLocaleString("es-VE")}
                                    </span>
                                    <span className={`text-[11px] font-mono uppercase tracking-[0.1em] ${inc.resolvedAt ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                        {inc.resolvedAt ? `Resuelto: ${new Date(inc.resolvedAt).toLocaleString("es-VE")}` : "En curso"}
                                    </span>
                                </div>
                                {inc.description && <p className="text-[13px] text-foreground/70 mt-1">{inc.description}</p>}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <RecentChecksList points={data.points.slice(-30).reverse()} />
        </div>
    );
}

function UptimeStats({ uptime }: { uptime: HistoryResponse["uptime"] }) {
    return (
        <div className="flex items-center gap-4">
            <Pct label="7d" value={uptime.days7} />
            <Pct label="30d" value={uptime.days30} />
            <Pct label="90d" value={uptime.days90} />
        </div>
    );
}

function Pct({ label, value }: { label: string; value: number | null }) {
    const text = value == null ? "—" : `${value.toFixed(2)}%`;
    const color = value == null
        ? "text-foreground/40"
        : value >= 99 ? "text-emerald-600 dark:text-emerald-400"
        : value >= 95 ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
    return (
        <div className="flex flex-col items-center">
            <span className={`text-[16px] font-mono font-bold tabular-nums ${color}`}>{text}</span>
            <span className="text-[10px] uppercase tracking-[0.12em] text-foreground/40">{label}</span>
        </div>
    );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/50">{label}</div>
            <div className="text-[20px] font-mono font-bold tabular-nums text-foreground mt-1">{value}</div>
            {hint && <div className="text-[11px] text-foreground/40 mt-0.5">{hint}</div>}
        </div>
    );
}

function LatencyChart({ points }: { points: HistoryResponse["points"] }) {
    if (!points.length) {
        return (
            <div className="rounded-2xl border border-border-light bg-surface-1 px-6 py-8 text-center text-[12px] text-foreground/40 uppercase tracking-[0.12em]">
                Sin datos suficientes aún
            </div>
        );
    }

    const maxMs = Math.max(...points.map((p) => p.responseMs ?? 0), 1000);

    return (
        <div className="rounded-2xl border border-border-light bg-surface-1 px-6 py-5">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/60">Latencia últimas 24h</h2>
                <span className="text-[10px] uppercase tracking-[0.12em] text-foreground/40">Max: {maxMs} ms</span>
            </div>
            <div className="flex items-end gap-[2px] h-24" role="img" aria-label="Gráfica de latencia">
                {points.map((p, i) => {
                    const h = p.responseMs != null ? Math.max(2, (p.responseMs / maxMs) * 100) : 2;
                    const color = p.status === "operational" ? "bg-emerald-500"
                        : p.status === "degraded" ? "bg-amber-500"
                        : "bg-red-500";
                    return (
                        <div
                            key={i}
                            className={`flex-1 rounded-sm transition-all ${color}`}
                            style={{ height: `${h}%`, minWidth: 2 }}
                            title={`${new Date(p.checkedAt).toLocaleTimeString("es-VE")} · ${p.responseMs ?? "—"} ms · ${p.status}`}
                        />
                    );
                })}
            </div>
        </div>
    );
}

function RecentChecksList({ points }: { points: HistoryResponse["points"] }) {
    if (!points.length) return null;
    return (
        <section className="flex flex-col gap-2">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/60">Checks recientes</h2>
            <div className="rounded-xl border border-border-light bg-surface-1 divide-y divide-border-light overflow-hidden">
                {points.map((p, i) => (
                    <div key={i} className="px-4 py-2 flex items-center gap-3 text-[12px] font-mono">
                        <StatusBadge status={p.status} size="sm" showLabel={false} />
                        <span className="flex-1 text-foreground/70">{new Date(p.checkedAt).toLocaleString("es-VE")}</span>
                        <span className="text-foreground/50 tabular-nums w-16 text-right">{p.responseMs ?? "—"} ms</span>
                        <span className="text-foreground/40 inline-flex items-center gap-1" title={p.source === "server" ? "Desde servidor" : "Desde visitante"}>
                            {p.source === "server" ? <Server size={10} /> : <Users size={10} />}
                            <span className="uppercase text-[10px] tracking-[0.1em]">{p.source}</span>
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

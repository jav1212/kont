"use client";

import Link from "next/link";
import { ExternalLink, Server, Users, ChevronRight } from "lucide-react";
import type { ServiceWithStatus } from "../hooks/use-status-services";
import { StatusBadge } from "./status-badge";
import { UptimeBars } from "./uptime-bars";

interface Props {
    service: ServiceWithStatus;
    hrefBase: string; // "/herramientas/status" | "/tools/status"
}

export function ServiceRow({ service, hrefBase }: Props) {
    const s = service;
    return (
        <Link
            href={`${hrefBase}/${s.slug}`}
            className="group block rounded-xl border border-border-light bg-surface-1 hover:border-primary-500/40 hover:shadow-sm transition-all"
        >
            <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[14px] font-mono font-bold text-foreground">{s.name}</h3>
                        <StatusBadge status={s.lastStatus} size="sm" pulse />
                        {s.lastSource && (
                            <span
                                className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.1em] text-foreground/40"
                                title={s.lastSource === "server" ? "Último dato: nuestro servidor" : "Último dato: aporte de un visitante"}
                            >
                                {s.lastSource === "server" ? <Server size={10} /> : <Users size={10} />}
                                {s.lastSource === "server" ? "srv" : "crowd"}
                            </span>
                        )}
                    </div>
                    {s.description && (
                        <p className="text-[12px] text-foreground/50 mt-0.5 truncate">{s.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-foreground/40 font-mono">
                        {s.lastResponseMs != null && <span className="tabular-nums">{s.lastResponseMs} ms</span>}
                        {s.lastCheckedAt && <span>· {formatRelative(s.lastCheckedAt)}</span>}
                    </div>
                </div>

                <div className="hidden sm:block shrink-0">
                    <UptimeBars buckets={s.uptimeBuckets} compact />
                </div>

                <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer nofollow"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-surface-2 text-foreground/40 hover:text-foreground transition-colors"
                    aria-label={`Abrir ${s.name}`}
                    title="Abrir portal"
                >
                    <ExternalLink size={14} />
                </a>
                <ChevronRight size={16} className="shrink-0 text-foreground/30 group-hover:text-foreground/60 group-hover:translate-x-0.5 transition-all" />
            </div>
        </Link>
    );
}

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

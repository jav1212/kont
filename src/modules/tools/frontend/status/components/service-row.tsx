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

// Uses the "overlay Link" pattern: the card is a div, with a full-surface
// Link stretched absolutely behind the content and an external-link <a>
// positioned on top. This avoids nesting <a> inside <a> (invalid HTML).
export function ServiceRow({ service, hrefBase }: Props) {
    const s = service;
    return (
        <div className="group relative rounded-xl border border-border-light bg-surface-1 hover:border-primary-500/40 hover:shadow-sm transition-all">
            <Link
                href={`${hrefBase}/${s.slug}`}
                aria-label={`Ver detalle de ${s.name}`}
                className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            />
            <div className="relative z-10 flex items-center gap-4 px-5 py-4 pointer-events-none">
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
                    className="pointer-events-auto relative z-20 shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-surface-2 text-foreground/40 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                    aria-label={`Abrir ${s.name} en nueva pestaña`}
                    title="Abrir portal"
                >
                    <ExternalLink size={14} />
                </a>
                <ChevronRight size={16} className="shrink-0 text-foreground/30 group-hover:text-foreground/60 group-hover:translate-x-0.5 transition-all" />
            </div>
        </div>
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

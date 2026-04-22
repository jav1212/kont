import type { ServicesResponse } from "@/app/api/status/services/route";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface Props {
    summary: ServicesResponse["summary"] | null;
    lastCheckAt: string | null;
}

export function StatusSummary({ summary, lastCheckAt }: Props) {
    if (!summary) return null;
    const { operational, degraded, down, unknown, total } = summary;
    const allUp = operational === total && total > 0;
    const anyDown = down > 0;

    const headline = allUp
        ? "Todos los portales operacionales"
        : anyDown
            ? `${down} ${down === 1 ? "portal caído" : "portales caídos"}`
            : degraded > 0
                ? `${degraded} ${degraded === 1 ? "portal con fallas" : "portales con fallas"}`
                : "Verificando portales…";

    const headlineColor = allUp
        ? "text-emerald-700 dark:text-emerald-400"
        : anyDown
            ? "text-red-700 dark:text-red-400"
            : degraded > 0
                ? "text-amber-700 dark:text-amber-400"
                : "text-foreground/60";

    const Icon = allUp ? CheckCircle2 : anyDown ? XCircle : AlertTriangle;

    return (
        <div className={[
            "rounded-2xl border px-6 py-5 flex items-center justify-between gap-4 flex-wrap",
            allUp ? "border-emerald-500/30 bg-emerald-500/5" : anyDown ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5",
        ].join(" ")}>
            <div className="flex items-center gap-3 min-w-0">
                <Icon size={24} className={headlineColor} strokeWidth={2.25} />
                <div className="min-w-0">
                    <h2 className={`text-[17px] font-mono font-bold leading-tight ${headlineColor}`}>
                        {headline}
                    </h2>
                    <p className="text-[12px] text-foreground/60 mt-0.5">
                        {operational} operacional{operational === 1 ? "" : "es"} · {degraded} con fallas · {down} caído{down === 1 ? "" : "s"}
                        {unknown > 0 && ` · ${unknown} sin datos`}
                    </p>
                </div>
            </div>
            {lastCheckAt && (
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-foreground/50">
                    Última verificación del servidor: {formatRelative(lastCheckAt)}
                </div>
            )}
        </div>
    );
}

function formatRelative(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60_000);
    if (mins < 1) return "ahora mismo";
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.round(hours / 24);
    return `hace ${days}d`;
}

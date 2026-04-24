"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, TrendingUp, TrendingDown } from "lucide-react";
import { useBcvRate } from "@/src/shared/frontend/components/bcv-pill";
import { buildCalendar, getNextUpcoming } from "@/src/modules/tools/seniat-calendar/utils/calendar-builder";

// ============================================================================
// Live Tools Strip — replaces the old "Herramientas gratuitas" cards. Each
// card shows real product output instead of promotional copy:
//
//   1. BCV card     → live rate from /api/bcv/rate + 100 USD conversion preview
//   2. SENIAT card  → next upcoming obligation computed from the 2026 calendar
//   3. Status card  → live summary from /api/status/services (operational count)
//
// The goal is "the product working, not selling itself". Visitors see type,
// numbers, and the orange dot — which *is* the brand story per konta-design.
// ============================================================================

const MONTHS_ES_LONG = [
    "enero","febrero","marzo","abril","mayo","junio",
    "julio","agosto","septiembre","octubre","noviembre","diciembre",
];

function todayIsoCaracas(): string {
    const now = new Date();
    const offsetMs = -4 * 60 * 60 * 1000; // Caracas is UTC-4
    return new Date(now.getTime() + offsetMs).toISOString().split("T")[0];
}

function daysBetween(isoFrom: string, isoTo: string): number {
    const a = new Date(isoFrom + "T00:00:00Z").getTime();
    const b = new Date(isoTo   + "T00:00:00Z").getTime();
    return Math.round((b - a) / 86_400_000);
}

function formatIsoShort(iso: string): string {
    const [, m, d] = iso.split("-");
    const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    return `${Number(d)} ${months[Number(m) - 1]}`;
}

// ----------------------------------------------------------------------------
// BCV card — shows live rate + a 100-USD conversion preview.
// ----------------------------------------------------------------------------

function LiveBcvCard() {
    const rate = useBcvRate();

    const conversion = rate
        ? (rate.rate * 100).toLocaleString("es-VE", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          })
        : null;

    return (
        <LiveCard
            href="/herramientas/divisas"
            eyebrow="Tasa BCV · USD"
            cta="Abrir calculadora"
        >
            {rate ? (
                <>
                    <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[44px] md:text-[48px] tabular-nums font-black text-foreground leading-none tracking-[-0.02em]">
                            {rate.value}
                        </span>
                        <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-text-tertiary font-semibold">
                            Bs./USD
                        </span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-border-light">
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary font-semibold mb-1">
                            Ejemplo
                        </p>
                        <p className="font-mono text-[13px] tabular-nums text-foreground">
                            $100 <span className="text-text-tertiary">=</span> Bs. {conversion}
                        </p>
                    </div>
                    <FreshnessPill label={`Actualizada ${formatIsoShort(rate.dateIso)}`} tone="ok" />
                </>
            ) : (
                <CardSkeleton lines={2} />
            )}
        </LiveCard>
    );
}

// ----------------------------------------------------------------------------
// SENIAT card — computes the next upcoming obligation from the 2026 calendar
// using a neutral default (RIF digit 0, contribuyente ordinario) so the number
// is meaningful even without the user specifying their RIF.
// ----------------------------------------------------------------------------

interface SeniatCardData {
    entry: { title: string; dueDate: string; period: string };
    today: string;
}

function LiveSeniatCard() {
    const [data, setData] = useState<SeniatCardData | null>(null);

    // Defer the client-only computation to a microtask so the setState doesn't
    // run synchronously in the effect body — this avoids the cascading render
    // that `react-hooks/set-state-in-effect` warns about, and matches the
    // fetch().then() pattern used by the sibling status card. The computation
    // itself is synchronous (buildCalendar is pure) but must run on the
    // client because it depends on `new Date()`.
    useEffect(() => {
        let cancelled = false;
        Promise.resolve().then(() => {
            if (cancelled) return;
            const iso = todayIsoCaracas();
            try {
                const year = Number(iso.slice(0, 4));
                const cal = buildCalendar({ year, lastDigit: 0, taxpayerType: "ordinario" });
                const next = getNextUpcoming(cal, iso);
                if (!next) return;
                setData({
                    entry: {
                        title:   next.shortTitle || next.title,
                        dueDate: next.dueDate,
                        period:  next.period,
                    },
                    today: iso,
                });
            } catch {
                /* silent — skeleton remains */
            }
        });
        return () => { cancelled = true; };
    }, []);

    const entry = data?.entry ?? null;
    const days  = data ? daysBetween(data.today, data.entry.dueDate) : null;
    const countdownLabel =
        days === null ? "" :
        days <= 0     ? "Vence hoy" :
        days === 1    ? "Vence mañana" :
        `Vence en ${days} días`;

    const dueMonth = entry ? MONTHS_ES_LONG[Number(entry.dueDate.slice(5, 7)) - 1] : "";
    const dueDay   = entry ? Number(entry.dueDate.slice(8, 10)) : 0;

    const tone: "ok" | "warn" | "urgent" =
        days === null ? "ok" :
        days <= 2     ? "urgent" :
        days <= 7     ? "warn" :
        "ok";

    return (
        <LiveCard
            href="/herramientas/calendario-seniat"
            eyebrow="SENIAT · Próximo"
            cta="Personalizar por RIF"
        >
            {entry ? (
                <>
                    <div>
                        <p className="font-mono text-[44px] md:text-[48px] tabular-nums font-black text-foreground leading-none tracking-[-0.02em]">
                            {dueDay}
                            <span className="text-text-tertiary"> </span>
                            <span className="text-[20px] md:text-[22px] font-mono font-bold text-text-secondary">
                                {dueMonth.slice(0, 3)}
                            </span>
                        </p>
                        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-tertiary font-semibold mt-2">
                            {countdownLabel}
                        </p>
                    </div>
                    <div className="mt-4 pt-4 border-t border-border-light">
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary font-semibold mb-1">
                            Obligación
                        </p>
                        <p className="font-mono text-[13px] text-foreground truncate">
                            {entry.title}
                        </p>
                    </div>
                    <FreshnessPill label="Contribuyente ordinario · ejemplo" tone={tone} />
                </>
            ) : (
                <CardSkeleton lines={2} />
            )}
        </LiveCard>
    );
}

// ----------------------------------------------------------------------------
// Status card — fetches the public status summary and renders a mini-bar of
// the first four services so visitors see the product actively monitoring the
// Venezuelan tax portals.
// ----------------------------------------------------------------------------

interface StatusSummary {
    operational: number;
    degraded:    number;
    down:        number;
    unknown:     number;
    total:       number;
}
interface StatusService {
    slug:       string;
    name:       string;
    lastStatus: "operational" | "degraded" | "down" | "unknown" | null;
}

function LiveStatusCard() {
    const [data, setData] = useState<{ summary: StatusSummary; services: StatusService[] } | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/status/services")
            .then(r => (r.ok ? r.json() : null))
            .then(r => {
                if (cancelled || !r?.data) return;
                setData({
                    summary:  r.data.summary,
                    services: r.data.services.slice(0, 4),
                });
            })
            .catch(() => null);
        return () => { cancelled = true; };
    }, []);

    const tone: "ok" | "warn" | "urgent" =
        !data           ? "ok"     :
        data.summary.down > 0      ? "urgent" :
        data.summary.degraded > 0  ? "warn"   :
        "ok";

    return (
        <LiveCard
            href="/herramientas/status"
            eyebrow="Portales · Venezuela"
            cta="Ver estatus"
        >
            {data ? (
                <>
                    <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[44px] md:text-[48px] tabular-nums font-black text-foreground leading-none tracking-[-0.02em]">
                            {data.summary.operational}/{data.summary.total}
                        </span>
                        <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-text-tertiary font-semibold">
                            operativos
                        </span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-border-light space-y-1.5">
                        {data.services.map(svc => (
                            <div key={svc.slug} className="flex items-center justify-between">
                                <span className="font-mono text-[11px] text-text-secondary truncate pr-2">
                                    {svc.name}
                                </span>
                                <StatusDot status={svc.lastStatus} />
                            </div>
                        ))}
                    </div>
                    <FreshnessPill label="Monitoreo continuo" tone={tone} />
                </>
            ) : (
                <CardSkeleton lines={4} />
            )}
        </LiveCard>
    );
}

// ----------------------------------------------------------------------------
// Shared card scaffold. Keeps each card's anatomy identical: eyebrow strip
// (with live dot), main slot, and a CTA footer that upgrades on hover.
// ----------------------------------------------------------------------------

function LiveCard({
    href,
    eyebrow,
    cta,
    children,
}: {
    href:     string;
    eyebrow:  string;
    cta:      string;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            className="group relative flex flex-col rounded-2xl border border-border-light bg-surface-1 p-6 hover:border-primary-500/40 hover:bg-surface-1 hover:shadow-lg hover:shadow-foreground/5 transition-all"
        >
            {/* Eyebrow */}
            <div className="flex items-center gap-2 mb-5">
                <span className="relative flex w-1.5 h-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-primary-500/50 animate-ping" />
                    <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-primary-500" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-text-secondary">
                    {eyebrow}
                </span>
            </div>

            {/* Content slot */}
            <div className="flex-1 flex flex-col">{children}</div>

            {/* CTA row */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border-light">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] font-bold text-foreground group-hover:text-primary-500 transition-colors">
                    {cta}
                </span>
                <ArrowUpRight
                    className="w-4 h-4 text-text-tertiary group-hover:text-primary-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                    strokeWidth={2}
                />
            </div>
        </Link>
    );
}

function FreshnessPill({ label, tone }: { label: string; tone: "ok" | "warn" | "urgent" }) {
    const tones = {
        ok:     "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
        warn:   "text-amber-700  dark:text-amber-400  bg-amber-500/10  border-amber-500/25",
        urgent: "text-red-600    dark:text-red-400    bg-red-500/10    border-red-500/25",
    }[tone];

    const Icon = tone === "urgent" ? TrendingDown : TrendingUp;

    return (
        <div className={`mt-4 inline-flex items-center gap-1.5 h-6 px-2 rounded-full border self-start ${tones}`}>
            <Icon className="w-3 h-3" strokeWidth={2.2} />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] font-semibold">
                {label}
            </span>
        </div>
    );
}

function StatusDot({ status }: { status: StatusService["lastStatus"] }) {
    const color = {
        operational: "bg-emerald-500",
        degraded:    "bg-amber-500",
        down:        "bg-red-500",
        unknown:     "bg-border-medium",
    }[status ?? "unknown"];
    return <span aria-label={status ?? "desconocido"} className={`w-1.5 h-1.5 rounded-full ${color}`} />;
}

function CardSkeleton({ lines }: { lines: number }) {
    return (
        <div className="animate-pulse flex flex-col">
            <div className="h-11 w-3/4 rounded-md bg-surface-2 mb-4" />
            <div className="pt-4 border-t border-border-light space-y-2">
                {Array.from({ length: lines }).map((_, i) => (
                    <div key={i} className="h-3 w-full rounded bg-surface-2" />
                ))}
            </div>
            <div className="mt-4 h-6 w-24 rounded-full bg-surface-2" />
        </div>
    );
}

// ----------------------------------------------------------------------------
// Strip wrapper — section header + the 3-card grid.
// ----------------------------------------------------------------------------

export function LiveToolsStrip() {
    return (
        <section className="max-w-7xl mx-auto w-full px-6 py-16 md:py-24">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
                <div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary-500 mb-3 inline-block font-semibold">
                        Datos en vivo · Gratis
                    </span>
                    <h2 className="font-sans text-[28px] md:text-[40px] font-black text-foreground leading-[1.05] tracking-[-0.02em] max-w-2xl">
                        Tres fragmentos del producto,<br className="hidden md:block" /> abiertos a todo el país.
                    </h2>
                    <p className="font-sans text-[15px] md:text-[16px] text-text-tertiary leading-relaxed mt-3 max-w-xl">
                        La misma fuente que Kontave usa para tus cálculos diarios. Sin crear cuenta, sin registro, sin correo.
                    </p>
                </div>
                <Link
                    href="/herramientas"
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border-default bg-surface-1 font-mono text-[11px] uppercase tracking-[0.14em] font-bold text-foreground hover:bg-surface-2 hover:border-border-medium transition-colors whitespace-nowrap shrink-0"
                >
                    Ver todas
                    <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2.2} />
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
                <LiveBcvCard />
                <LiveSeniatCard />
                <LiveStatusCard />
            </div>
        </section>
    );
}

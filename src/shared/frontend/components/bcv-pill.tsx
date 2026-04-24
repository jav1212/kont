"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// ----------------------------------------------------------------------------
// BCV rate pill — the product's signature chrome element.
//
// Used anywhere the brand wants to signal "this software is connected to the
// real BCV feed" at a glance: public header, marketing header, auth side card,
// etc. The pill fetches once on mount (client-side) from our own /api/bcv/rate
// route and silently does nothing on failure so it never breaks chrome layout.
//
// Date format: "24 abr" (es-VE short month). Matches the rule from
// konta-design: "BCV rate badge: three lines max — `BCV · 79,59 · 23 abr 2026`"
// — we drop the year in the pill for space, but keep it on deeper surfaces.
// ----------------------------------------------------------------------------

const MONTHS_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

export interface BcvPillData {
    value:   string;  // "79,59" — pre-formatted for es-VE display
    date:    string;  // "24 abr" — short human label
    rate:    number;  // 79.59    — raw number for math (e.g. conversions)
    dateIso: string;  // "2026-04-24"
}

export function useBcvRate(): BcvPillData | null {
    const [rate, setRate] = useState<BcvPillData | null>(null);
    useEffect(() => {
        const today = new Date().toISOString().slice(0, 10);
        let cancelled = false;
        fetch(`/api/bcv/rate?date=${today}`)
            .then(r => (r.ok ? r.json() : null))
            .then((r: { rate?: number; date?: string } | null) => {
                if (cancelled || !r?.rate || !r?.date) return;
                const value = Number(r.rate).toLocaleString("es-VE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                });
                const [, m, d] = r.date.split("-");
                const label = `${Number(d)} ${MONTHS_ES[Number(m) - 1]}`;
                setRate({ value, date: label, rate: r.rate, dateIso: r.date });
            })
            .catch(() => { /* silent — pill stays hidden */ });
        return () => { cancelled = true; };
    }, []);
    return rate;
}

interface BcvPillProps {
    data:      BcvPillData;
    className?: string;
    /**
     * When `variant="ghost"`, the pill sits transparent over the surface,
     * used inside the hero mock card where the BCV pill floats over content.
     */
    variant?:  "solid" | "ghost";
}

export function BcvPill({ data, className = "", variant = "solid" }: BcvPillProps) {
    const surface = variant === "ghost"
        ? "bg-surface-1/95 border-white/60 backdrop-blur-sm"
        : "bg-surface-1 border-border-default hover:border-border-medium";

    return (
        <Link
            href="/herramientas/divisas"
            aria-label={`Tasa BCV ${data.value} bolívares, publicada el ${data.date}`}
            className={`inline-flex items-center gap-2 h-9 px-3 rounded-full border transition-colors shadow-sm ${surface} ${className}`}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500" aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-text-secondary">BCV</span>
            <span className="font-mono text-[12px] tabular-nums font-bold text-foreground">{data.value}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-tertiary">{data.date}</span>
        </Link>
    );
}

// ----------------------------------------------------------------------------
// Small utility shared by both public & marketing headers — a scroll-aware
// boolean used to firm up the header surface as the user scrolls past the
// hero. Threshold of 8 px is the rule Konta uses everywhere (see app-sidebar).
// ----------------------------------------------------------------------------

export function useScrolled(threshold = 8): boolean {
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > threshold);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [threshold]);
    return scrolled;
}

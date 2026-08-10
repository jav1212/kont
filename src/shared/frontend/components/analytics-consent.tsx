"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CONSENT_KEY = "kont-analytics-consent";

declare global {
    interface Window {
        dataLayer: unknown[];
        gtag: (...args: unknown[]) => void;
    }
}

function loadGoogleAnalytics() {
    if (!GA_ID || typeof window === "undefined") return;
    if (document.querySelector(`script[data-kont-ga="${GA_ID}"]`)) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = (...args: unknown[]) => window.dataLayer.push(args);
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { send_page_view: false });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    script.dataset.kontGa = GA_ID;
    document.head.appendChild(script);
}

export function trackEvent(name: string, params?: Record<string, string | number>) {
    if (!GA_ID || typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", name, params ?? {});
}

export function AnalyticsConsent() {
    const pathname = usePathname();
    const [choice, setChoice] = useState<string | null>(null);

    useEffect(() => {
        const stored = window.localStorage.getItem(CONSENT_KEY);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrates consent from browser storage
        setChoice(stored);
        if (stored === "granted") loadGoogleAnalytics();
    }, []);

    useEffect(() => {
        if (choice !== "granted") return;
        loadGoogleAnalytics();
        const pageView = () => trackEvent("page_view", { page_path: pathname ?? "/" });
        pageView();
    }, [choice, pathname]);

    if (!GA_ID || choice) return null;

    function decide(value: "granted" | "denied") {
        window.localStorage.setItem(CONSENT_KEY, value);
        setChoice(value);
    }

    return (
        <aside
            role="dialog"
            aria-label="Preferencias de analítica"
            className="fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-2xl rounded-2xl border border-border-default bg-surface-1 p-5 shadow-2xl"
        >
            <p className="font-sans text-sm leading-relaxed text-text-secondary">
                Usamos analítica opcional para entender qué partes de Kontave funcionan mejor. No activamos Google Analytics sin tu permiso.
                <a href="/legal/privacidad#cookies" className="ml-1 text-primary-500 underline">Más información</a>.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => decide("denied")} className="h-10 rounded-full border border-border-default px-5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-foreground hover:bg-surface-2">
                    Rechazar
                </button>
                <button type="button" onClick={() => decide("granted")} className="h-10 rounded-full bg-primary-500 px-5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-white hover:bg-primary-600">
                    Aceptar analítica
                </button>
            </div>
        </aside>
    );
}

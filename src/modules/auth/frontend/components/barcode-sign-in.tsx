"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ScanBarcode, WifiOff } from "lucide-react";
import { useDeviceManager, useDeviceSubscription } from "@/src/shared/frontend/devices/device-manager-provider";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

/** Renders the exclusive scanner surface used to exchange a badge for a session. */
export function BarcodeSignIn() {
    const { signInWithBarcode } = useAuth();
    const { available, status, lastError } = useDeviceManager();
    const [state, setState] = useState<"loading" | "ready" | "unavailable" | "validating" | "denied" | "offline">("loading");
    const [message, setMessage] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const requestInFlight = useRef(false);

    const terminalReady = state === "ready" || state === "validating" || state === "denied";
    useEffect(() => {
        let cancelled = false;
        void fetch("/api/auth/barcode/session", { cache: "no-store" })
            .then(async (response) => ({ response, body: await response.json() as { data?: { terminal?: { ready?: boolean } } } }))
            .then(({ response, body }) => {
                if (cancelled) return;
                setState(response.ok && body.data?.terminal?.ready ? "ready" : "unavailable");
            })
            .catch(() => { if (!cancelled) setState("offline"); });
        const retryOnReconnect = () => setAttempt((value) => value + 1);
        window.addEventListener("online", retryOnReconnect);
        return () => { cancelled = true; window.removeEventListener("online", retryOnReconnect); };
    }, [attempt]);

    const handleScan = useCallback(async ({ barcode }: { barcode: string }) => {
        if (!terminalReady) return;
        if (requestInFlight.current) return;
        requestInFlight.current = true;
        setState("validating");
        setMessage(null);
        const error = await signInWithBarcode(barcode);
        requestInFlight.current = false;
        if (error) {
            setState(navigator.onLine ? "denied" : "offline");
            setMessage(error);
            return;
        }

        // The route handler writes Supabase cookies. A document navigation makes
        // every client provider bootstrap against that new identity. Clear the
        // previous operator's tenant selection before any destination mounts.
        ["kont-active-tenant-id", "kont-company-id", "kont-session-user-id"].forEach((key) => localStorage.removeItem(key));
        setState("ready");
        window.location.assign("/");
    }, [signInWithBarcode, terminalReady]);

    useDeviceSubscription("access", handleScan, terminalReady);

    const icon = state === "validating"
        ? <span className="h-6 w-6 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
        : state === "denied" || state === "offline"
            ? <WifiOff className="h-6 w-6 text-danger" aria-hidden />
            : <ScanBarcode className="h-7 w-7 text-primary-500" aria-hidden />;

    return (
        <section aria-live="polite" className="rounded-2xl border border-border-light bg-surface-1 px-6 py-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/10">
                {icon}
            </div>
            <h2 className="font-sans text-lg font-semibold text-foreground">{state === "validating" ? "Validando carnet…" : state === "loading" ? "Verificando terminal…" : state === "unavailable" ? "Terminal no habilitada" : "Escanea tu carnet"}</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-tertiary">
                {message ?? (state === "unavailable" ? "Pide a un administrador que habilite este navegador en Configuración → Acceso." : state === "offline" ? "Necesitas conexión para validar el carnet." : "Acerca el código de barras al lector para ingresar.")}
            </p>
            {terminalReady && <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">{available ? `Lector local: ${status}` : lastError ?? "Lector USB tipo teclado listo"}</p>}
            {(state === "offline" || state === "unavailable") && <BaseButton.Root size="sm" variant="secondary" className="mt-5" onClick={() => setAttempt((value) => value + 1)}>Reintentar</BaseButton.Root>}
            {state === "denied" && (
                <div className="mt-4 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-danger">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Intenta escanear de nuevo
                </div>
            )}
        </section>
    );
}

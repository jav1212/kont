"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ScanBarcode, WifiOff } from "lucide-react";
import { useDeviceManager, useDeviceSubscription } from "@/src/shared/frontend/devices/device-manager-provider";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

type TerminalReason = "not_enrolled" | "revoked" | "access_unavailable";
type BarcodeSignInState = "loading" | "ready" | "unavailable" | "revoked" | "access-unavailable" | "validating" | "denied" | "offline";

/**
 * Renders the exclusive scanner surface used to exchange a badge for a session.
 *
 * @returns The terminal-status and badge-scanning interface.
 */
export function BarcodeSignIn() {
    const { signInWithBarcode } = useAuth();
    const { available, status, lastError } = useDeviceManager();
    const [state, setState] = useState<BarcodeSignInState>("loading");
    const [message, setMessage] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const requestInFlight = useRef(false);

    const terminalReady = state === "ready" || state === "validating" || state === "denied";
    /** Clears a prior scan error before asking the server for fresh terminal state. */
    const retryTerminalCheck = useCallback(() => {
        setMessage(null);
        setState("loading");
        setAttempt((value) => value + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;
        void fetch("/api/auth/barcode/session", { cache: "no-store" })
            .then(async (response) => ({ response, body: response.ok ? await response.json() as { data?: { terminal?: { ready?: boolean; reason?: TerminalReason } } } : null }))
            .then(({ response, body }) => {
                if (cancelled) return;
                if (!response.ok || typeof body?.data?.terminal?.ready !== "boolean") { setState("access-unavailable"); return; }
                if (body.data.terminal.ready) { setState("ready"); return; }
                setState(body.data.terminal.reason === "revoked" ? "revoked" : body.data.terminal.reason === "access_unavailable" ? "access-unavailable" : "unavailable");
            })
            .catch(() => { if (!cancelled) setState(navigator.onLine ? "access-unavailable" : "offline"); });
        const retryOnReconnect = retryTerminalCheck;
        window.addEventListener("online", retryOnReconnect);
        return () => { cancelled = true; window.removeEventListener("online", retryOnReconnect); };
    }, [attempt, retryTerminalCheck]);

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

    const heading = state === "validating" ? "Validando carnet…"
        : state === "loading" ? "Verificando terminal…"
            : state === "unavailable" ? "Terminal no habilitada"
                : state === "revoked" ? "Terminal revocada"
                    : state === "access-unavailable" ? "Acceso temporalmente no disponible"
                        : "Escanea tu carnet";
    const defaultMessage = state === "unavailable"
        ? "Pide a un administrador que habilite este navegador en Configuración → Acceso."
        : state === "revoked"
            ? "Pide a un administrador que habilite de nuevo este navegador."
            : state === "access-unavailable"
                ? "No pudimos verificar el acceso de esta terminal. Intenta de nuevo en unos instantes."
                : state === "offline"
                    ? "Necesitas conexión para validar el carnet."
                    : "Acerca el código de barras al lector para ingresar.";
    const icon = state === "validating"
        ? <span className="h-6 w-6 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
        : state === "denied" || state === "offline" || state === "access-unavailable"
            ? <WifiOff className="h-6 w-6 text-danger" aria-hidden />
            : <ScanBarcode className="h-7 w-7 text-primary-500" aria-hidden />;

    return (
        <section aria-live="polite" className="rounded-2xl border border-border-light bg-surface-1 px-6 py-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/10">
                {icon}
            </div>
            <h2 className="font-sans text-lg font-semibold text-foreground">{heading}</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-tertiary">
                {message ?? defaultMessage}
            </p>
            {terminalReady && <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">{available ? `Lector local: ${status}` : lastError ?? "Lector USB tipo teclado listo"}</p>}
            {(state === "offline" || state === "unavailable" || state === "revoked" || state === "access-unavailable") && <BaseButton.Root size="sm" variant="secondary" className="mt-5" onClick={retryTerminalCheck}>Reintentar</BaseButton.Root>}
            {state === "denied" && (
                <div className="mt-4 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-danger">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Intenta escanear de nuevo
                </div>
            )}
        </section>
    );
}

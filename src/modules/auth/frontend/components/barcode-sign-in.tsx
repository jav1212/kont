"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, ScanBarcode, WifiOff } from "lucide-react";
import { useDeviceManager, useDeviceSubscription } from "@/src/shared/frontend/devices/device-manager-provider";
import { isValidBadgeBarcode } from "@/src/shared/frontend/devices/barcode-access-policy";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BARCODE_LOGIN_LANDING_HREF } from "@/src/modules/workspace/frontend/barcode-workspace-landing";

type TerminalReason = "not_enrolled" | "revoked" | "access_unavailable";
type BarcodeSignInState = "loading" | "ready" | "unavailable" | "revoked" | "access-unavailable" | "validating" | "invalid" | "denied" | "offline" | "success";
interface BarcodeSignInProps {
    /** Makes this scanner surface visible and enables feedback for reader input. */
    readonly active: boolean;
    /** Prevents this component from creating a second authentication request. */
    readonly authenticationBlocked: boolean;
    /** Brings the scanner surface forward after a credential is recognized. */
    readonly onCredentialDetected: () => void;
    /** Reports whether this component owns an authentication request. */
    readonly onAuthenticationStateChange: (inProgress: boolean) => void;
}

/**
 * Renders the exclusive scanner surface used to exchange a badge for a session.
 *
 * @param props - Visibility, authentication coordination, and scan-detection callbacks.
 * @returns The terminal-status and badge-scanning interface.
 */
export function BarcodeSignIn({ active, authenticationBlocked, onCredentialDetected, onAuthenticationStateChange }: BarcodeSignInProps) {
    const { signInWithBarcode } = useAuth();
    const { available, status, lastError } = useDeviceManager();
    const [state, setState] = useState<BarcodeSignInState>("loading");
    const [message, setMessage] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const requestInFlight = useRef(false);
    const pendingCredential = useRef<string | null>(null);

    const terminalReady = state === "ready" || state === "validating" || state === "invalid" || state === "denied";
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

    useEffect(() => {
        if (!active || ["unavailable", "revoked", "access-unavailable", "offline", "success"].includes(state)) pendingCredential.current = null;
    }, [active, state]);

    useEffect(() => {
        if (state !== "success") return;
        // Paint the confirmed outcome before starting the document navigation.
        // The old page keeps that feedback visible while the new one loads.
        let navigationFrame: number | undefined;
        const feedbackFrame = requestAnimationFrame(() => {
            navigationFrame = requestAnimationFrame(() => window.location.assign(BARCODE_LOGIN_LANDING_HREF));
        });
        return () => {
            cancelAnimationFrame(feedbackFrame);
            if (navigationFrame !== undefined) cancelAnimationFrame(navigationFrame);
        };
    }, [state]);

    const handleScan = useCallback(async ({ barcode }: { barcode: string }) => {
        if (authenticationBlocked || state === "success" || requestInFlight.current) return;
        const credential = barcode.trim();
        if (!isValidBadgeBarcode(credential)) {
            if (!active || !terminalReady) return;
            setState("invalid");
            setMessage("Este código no corresponde a un carnet de acceso. Escanea tu carnet.");
            return;
        }
        onCredentialDetected();
        if (!terminalReady) {
            if (state === "loading") pendingCredential.current ??= credential;
            return;
        }
        requestInFlight.current = true;
        onAuthenticationStateChange(true);
        setState("validating");
        setMessage(null);
        const error = await signInWithBarcode(credential);
        if (error) {
            requestInFlight.current = false;
            onAuthenticationStateChange(false);
            setState(navigator.onLine ? "denied" : "offline");
            setMessage(error);
            return;
        }

        // The route handler writes Supabase cookies. A document navigation makes
        // every client provider bootstrap against that new identity. Clear the
        // previous operator's tenant selection before any destination mounts.
        try {
            ["kont-active-tenant-id", "kont-company-id", "kont-session-user-id"].forEach((key) => localStorage.removeItem(key));
        } catch { /* Storage restrictions must not prevent opening the confirmed session. */ }
        setState("success");
    }, [active, authenticationBlocked, onAuthenticationStateChange, onCredentialDetected, signInWithBarcode, state, terminalReady]);

    useEffect(() => {
        if (authenticationBlocked) {
            pendingCredential.current = null;
            return;
        }
        if (state !== "ready" || !pendingCredential.current || requestInFlight.current) return;
        const barcode = pendingCredential.current;
        pendingCredential.current = null;
        void handleScan({ barcode });
    }, [authenticationBlocked, handleScan, state]);

    useDeviceSubscription("access", handleScan, state !== "success", { captureAllKeyboardBursts: active });

    const heading = state === "success" ? "Acceso concedido"
        : state === "invalid" ? "Código no válido"
        : state === "denied" ? "Acceso no validado"
        : state === "validating" ? "Validando carnet…"
        : state === "loading" ? "Verificando terminal…"
        : state === "unavailable" ? "Terminal no habilitada"
        : state === "revoked" ? "Terminal revocada"
        : state === "access-unavailable" ? "Acceso temporalmente no disponible"
        : "Escanea tu carnet";
    const defaultMessage = state === "success" ? "Abriendo tu espacio de trabajo…"
        : state === "validating" ? "Estamos comprobando tu acceso. Espera un momento."
        : state === "unavailable" ? "Pide a un administrador que habilite este navegador en Configuración → Acceso."
        : state === "revoked" ? "Pide a un administrador que habilite de nuevo este navegador."
        : state === "access-unavailable" ? "No pudimos verificar el acceso de esta terminal. Intenta de nuevo en unos instantes."
        : state === "offline" ? "Necesitas conexión para validar el carnet."
        : "Acerca el código de barras al lector para ingresar.";
    const icon = state === "success"
        ? <CheckCircle2 className="h-7 w-7 text-success" aria-hidden />
        : state === "validating"
            ? <span className="h-6 w-6 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
            : state === "invalid" || state === "denied"
                ? <CircleAlert className="h-7 w-7 text-danger" aria-hidden />
                : state === "offline" || state === "access-unavailable"
                    ? <WifiOff className="h-6 w-6 text-danger" aria-hidden />
                    : <ScanBarcode className="h-7 w-7 text-primary-500" aria-hidden />;

    return (
        <section aria-live="polite" aria-busy={state === "validating"} className="rounded-2xl border border-border-light bg-surface-1 px-6 py-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/10">
                {icon}
            </div>
            <h2 className="font-sans text-lg font-semibold text-foreground">{heading}</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-tertiary">
                {message ?? defaultMessage}
            </p>
            {terminalReady && <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">{available ? `Lector local: ${status}` : lastError ?? "Lector USB tipo teclado listo"}</p>}
            {(state === "offline" || state === "unavailable" || state === "revoked" || state === "access-unavailable") && <BaseButton.Root size="sm" variant="secondary" className="mt-5" onClick={retryTerminalCheck}>Reintentar</BaseButton.Root>}
            {(state === "denied" || state === "invalid") && (
                <div className="mt-4 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-danger">
                    <ScanBarcode className="h-3.5 w-3.5" aria-hidden /> Intenta escanear de nuevo
                </div>
            )}
        </section>
    );
}

"use client";

// ============================================================================
// useAuth — client-side authentication hook
//
// Usa el browser client de Supabase directamente para:
//   - Leer la sesión actual (sin llamada a /api/auth/me)
//   - Escuchar cambios de sesión en tiempo real (onAuthStateChange)
//
// Las acciones (signIn, signUp, signOut) siguen pasando por los route
// handlers para que las cookies se setteen correctamente en el servidor.
// ============================================================================

import { useEffect, useReducer, useCallback } from "react";
import type { Auth } from "@/src/modules/auth/backend/domain/auth";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import {
    resetWorkspaceSelectionForBarcodeSession,
    resolveBarcodeSessionActor,
    getBarcodeSessionTabId,
} from "@/src/modules/auth/frontend/barcode-workspace-session";

const BARCODE_SESSION_CHANNEL = "kontave-barcode-session";

function clearTenantSelection(): void {
    if (typeof window === "undefined") return;
    try {
        resetWorkspaceSelectionForBarcodeSession(localStorage);
    } catch {
        // Storage may be unavailable in a restricted browser context. The
        // server session remains authoritative when the page is reloaded.
    }
}

// ── State ─────────────────────────────────────────────────────────────────────

type Status = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
    user:   Auth | null;
    status: Status;
    error:  string | null;
}

type AuthAction =
    | { type: "LOADING"                  }
    | { type: "SET_USER";  user: Auth    }
    | { type: "CLEAR_USER"               }
    | { type: "SET_ERROR"; error: string };

function reducer(state: AuthState, action: AuthAction): AuthState {
    switch (action.type) {
        case "LOADING":    return { ...state,          status: "loading",          error: null         };
        case "SET_USER":   return { user: action.user, status: "authenticated",    error: null         };
        case "CLEAR_USER": return { user: null,        status: "unauthenticated",  error: null         };
        case "SET_ERROR":  return { ...state,          status: "unauthenticated",  error: action.error };
    }
}

// ── Module-level singleton ────────────────────────────────────────────────────

let _state:     AuthState       = { user: null, status: "loading", error: null };
const _listeners: Set<() => void> = new Set();

function setState(next: AuthState) {
    _state = next;
    _listeners.forEach((fn) => fn());
}

function dispatch(action: AuthAction) {
    setState(reducer(_state, action));
}

// ── API fetch helper (para las acciones que van al servidor) ──────────────────

async function apiFetch(path: string, body?: object, headers?: HeadersInit) {
    const res  = await fetch(path, {
        method:  body !== undefined ? "POST" : "GET",
        headers: body !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
        body:    body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { ok: res.ok, json };
}

// ── Bootstrap — suscribe al estado de sesión del browser client ───────────────

let _bootstrapped = false;
let _barcodeSessionChannel: BroadcastChannel | null = null;

function bootstrap() {
    if (_bootstrapped) return;
    _bootstrapped = true;

    const supabase = getSupabaseBrowser();

    if (typeof BroadcastChannel !== "undefined") {
        _barcodeSessionChannel = new BroadcastChannel(BARCODE_SESSION_CHANNEL);
        _barcodeSessionChannel.onmessage = (event: MessageEvent<{ type?: string; sourceId?: string | null }>) => {
            if (event.data.type !== "session-changed") return;
            if (event.data.sourceId && event.data.sourceId === getBarcodeSessionTabId()) return;
            // Cookies are shared across tabs, but React and browser storage are
            // not a safe workspace handoff mechanism. Reload each old view so
            // it starts only from the replacement actor's cookie.
            dispatch({ type: "LOADING" });
            clearTenantSelection();
            window.location.replace("/tools?barcode-landing=1");
        };
    }

    // Lee la sesión actual inmediatamente
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
            dispatch({ type: "SET_USER", user: { id: session.user.id, email: session.user.email! } });
        } else {
            clearTenantSelection();
            dispatch({ type: "CLEAR_USER" });
        }
    });

    // Escucha cambios: login, logout, token refresh, callback de email
    supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            dispatch({ type: "SET_USER", user: { id: session.user.id, email: session.user.email! } });
            if (event === "SIGNED_IN") {
                void attachPendingReferralCode();
            }
        } else {
            clearTenantSelection();
            dispatch({ type: "CLEAR_USER" });
        }
    });
}

// Si hay un código de referido guardado en sessionStorage (porque el usuario
// llegó al sign-up vía ?ref=CODE), intentamos vincularlo al tenant al primer
// SIGNED_IN. Silenciamos errores para no romper el login.
async function attachPendingReferralCode() {
    if (typeof window === "undefined") return;
    const code = window.sessionStorage.getItem("kont.ref");
    if (!code) return;

    try {
        const res = await fetch("/api/referrals/attach", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ code }),
        });
        // Limpiamos sólo en respuestas no-transitorias. 5xx dejamos para reintento.
        if (res.status < 500) {
            window.sessionStorage.removeItem("kont.ref");
        }
    } catch {
        // Silenciar: no romper el flujo de login.
    }
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function signIn(email: string, password: string): Promise<string | null> {
    dispatch({ type: "LOADING" });
    const { error } = await getSupabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) {
        const message = error.code === "invalid_credentials" || error.message.toLowerCase() === "invalid login credentials"
            ? "Correo o contraseña incorrectos."
            : error.message;
        dispatch({ type: "SET_ERROR", error: message });
        return message;
    }

    // Verificar que no sea una cuenta de administrador
    try {
        const res  = await fetch("/api/auth/verify-not-admin");
        const json = await res.json();
        if (json.isAdmin) {
            await getSupabaseBrowser().auth.signOut();
            const msg = "Correo o contraseña incorrectos.";
            dispatch({ type: "SET_ERROR", error: msg });
            return msg;
        }
    } catch {
        // Si el chequeo falla no bloqueamos el login — el middleware igual protege
    }

    // onAuthStateChange dispara SET_USER automáticamente
    return null;
}

async function signUp(email: string, password: string, name?: string, phone?: string): Promise<string | null> {
    dispatch({ type: "LOADING" });
    const { ok, json } = await apiFetch("/api/auth/sign-up", { email, password, name, phone });
    if (!ok) { dispatch({ type: "SET_ERROR", error: json.error }); return json.error; }
    dispatch({ type: "CLEAR_USER" }); // pendiente de confirmar email
    return null;
}

async function signOut(): Promise<void> {
    clearTenantSelection();
    await apiFetch("/api/auth/sign-out", {});
    // onAuthStateChange lo limpia automáticamente
}

/**
 * Starts a Web session after the server validates a scanned access badge.
 *
 * @param barcode - Credential received from the scanner; never persisted by this client.
 * @param tenantId - Committed workspace tenant used to constrain an operator replacement.
 * @returns A display-safe failure message, or null when session cookies were issued.
 */
async function signInWithBarcode(barcode: string, tenantId?: string | null): Promise<string | null> {
    try {
        let activeTenantId: string | null = tenantId ?? null;
        try {
            if (!activeTenantId) activeTenantId = typeof window === "undefined"
                ? null
                : localStorage.getItem("kont-active-tenant-id");
        } catch {
            // The server will still authenticate ordinary public sign-in when
            // browser storage is restricted.
        }
        const { ok, json } = await apiFetch(
            "/api/auth/barcode",
            { barcode },
            activeTenantId ? { "X-Tenant-Id": activeTenantId } : undefined,
        );
        if (!ok) {
            return typeof json.error === "string" ? json.error : "No se pudo validar el carnet.";
        }
        const user = resolveBarcodeSessionActor(json);
        if (!user) {
            return "No se pudo iniciar la sesión. Intenta de nuevo.";
        }
        // Do this synchronously before rendering another business screen. A
        // same-organization operator may still have different permissions.
        clearTenantSelection();
        dispatch({ type: "SET_USER", user });
        const registryId = json.data?.session?.id;
        if (typeof registryId === "string" && typeof BroadcastChannel !== "undefined") {
            try {
                const channel = new BroadcastChannel("kontave-barcode-session");
                channel.postMessage({ type: "session-changed", sessionId: registryId, sourceId: getBarcodeSessionTabId() });
                channel.close();
            } catch {
                // Other tabs will reconcile on their next protected request.
            }
        }
        return null;
    } catch {
        return "No se pudo conectar para validar el carnet.";
    }
}

/**
 * Ends the active badge session while preserving the current browser state.
 *
 * @param expectedSessionId - Registry identity displayed by this tab, preventing stale locks.
 * @returns A display-safe failure message, or null when the session was locked.
 */
async function lockBarcodeSession(expectedSessionId?: string): Promise<string | null> {
    try {
        const { ok, json } = await apiFetch("/api/auth/barcode/lock", expectedSessionId ? { sessionId: expectedSessionId } : {});
        if (!ok) return typeof json.error === "string" ? json.error : "No se pudo bloquear la sesión.";
        clearTenantSelection();
        dispatch({ type: "CLEAR_USER" });
        return null;
    } catch {
        return "No se pudo bloquear la sesión.";
    }
}

async function resetPassword(email: string): Promise<string | null> {
    const { ok, json } = await apiFetch("/api/auth/reset-password", { email });
    if (!ok) return json.error;
    return null;
}

async function resendConfirmation(email: string): Promise<string | null> {
    const { ok, json } = await apiFetch("/api/auth/resend-confirmation", { email });
    if (!ok) return json.error;
    return null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth() {
    const [, forceUpdate] = useReducer((n: number) => n + 1, 0);

    useEffect(() => {
        _listeners.add(forceUpdate);
        bootstrap();
        return () => { _listeners.delete(forceUpdate); };
    }, []);

    return {
        user:            _state.user,
        status:          _state.status,
        error:           _state.error,
        isLoading:       _state.status === "loading",
        isAuthenticated: _state.status === "authenticated",
        signIn:          useCallback((email: string, password: string) => signIn(email, password), []),
        signUp:          useCallback((email: string, password: string, name?: string, phone?: string) => signUp(email, password, name, phone), []),
        signOut:         useCallback(() => signOut(), []),
        signInWithBarcode: useCallback((barcode: string, tenantId?: string | null) => signInWithBarcode(barcode, tenantId), []),
        lockBarcodeSession: useCallback((expectedSessionId?: string) => lockBarcodeSession(expectedSessionId), []),
        resetPassword:   useCallback((email: string) => resetPassword(email), []),
        resendConfirmation: useCallback((email: string) => resendConfirmation(email), []),
    };
}

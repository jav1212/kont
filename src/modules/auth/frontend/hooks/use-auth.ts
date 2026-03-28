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

async function apiFetch(path: string, body?: object) {
    const res  = await fetch(path, {
        method:  body !== undefined ? "POST" : "GET",
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body:    body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { ok: res.ok, json };
}

// ── Bootstrap — suscribe al estado de sesión del browser client ───────────────

let _bootstrapped = false;

function bootstrap() {
    if (_bootstrapped) return;
    _bootstrapped = true;

    const supabase = getSupabaseBrowser();

    // Lee la sesión actual inmediatamente
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
            dispatch({ type: "SET_USER", user: { id: session.user.id, email: session.user.email! } });
        } else {
            dispatch({ type: "CLEAR_USER" });
        }
    });

    // Escucha cambios: login, logout, token refresh, callback de email
    supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
            dispatch({ type: "SET_USER", user: { id: session.user.id, email: session.user.email! } });
        } else {
            dispatch({ type: "CLEAR_USER" });
        }
    });
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function signIn(email: string, password: string): Promise<string | null> {
    dispatch({ type: "LOADING" });
    const { error } = await getSupabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) { dispatch({ type: "SET_ERROR", error: error.message }); return error.message; }

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

async function signUp(email: string, password: string, name?: string): Promise<string | null> {
    dispatch({ type: "LOADING" });
    const { ok, json } = await apiFetch("/api/auth/sign-up", { email, password, name });
    if (!ok) { dispatch({ type: "SET_ERROR", error: json.error }); return json.error; }
    dispatch({ type: "CLEAR_USER" }); // pendiente de confirmar email
    return null;
}

async function signOut(): Promise<void> {
    await apiFetch("/api/auth/sign-out", {});
    // onAuthStateChange lo limpia automáticamente
}

async function resetPassword(email: string): Promise<string | null> {
    const { ok, json } = await apiFetch("/api/auth/reset-password", { email });
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
        signUp:          useCallback((email: string, password: string, name?: string) => signUp(email, password, name), []),
        signOut:         useCallback(() => signOut(), []),
        resetPassword:   useCallback((email: string) => resetPassword(email), []),
    };
}
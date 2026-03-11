"use client";

// ============================================================================
// useAuth — client-side authentication hook
//
// Module-level singleton: all components share one state instance without
// a Context provider. Register a forceUpdate listener on mount; dispatch
// mutates _state and notifies all listeners.
//
// API response shape (from handleResult):
//   success → { data: Auth | null }
//   failure → { error: string }   + status 400
// ============================================================================

import { useEffect, useReducer, useCallback } from "react";
import type { Auth } from "@/src/backend/auth/domain/auth";

// ── State ─────────────────────────────────────────────────────────────────────

type Status = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
    user:   Auth | null;
    status: Status;
    error:  string | null;
}

type AuthAction =
    | { type: "LOADING"                }
    | { type: "SET_USER";  user: Auth  }
    | { type: "CLEAR_USER"             }
    | { type: "SET_ERROR"; error: string };

function reducer(state: AuthState, action: AuthAction): AuthState {
    switch (action.type) {
        case "LOADING":    return { ...state,         status: "loading",          error: null         };
        case "SET_USER":   return { user: action.user, status: "authenticated",   error: null         };
        case "CLEAR_USER": return { user: null,        status: "unauthenticated", error: null         };
        case "SET_ERROR":  return { ...state,          status: "unauthenticated", error: action.error };
    }
}

// ── Module-level singleton ────────────────────────────────────────────────────

let _state:     AuthState        = { user: null, status: "loading", error: null };
let _listeners: Set<() => void>  = new Set();

function setState(next: AuthState) {
    _state = next;
    _listeners.forEach((fn) => fn());
}

function dispatch(action: AuthAction) {
    setState(reducer(_state, action));
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, body?: object) {
    const res  = await fetch(path, {
        method:  body !== undefined ? "POST" : "GET",
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body:    body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { ok: res.ok, json };
}

// ── Bootstrap — runs once across all hook instances ───────────────────────────

let _bootstrapped = false;

async function bootstrap() {
    if (_bootstrapped) return;
    _bootstrapped = true;

    const { ok, json } = await apiFetch("/api/auth/me");

    if (ok && json.data) {
        dispatch({ type: "SET_USER", user: json.data });
    } else {
        dispatch({ type: "CLEAR_USER" });
    }
}

// ── Actions ───────────────────────────────────────────────────────────────────
// Defined at module level so useCallback refs are always stable.

async function signIn(email: string, password: string): Promise<string | null> {
    dispatch({ type: "LOADING" });
    const { ok, json } = await apiFetch("/api/auth/sign-in", { email, password });
    if (!ok) { dispatch({ type: "SET_ERROR", error: json.error }); return json.error; }
    dispatch({ type: "SET_USER", user: json.data });
    return null;
}

async function signUp(email: string, password: string, name?: string): Promise<string | null> {
    dispatch({ type: "LOADING" });
    const { ok, json } = await apiFetch("/api/auth/sign-up", { email, password, name });
    if (!ok) { dispatch({ type: "SET_ERROR", error: json.error }); return json.error; }
    dispatch({ type: "SET_USER", user: json.data });
    return null;
}

async function signOut(): Promise<void> {
    await apiFetch("/api/auth/sign-out", {});
    dispatch({ type: "CLEAR_USER" });
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
        bootstrap(); // no-op after first call
        return () => { _listeners.delete(forceUpdate); };
    }, []);

    return {
        user:            _state.user,
        status:          _state.status,
        error:           _state.error,
        isLoading:       _state.status === "loading",
        isAuthenticated: _state.status === "authenticated",
        signIn:          useCallback(signIn, []),
        signUp:          useCallback(signUp, []),
        signOut:         useCallback(signOut, []),
        resetPassword:   useCallback(resetPassword, []),
    };
}
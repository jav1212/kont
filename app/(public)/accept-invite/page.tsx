"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";

// ── Inner component (uses useSearchParams) ────────────────────────────────────

function AcceptInviteInner() {
    const searchParams = useSearchParams();
    const router       = useRouter();
    const { user, isLoading: authLoading, isAuthenticated } = useAuth();

    const token       = searchParams.get("token");
    const errorParam  = searchParams.get("error");
    const switchTenant = searchParams.get("switchTenant");

    const [status,   setStatus]   = useState<"idle" | "accepting" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Handle switchTenant param after redirect from accept endpoint
    useEffect(() => {
        if (switchTenant && isAuthenticated) {
            if (typeof window !== "undefined") {
                localStorage.setItem("kont-active-tenant-id", switchTenant);
            }
            router.replace("/");
        }
    }, [switchTenant, isAuthenticated, router]);

    // Handle error from API redirect
    useEffect(() => {
        if (errorParam) {
            const msgs: Record<string, string> = {
                invalid:        "La invitación es inválida o ya fue usada.",
                expired:        "La invitación ha expirado.",
                email_mismatch: "El email de la invitación no coincide con tu cuenta.",
                server:         "Ocurrió un error en el servidor. Intenta de nuevo.",
            };
            setErrorMsg(msgs[errorParam] ?? "Invitación inválida.");
            setStatus("error");
        }
    }, [errorParam]);

    // Auto-accept if authenticated and token present
    useEffect(() => {
        if (authLoading || !token || !isAuthenticated || status !== "idle") return;
        setStatus("accepting");
        router.replace(`/api/memberships/accept?token=${token}`);
    }, [authLoading, token, isAuthenticated, status, router]);

    // Error state
    if (status === "error" || errorMsg) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-surface-2 p-6">
                <div className="w-full max-w-sm space-y-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" className="text-red-500">
                            <circle cx="10" cy="10" r="8" />
                            <path d="M10 6v4M10 14h.01" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="font-mono text-sm font-semibold text-foreground mb-1">Invitación inválida</h1>
                        <p className="font-mono text-xs text-foreground/50">{errorMsg ?? "Esta invitación no es válida."}</p>
                    </div>
                    <Link
                        href="/"
                        className="inline-block w-full py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-mono text-xs text-center transition-colors"
                    >
                        Ir al inicio
                    </Link>
                </div>
            </div>
        );
    }

    // No token
    if (!token && !switchTenant) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-surface-2 p-6">
                <div className="w-full max-w-sm space-y-4 text-center">
                    <h1 className="font-mono text-sm font-semibold text-foreground">Enlace inválido</h1>
                    <p className="font-mono text-xs text-foreground/50">No se encontró un token de invitación en este enlace.</p>
                    <Link href="/" className="inline-block font-mono text-xs text-primary-500 hover:text-primary-400">
                        Ir al inicio
                    </Link>
                </div>
            </div>
        );
    }

    // Not authenticated — prompt to sign up or sign in
    if (!authLoading && !isAuthenticated && token) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-surface-2 p-6">
                <div className="w-full max-w-sm space-y-6 text-center">
                    <div>
                        <h1 className="font-mono text-sm font-semibold text-foreground mb-1">Has sido invitado a kont</h1>
                        <p className="font-mono text-xs text-foreground/50">
                            Crea tu cuenta o inicia sesión para aceptar la invitación.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Link
                            href={`/sign-up?redirect=/accept-invite?token=${token}`}
                            className="block w-full py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-mono text-xs text-center transition-colors"
                        >
                            Crear cuenta en kont
                        </Link>
                        <Link
                            href={`/sign-in?redirect=/accept-invite?token=${token}`}
                            className="block w-full py-2.5 rounded-lg border border-border-light font-mono text-xs text-foreground/70 text-center hover:text-foreground transition-colors"
                        >
                            Ya tengo cuenta — Iniciar sesión
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Loading / accepting
    return (
        <div className="flex min-h-screen items-center justify-center bg-surface-2 p-6">
            <div className="text-center space-y-3">
                <div className="w-8 h-8 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin mx-auto" />
                <p className="font-mono text-xs text-foreground/50">Procesando invitación…</p>
            </div>
        </div>
    );
}

// ── Page export (wrapped in Suspense for useSearchParams) ─────────────────────

export default function AcceptInvitePage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-surface-2">
                <div className="w-8 h-8 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin" />
            </div>
        }>
            <AcceptInviteInner />
        </Suspense>
    );
}

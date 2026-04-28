"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    Loader2,
    MailCheck,
    Send,
    ChevronLeft,
    AlertCircle,
    Clock,
    RotateCcw,
    RefreshCw,
} from "lucide-react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { notify } from "@/src/shared/frontend/notify";
import { AuthShell, AuthHeader, AuthVisual } from "../_components/auth-shell";

const COOLDOWN_SECONDS = 30;

function subscribeToHash(cb: () => void): () => void {
    window.addEventListener("hashchange", cb);
    return () => window.removeEventListener("hashchange", cb);
}
function getHashSnapshot(): string { return window.location.hash; }
function getHashServerSnapshot(): string { return ""; }

export default function ResendConfirmationPage() {
    return (
        <Suspense fallback={null}>
            <ResendConfirmationInner />
        </Suspense>
    );
}

function ResendConfirmationInner() {
    const { resendConfirmation } = useAuth();
    const searchParams = useSearchParams();

    const [email,         setEmail]         = useState(searchParams.get("email") ?? "");
    const [loading,       setLoading]       = useState(false);
    const [sent,          setSent]          = useState(false);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [now,           setNow]           = useState(() => Date.now());

    // Supabase agrega errores al hash fragment (#error_code=otp_expired).
    const hash = useSyncExternalStore(subscribeToHash, getHashSnapshot, getHashServerSnapshot);
    const hashDetected = (() => {
        const raw = hash?.replace(/^#/, "") ?? "";
        if (!raw) return false;
        const p = new URLSearchParams(raw);
        return Boolean(p.get("error_code") ?? p.get("error"));
    })();

    useEffect(() => {
        if (cooldownUntil <= now) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [cooldownUntil, now]);

    const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
    const reason = searchParams.get("reason");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!email.trim()) { notify.error("El correo es requerido."); return; }
        if (!/\S+@\S+\.\S+/.test(email.trim())) { notify.error("El correo no es válido."); return; }
        if (cooldownRemaining > 0) return;

        setLoading(true);
        const err = await resendConfirmation(email.trim());
        setLoading(false);

        if (err) { notify.error(err); return; }

        setSent(true);
        setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000);
        setNow(Date.now());
    }

    const showExpiredBadge = hashDetected || reason === "expired";

    const visual = (
        <AuthVisual
            heading={<>Un enlace fresco,<br /><span className="text-white/70">directo a tu bandeja.</span></>}
            copy="Los enlaces de confirmación de Supabase duran unas horas. Reenvía uno nuevo en segundos."
        />
    );

    return (
        <AuthShell visual={visual}>
            <AuthHeader
                icon={<MailCheck className="w-5 h-5 text-white" />}
                title="Reenviar confirmación"
                subtitle="Te enviaremos un nuevo enlace para confirmar tu correo."
            />

            {showExpiredBadge && !sent && (
                <div className="flex items-start gap-3 px-4 py-3 mb-4 rounded-xl bg-amber-500/[0.08] border border-amber-500/30">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                        <p className="font-mono text-[11px] uppercase tracking-[0.12em] font-bold text-foreground leading-tight">
                            El enlace anterior expiró
                        </p>
                        <p className="font-sans text-[11.5px] text-text-tertiary leading-relaxed mt-1">
                            Pide uno nuevo abajo para completar la confirmación.
                        </p>
                    </div>
                </div>
            )}

            {sent ? (
                <div className="space-y-6">
                    <div className="p-6 border border-emerald-500/30 rounded-2xl bg-emerald-500/[0.08] space-y-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
                            <Send className="w-6 h-6" />
                        </div>
                        <h3 className="font-sans font-bold text-emerald-700 dark:text-emerald-400 text-[17px]">
                            Nuevo correo en camino
                        </h3>
                        <p className="font-sans text-[13px] text-text-tertiary leading-relaxed">
                            Enviamos un enlace fresco a <span className="text-foreground font-semibold">{email}</span>. Revisa tu bandeja y la carpeta de spam.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <BaseButton.Root
                            type="submit"
                            disabled={loading || cooldownRemaining > 0}
                            variant="secondary"
                            className="w-full h-11 rounded-xl"
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                                : cooldownRemaining > 0
                                    ? <><RefreshCw className="w-3.5 h-3.5" /> Reintentar en {cooldownRemaining}s</>
                                    : <><RotateCcw className="w-3.5 h-3.5" /> Enviar otra vez</>}
                        </BaseButton.Root>
                    </form>

                    <Link
                        href="/sign-in"
                        className="flex items-center justify-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] font-semibold text-primary-500 hover:text-primary-600 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Volver al login
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        <BaseInput.Field
                            label="Correo"
                            type="email"
                            autoComplete="email"
                            placeholder="usuario@empresa.com"
                            value={email}
                            onValueChange={setEmail}
                            isDisabled={loading}
                        />

                        <BaseButton.Root
                            type="submit"
                            disabled={loading || cooldownRemaining > 0}
                            variant="primary"
                            className="w-full h-11 mt-1 rounded-xl shadow-sm"
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                                : cooldownRemaining > 0
                                    ? `Reintentar en ${cooldownRemaining}s`
                                    : "Enviar nuevo enlace"}
                        </BaseButton.Root>
                    </form>

                    <div className="p-3.5 border border-border-light rounded-xl bg-surface-1 shadow-sm mt-2">
                        <p className="font-sans text-[12px] text-text-tertiary flex items-start gap-2.5 leading-relaxed">
                            <AlertCircle className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                            <span>Solo funciona si aún no has confirmado tu correo. Si ya lo confirmaste, usa <Link href="/sign-in" className="text-primary-500 font-semibold hover:underline">iniciar sesión</Link>.</span>
                        </p>
                    </div>

                    <div className="pt-3 flex justify-center">
                        <Link href="/sign-in" className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] font-semibold text-text-tertiary hover:text-foreground transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                            Volver al login
                        </Link>
                    </div>
                </div>
            )}
        </AuthShell>
    );
}

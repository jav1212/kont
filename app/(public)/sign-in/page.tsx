"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { AuthShell, AuthHeader, PasswordField } from "../_components/auth-shell";

const RESEND_COOLDOWN_SECONDS = 30;

function isUnconfirmedEmailError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return lower.includes("email not confirmed")
        || lower.includes("not confirmed")
        || lower.includes("confirm your email")
        || lower.includes("correo no confirmado");
}

function SignInFormContent() {
    const { signIn, resendConfirmation } = useAuth();
    const router       = useRouter();
    const searchParams = useSearchParams();

    const rawErrorParam = searchParams.get("error");
    const rawReason     = searchParams.get("reason");

    const [email,    setEmail]    = useState(searchParams.get("email") ?? "");
    const [pass,     setPass]     = useState("");
    const [error,    setError]    = useState<string | null>(rawErrorParam);
    const [loading,  setLoading]  = useState(false);

    const [needsConfirmation, setNeedsConfirmation] = useState(rawReason === "expired");
    const [resendLoading,     setResendLoading]     = useState(false);
    const [resendSent,        setResendSent]        = useState(false);
    const [cooldownUntil,     setCooldownUntil]     = useState(0);
    const [now,               setNow]               = useState(() => Date.now());

    useEffect(() => {
        if (cooldownUntil <= now) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [cooldownUntil, now]);

    const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

    async function handleResend() {
        if (!email.trim()) {
            setError("Escribe tu correo para reenviar el enlace.");
            return;
        }
        if (cooldownRemaining > 0 || resendLoading) return;

        setResendLoading(true);
        const err = await resendConfirmation(email.trim());
        setResendLoading(false);

        if (err) {
            setError(err);
            setResendSent(false);
            return;
        }
        setError(null);
        setResendSent(true);
        setCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
        setNow(Date.now());
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setResendSent(false);

        if (!email.trim()) { setError("El correo es requerido."); return; }
        if (!pass)         { setError("La contraseña es requerida."); return; }

        setLoading(true);
        const err = await signIn(email, pass);
        setLoading(false);

        if (err) {
            setError(err);
            if (isUnconfirmedEmailError(err)) setNeedsConfirmation(true);
            return;
        }

        const redirectTo = searchParams.get("redirectTo") ?? "/documents";
        router.replace(redirectTo);
    }

    return (
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

            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-mono text-[12px] uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                        Contraseña
                    </label>
                    <Link
                        href="/forgot-password"
                        className="font-mono text-[11px] uppercase tracking-[0.1em] font-semibold text-primary-500 hover:text-primary-600 hover:underline transition-colors"
                    >
                        ¿Olvidaste?
                    </Link>
                </div>
                <PasswordField
                    placeholder="••••••••"
                    value={pass}
                    onValueChange={setPass}
                    isDisabled={loading}
                    autoComplete="current-password"
                />
            </div>

            {error && (
                <div role="alert" aria-live="polite" className="px-4 py-3 border border-red-500/30 rounded-xl bg-red-500/[0.07]">
                    <p className="font-sans text-[13px] text-red-600 dark:text-red-400 leading-relaxed">
                        {error}
                    </p>
                </div>
            )}

            {needsConfirmation && (
                <div className="px-4 py-4 border border-amber-500/30 rounded-xl bg-amber-500/[0.06] space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                            <MailCheck className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-mono text-[11px] uppercase tracking-[0.12em] font-bold text-foreground leading-tight mb-1">
                                Correo sin confirmar
                            </p>
                            <p className="font-sans text-[12.5px] text-text-tertiary leading-relaxed">
                                {resendSent
                                    ? <>Enviamos un nuevo enlace a <span className="text-foreground font-semibold">{email}</span>. Revisa tu bandeja y carpeta de spam.</>
                                    : <>Te podemos enviar un nuevo enlace de confirmación {email && <>a <span className="text-foreground font-semibold">{email}</span></>}.</>}
                            </p>
                        </div>
                    </div>
                    <BaseButton.Root
                        type="button"
                        onClick={handleResend}
                        disabled={resendLoading || cooldownRemaining > 0}
                        variant="secondary"
                        className="w-full h-10 rounded-lg"
                    >
                        {resendLoading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                            : cooldownRemaining > 0
                                ? `Reintentar en ${cooldownRemaining}s`
                                : resendSent
                                    ? "Reenviar otra vez"
                                    : "Reenviar confirmación"}
                    </BaseButton.Root>
                </div>
            )}

            <BaseButton.Root
                type="submit"
                disabled={loading}
                variant="primary"
                className="w-full h-11 mt-1 rounded-xl shadow-sm"
            >
                {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando…</>
                    : "Ingresar"}
            </BaseButton.Root>
        </form>
    );
}

export default function SignInPage() {
    return (
        <AuthShell>
            <AuthHeader
                title="Bienvenido de vuelta"
                subtitle="Ingresa tus credenciales para acceder al sistema contable."
            />

            <Suspense fallback={
                <div className="h-40 flex items-center justify-center gap-2 text-[13px] text-text-tertiary">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Conectando…
                </div>
            }>
                <SignInFormContent />
            </Suspense>

            <div className="flex items-center gap-3 my-7">
                <div className="flex-1 h-px bg-border-light" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-disabled font-semibold">o</span>
                <div className="flex-1 h-px bg-border-light" />
            </div>

            <p className="font-sans text-[13.5px] text-center text-text-tertiary">
                ¿Aún no tienes cuenta?{" "}
                <Link href="/sign-up" className="font-mono text-[12px] uppercase tracking-[0.1em] font-semibold text-primary-500 hover:text-primary-600 hover:underline transition-colors">
                    Crear cuenta gratis
                </Link>
            </p>
        </AuthShell>
    );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    Loader2,
    Rocket,
    Building2,
    TrendingUp,
    Check,
    Sparkles,
    Users,
    Gift
} from "lucide-react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { LogoMark } from "@/src/shared/frontend/components/logo";

const RESEND_UNLOCK_SECONDS = 15;
const RESEND_COOLDOWN_SECONDS = 60;

function validate(name: string, email: string, pass: string, confirm: string, terms: boolean): string | null {
    if (!name.trim())                         return "El nombre es requerido.";
    if (!email.trim())                        return "El correo es requerido.";
    if (!/\S+@\S+\.\S+/.test(email))         return "El correo no es válido.";
    if (!/[a-z]/.test(pass))                 return "La contraseña debe contener al menos una letra minúscula.";
    if (!/[A-Z]/.test(pass))                 return "La contraseña debe contener al menos una letra mayúscula.";
    if (!/[0-9]/.test(pass))                 return "La contraseña debe contener al menos un número.";
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,./`~]/.test(pass))
                                              return "La contraseña debe contener al menos un carácter especial.";
    if (pass !== confirm)                     return "Las contraseñas no coinciden.";
    if (!terms)                               return "Debes aceptar los términos para continuar.";
    return null;
}

export default function SignUpPage() {
    // useSearchParams requiere estar dentro de un Suspense boundary para que Next
    // pueda generar la página estática.
    return (
        <Suspense fallback={null}>
            <SignUpPageInner />
        </Suspense>
    );
}

function SignUpPageInner() {
    const { signUp, resendConfirmation } = useAuth();
    const searchParams = useSearchParams();

    const [name,    setName]    = useState("");
    const [email,   setEmail]   = useState("");
    const [pass,    setPass]    = useState("");
    const [confirm, setConfirm] = useState("");
    const [terms,   setTerms]   = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const [successAt,     setSuccessAt]     = useState(0);
    const [now,           setNow]           = useState(() => Date.now());
    const [resendLoading, setResendLoading] = useState(false);
    const [resendSent,    setResendSent]    = useState(false);
    const [resendError,   setResendError]   = useState<string | null>(null);

    useEffect(() => {
        if (!success) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [success]);

    const secondsSinceSuccess = Math.floor((now - successAt) / 1000);
    const cooldownActive = resendSent && secondsSinceSuccess < RESEND_COOLDOWN_SECONDS;
    const unlocking      = !resendSent && secondsSinceSuccess < RESEND_UNLOCK_SECONDS;
    const resendDisabled = resendLoading || cooldownActive || unlocking;
    const cooldownRemaining = cooldownActive
        ? Math.max(0, RESEND_COOLDOWN_SECONDS - secondsSinceSuccess)
        : unlocking
            ? Math.max(0, RESEND_UNLOCK_SECONDS - secondsSinceSuccess)
            : 0;

    async function handleResend() {
        if (resendDisabled) return;
        setResendLoading(true);
        setResendError(null);
        const err = await resendConfirmation(email.trim());
        setResendLoading(false);
        if (err) { setResendError(err); return; }
        setResendSent(true);
        setSuccessAt(Date.now());
        setNow(Date.now());
    }
    // Si viene ?ref=CODE lo guardamos en sessionStorage para vincularlo en el
    // primer login (ver use-auth.ts → attachPendingReferralCode). El código se
    // deriva del search param: no hace falta estado porque no muta después.
    const rawRef  = searchParams.get("ref");
    const refCode = rawRef ? rawRef.trim().toUpperCase() || null : null;

    useEffect(() => {
        if (!refCode) return;
        // Escritura a sessionStorage (sistema externo): uso válido de useEffect.
        window.sessionStorage.setItem("kont.ref", refCode);
    }, [refCode]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        const validationError = validate(name, email, pass, confirm, terms);
        if (validationError) { setError(validationError); return; }

        setLoading(true);
        const err = await signUp(email, pass, name);
        setLoading(false);

        if (err) { setError(err); return; }

        setSuccess(true);
        setSuccessAt(Date.now());
        setNow(Date.now());
    }

    return (
        <div className="flex-1 flex flex-col md:flex-row min-h-0">

            {/* ── Form Side (Left) ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 lg:px-20 overflow-y-auto hidden-scrollbar">
                <div className="w-full max-w-[400px]">

                    {/* Logo icon */}
                    <div className="flex flex-col items-center mb-10">
                        <div className="w-14 h-14 rounded-2xl bg-primary-500 flex items-center justify-center mb-5 shadow-lg shadow-primary-500/30">
                            <LogoMark size={24} className="text-white" />
                        </div>
                        <h1 className="text-[26px] font-bold text-foreground tracking-tight mb-2">
                            Crear cuenta
                        </h1>
                        <p className="text-[13px] text-text-tertiary text-center max-w-[240px] leading-relaxed">
                            Habilita tu acceso completo al sistema de gestión de Kontave.
                        </p>
                    </div>

                    {success ? (
                        <div className="space-y-5">
                            <div className="p-6 border border-emerald-500/30 rounded-2xl bg-emerald-500/10 space-y-3 text-center">
                                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                                    <Check className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-emerald-600 dark:text-emerald-400 text-[17px]">¡Registro Exitoso!</h3>
                                <p className="text-[13px] text-text-tertiary font-medium leading-relaxed">
                                    Confirmación enviada a <span className="text-foreground font-bold">{email}</span>. Por favor revisa tu bandeja.
                                </p>
                            </div>

                            <div className="space-y-2 text-center">
                                <p className="text-[12px] text-text-tertiary font-medium">
                                    ¿No recibiste el correo? Revisa spam o reenvíalo.
                                </p>
                                <BaseButton.Root
                                    type="button"
                                    onClick={handleResend}
                                    disabled={resendDisabled}
                                    variant="secondary"
                                    className="w-full h-10 rounded-lg text-[12px] font-bold flex items-center justify-center gap-2"
                                >
                                    {resendLoading
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Reenviando…</>
                                        : cooldownActive
                                            ? `Reintentar en ${cooldownRemaining}s`
                                            : unlocking
                                                ? `Disponible en ${cooldownRemaining}s`
                                                : resendSent
                                                    ? "Reenviar otra vez"
                                                    : "Reenviar correo"}
                                </BaseButton.Root>
                                {resendSent && !cooldownActive && (
                                    <p className="text-[11px] text-emerald-500 font-medium">Nuevo correo en camino.</p>
                                )}
                                {resendSent && cooldownActive && (
                                    <p className="text-[11px] text-emerald-500 font-medium">Listo, revisa tu bandeja.</p>
                                )}
                                {resendError && (
                                    <p className="text-[11px] text-red-500 font-medium">{resendError}</p>
                                )}
                            </div>

                            <Link href="/sign-in" className="block w-full text-center text-[13px] font-bold text-primary-500 hover:underline transition-colors">
                                Ir al inicio de sesión
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            {refCode && (
                                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary-500/10 border border-primary-500/30">
                                    <div className="w-8 h-8 rounded-full bg-primary-500/20 text-primary-500 flex items-center justify-center flex-shrink-0">
                                        <Gift className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[12px] font-bold text-foreground leading-tight">
                                            Fuiste invitado a KONT
                                        </p>
                                        <p className="text-[11px] text-text-tertiary font-medium">
                                            Código de referido: <span className="text-primary-500 font-bold">{refCode}</span>
                                        </p>
                                    </div>
                                </div>
                            )}

                            <BaseInput.Field label="Nombre" type="text" placeholder="Tu nombre completo" value={name} onValueChange={setName} isDisabled={loading} />

                            <BaseInput.Field label="Correo" type="email" placeholder="usuario@empresa.com" value={email} onValueChange={setEmail} isDisabled={loading} />

                            <div className="grid grid-cols-2 gap-3">
                                <BaseInput.Field label="Clave" type="password" placeholder="••••••••" value={pass} onValueChange={setPass} isDisabled={loading} />
                                <BaseInput.Field label="Repetir" type="password" placeholder="••••••••" value={confirm} onValueChange={setConfirm} isDisabled={loading} />
                            </div>

                            <label className="flex items-start gap-3 cursor-pointer p-3 border border-border-default rounded-xl hover:bg-surface-1 transition-colors">
                                <div className="relative mt-0.5 flex-shrink-0">
                                    <input type="checkbox" className="peer sr-only" checked={terms} onChange={(e) => setTerms(e.target.checked)} disabled={loading} />
                                    <div className="w-5 h-5 rounded-[6px] border-[2px] border-border-medium bg-background peer-checked:bg-primary-500 peer-checked:border-primary-500 transition-colors flex items-center justify-center">
                                        {terms && <Check className="w-3.5 h-3.5 text-white" />}
                                    </div>
                                </div>
                                <span className="text-[12px] text-text-tertiary leading-relaxed font-medium">
                                    Acepto los <Link href="/terms" className="text-primary-500 font-bold hover:underline">términos</Link> y la <Link href="/privacy" className="text-primary-500 font-bold hover:underline">política de privacidad</Link>.
                                </span>
                            </label>

                            {error && (
                                <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/10">
                                    <p className="text-[13px] text-red-500 font-medium">{error}</p>
                                </div>
                            )}

                            <BaseButton.Root type="submit" disabled={loading} variant="primary" className="w-full h-11 mt-1 rounded-xl text-[13px] font-bold shadow-md shadow-primary-500/20 flex items-center justify-center gap-2">
                                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando cuenta…</> : "Empezar Ahora"}
                            </BaseButton.Root>
                        </form>
                    )}

                    <div className="flex items-center gap-3 my-6">
                        <div className="flex-1 h-px bg-border-light" />
                        <span className="text-[10px] uppercase tracking-[0.15em] text-text-disabled font-bold">o</span>
                        <div className="flex-1 h-px bg-border-light" />
                    </div>

                    <p className="text-[13px] text-center text-text-tertiary">
                        ¿Ya tienes cuenta?{" "}
                        <Link href="/sign-in" className="text-primary-500 font-bold hover:underline transition-all">
                            Iniciar sesión
                        </Link>
                    </p>
                </div>
            </div>

            {/* ── Visual Side (Right) ──────────────────────────────────── */}
            <div className="hidden md:flex flex-1 relative p-6 items-center justify-center">
                <div className="w-full h-full rounded-[28px] relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-primary-500 via-primary-600 to-orange-600">
                    
                    {/* Ambient glows */}
                    <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-white/10 blur-[80px] pointer-events-none" />
                    <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-black/20 blur-[80px] pointer-events-none" />

                    {/* Grid pattern */}
                    <div
                        className="absolute inset-0 opacity-[0.07] pointer-events-none"
                        style={{
                            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
                            backgroundSize: "40px 40px",
                        }}
                    />

                    {/* Orbit rings */}
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="relative w-64 h-64 flex items-center justify-center mb-10">
                            <div className="absolute inset-0 rounded-full border border-white/20" />
                            <div className="absolute inset-8 rounded-full border border-white/15" />
                            <div className="absolute inset-16 rounded-full border border-white/15" />

                            <div className="relative z-10 w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-2xl">
                                <LogoMark size={32} className="text-white" />
                            </div>

                            {[
                                { icon: <Rocket className="w-5 h-5 text-white" />, angle: 0   },
                                { icon: <Sparkles className="w-5 h-5 text-white" />, angle: 60  },
                                { icon: <Building2 className="w-5 h-5 text-white" />, angle: 120 },
                                { icon: <TrendingUp className="w-5 h-5 text-white" />, angle: 180 },
                                { icon: <Check className="w-5 h-5 text-white" />, angle: 240 },
                                { icon: <Users className="w-5 h-5 text-white" />, angle: 300 },
                            ].map(({ icon, angle }) => {
                                const rad = (angle * Math.PI) / 180;
                                const r   = 104;
                                const x   = Math.round(Math.cos(rad) * r);
                                const y   = Math.round(Math.sin(rad) * r);
                                return (
                                    <div
                                        key={angle}
                                        className="absolute w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg"
                                        style={{ transform: `translate(${x}px, ${y}px)` }}
                                    >
                                        {icon}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Caption */}
                        <div className="text-center px-8 max-w-sm">
                            <h2 className="text-white text-[26px] font-black leading-tight mb-3">
                                La nueva era de la{" "}
                                <span className="text-white/70">contabilidad.</span>
                            </h2>
                            <p className="text-white/60 text-[13px] leading-relaxed">
                                Hecho en Venezuela — para emprendedores, pymes y estudiantes que buscan el siguiente nivel.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

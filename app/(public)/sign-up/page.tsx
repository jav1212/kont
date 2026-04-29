"use client";

// ============================================================================
// SIGN UP — flujo de 2 etapas con OTP
//
//   Stage 1 · Form  → useAuth().signUp(email, pass, name) (Supabase manda OTP)
//   Stage 2 · Code  → supabase.auth.verifyOtp({ type: 'signup' }) → /documents
//
// El correo del Dashboard puede traer también el link de ConfirmationURL como
// respaldo (callback en /api/auth/callback hace exchangeCodeForSession). Si el
// usuario clickea el link, sigue funcionando; si pega el código, también.
// ============================================================================

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Check, Gift, ChevronLeft, Mail, AlertCircle } from "lucide-react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { notify } from "@/src/shared/frontend/notify";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import { AuthShell, AuthHeader, AuthVisual, PasswordField } from "../_components/auth-shell";

const RESEND_UNLOCK_SECONDS   = 15;
const RESEND_COOLDOWN_SECONDS = 60;

// Espejo del setting "Mailer OTP Length" en Supabase (Auth → Providers → Email).
// Si lo cambias en el dashboard, ajusta esta constante.
const OTP_LENGTH = 8;

type Stage = "form" | "code";

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

type PwRule = { id: string; label: string; test: (p: string) => boolean };
const PW_RULES: PwRule[] = [
    { id: "len",     label: "8+ caracteres",        test: p => p.length >= 8 },
    { id: "lower",   label: "Minúscula",            test: p => /[a-z]/.test(p) },
    { id: "upper",   label: "Mayúscula",            test: p => /[A-Z]/.test(p) },
    { id: "num",     label: "Número",               test: p => /[0-9]/.test(p) },
    { id: "special", label: "Carácter especial",    test: p => /[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,./`~]/.test(p) },
];

export default function SignUpPage() {
    return (
        <Suspense fallback={null}>
            <SignUpPageInner />
        </Suspense>
    );
}

function SignUpPageInner() {
    const router = useRouter();
    const { signUp, resendConfirmation } = useAuth();
    const searchParams = useSearchParams();

    const [stage,   setStage]   = useState<Stage>("form");
    const [name,    setName]    = useState("");
    const [email,   setEmail]   = useState("");
    const [pass,    setPass]    = useState("");
    const [confirm, setConfirm] = useState("");
    const [terms,   setTerms]   = useState(false);
    const [loading, setLoading] = useState(false);

    const [code,         setCode]         = useState("");
    const [verifying,    setVerifying]    = useState(false);

    // Resend cooldown — se preserva del flujo anterior
    const [successAt,     setSuccessAt]     = useState(0);
    const [now,           setNow]           = useState(() => Date.now());
    const [resendLoading, setResendLoading] = useState(false);
    const [resendSent,    setResendSent]    = useState(false);

    useEffect(() => {
        if (stage !== "code") return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [stage]);

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
        const err = await resendConfirmation(email.trim());
        setResendLoading(false);
        if (err) { notify.error(err); return; }
        setResendSent(true);
        setSuccessAt(Date.now());
        setNow(Date.now());
        notify.success("Código reenviado.");
    }

    // Si viene ?ref=CODE lo guardamos en sessionStorage para vincularlo en el
    // primer login (ver use-auth.ts → attachPendingReferralCode).
    const rawRef  = searchParams.get("ref");
    const refCode = rawRef ? rawRef.trim().toUpperCase() || null : null;

    useEffect(() => {
        if (!refCode) return;
        window.sessionStorage.setItem("kont.ref", refCode);
    }, [refCode]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const validationError = validate(name, email, pass, confirm, terms);
        if (validationError) { notify.error(validationError); return; }

        setLoading(true);
        const err = await signUp(email, pass, name);
        setLoading(false);

        if (err) { notify.error(err); return; }

        setCode("");
        setStage("code");
        setSuccessAt(Date.now());
        setNow(Date.now());
    }

    async function handleVerifyCode(e: React.FormEvent) {
        e.preventDefault();
        const token = code.replace(/\D/g, "");
        if (token.length !== OTP_LENGTH) { notify.error(`El código debe tener ${OTP_LENGTH} dígitos.`); return; }

        setVerifying(true);
        const supabase = getSupabaseBrowser();
        const { error } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token,
            type:  "signup",
        });

        if (error) {
            setVerifying(false);
            notify.error("Código inválido o vencido. Reenvía uno nuevo.");
            return;
        }

        // Sesión activa: useAuth().onAuthStateChange recoge la sesión y
        // attachPendingReferralCode toma el ref en el primer login.
        router.replace("/documents");
    }

    const visual = (
        <AuthVisual
            heading={<>Comienza con las empresas<br /><span className="text-white/70">que ya administras.</span></>}
            copy="Tu cuenta incluye nómina quincenal, kardex de inventario y documentos — todo alineado con SENIAT, BCV y LOTTT."
        />
    );

    return (
        <AuthShell visual={visual}>
            {stage === "form" && (
                <>
                    <AuthHeader
                        title="Crea tu cuenta"
                        subtitle="Habilita tu acceso completo al sistema contable de Kontave."
                    />

                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        {refCode && (
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary-500/[0.08] border border-primary-500/30">
                                <div className="w-8 h-8 rounded-full bg-primary-500/20 text-primary-500 flex items-center justify-center flex-shrink-0">
                                    <Gift className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] font-bold text-foreground leading-tight">
                                        Fuiste invitado a Kontave
                                    </p>
                                    <p className="font-sans text-[11.5px] text-text-tertiary">
                                        Código de referido: <span className="font-mono text-primary-500 font-semibold tracking-[0.05em]">{refCode}</span>
                                    </p>
                                </div>
                            </div>
                        )}

                        <BaseInput.Field label="Nombre" type="text" placeholder="Tu nombre completo" value={name} onValueChange={setName} isDisabled={loading} />

                        <BaseInput.Field label="Correo" type="email" placeholder="usuario@empresa.com" value={email} onValueChange={setEmail} isDisabled={loading} />

                        <div className="grid grid-cols-2 gap-3">
                            <PasswordField label="Clave" placeholder="••••••••" value={pass} onValueChange={setPass} isDisabled={loading} autoComplete="new-password" />
                            <PasswordField label="Repetir" placeholder="••••••••" value={confirm} onValueChange={setConfirm} isDisabled={loading} autoComplete="new-password" />
                        </div>

                        {pass.length > 0 && (
                            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-1 pt-1">
                                {PW_RULES.map(rule => {
                                    const ok = rule.test(pass);
                                    return (
                                        <li
                                            key={rule.id}
                                            className={`flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-text-disabled"}`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-border-default"}`} />
                                            {rule.label}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        <label className="flex items-start gap-3 cursor-pointer p-3 border border-border-default rounded-xl hover:bg-surface-2 transition-colors">
                            <div className="relative mt-0.5 flex-shrink-0">
                                <input type="checkbox" className="peer sr-only" checked={terms} onChange={(e) => setTerms(e.target.checked)} disabled={loading} />
                                <div className="w-5 h-5 rounded-[6px] border-[1.5px] border-border-medium bg-surface-1 peer-checked:bg-primary-500 peer-checked:border-primary-500 transition-colors flex items-center justify-center">
                                    {terms && <Check className="w-3.5 h-3.5 text-white" />}
                                </div>
                            </div>
                            <span className="font-sans text-[12.5px] text-text-tertiary leading-relaxed">
                                Acepto los <Link href="/legal/terminos" className="text-primary-500 font-semibold hover:underline">términos</Link> y la <Link href="/legal/privacidad" className="text-primary-500 font-semibold hover:underline">política de privacidad</Link>.
                            </span>
                        </label>

                        <BaseButton.Root
                            type="submit"
                            disabled={loading}
                            variant="primary"
                            className="w-full h-11 mt-1 rounded-xl shadow-sm"
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando cuenta…</>
                                : "Crear cuenta"}
                        </BaseButton.Root>
                    </form>

                    <div className="flex items-center gap-3 my-7">
                        <div className="flex-1 h-px bg-border-light" />
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-disabled font-semibold">o</span>
                        <div className="flex-1 h-px bg-border-light" />
                    </div>

                    <p className="font-sans text-[13.5px] text-center text-text-tertiary">
                        ¿Ya tienes cuenta?{" "}
                        <Link href="/sign-in" className="font-mono text-[12px] uppercase tracking-[0.1em] font-semibold text-primary-500 hover:text-primary-600 hover:underline transition-colors">
                            Iniciar sesión
                        </Link>
                    </p>
                </>
            )}

            {stage === "code" && (
                <>
                    <AuthHeader
                        icon={<Mail className="w-5 h-5 text-white" />}
                        title="Verifica tu correo"
                        subtitle={`Pega el código de ${OTP_LENGTH} dígitos que enviamos a tu bandeja de entrada.`}
                    />

                    <div className="space-y-4">
                        {/* Email pill */}
                        <div className="flex items-center justify-between px-3 py-2.5 border border-border-light rounded-xl bg-surface-1">
                            <div className="flex items-center gap-2 min-w-0">
                                <Mail className="w-4 h-4 text-text-tertiary shrink-0" />
                                <span className="font-mono text-[12px] tabular-nums text-foreground truncate">
                                    {email}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setStage("form"); setCode(""); }}
                                className="font-mono text-[10px] uppercase tracking-[0.14em] font-semibold text-primary-500 hover:text-primary-600 transition-colors shrink-0 ml-2"
                                disabled={verifying}
                            >
                                Cambiar
                            </button>
                        </div>

                        <form onSubmit={handleVerifyCode} className="space-y-4" noValidate>
                            <BaseInput.Field
                                label={`Código de ${OTP_LENGTH} dígitos`}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder={"0".repeat(OTP_LENGTH)}
                                maxLength={OTP_LENGTH}
                                value={code}
                                onValueChange={(v) => setCode(v.replace(/\D/g, "").slice(0, OTP_LENGTH))}
                                isDisabled={verifying}
                                inputClassName="text-center text-[22px] font-bold tracking-[0.4em] tabular-nums"
                                autoFocus
                            />

                            <BaseButton.Root
                                type="submit"
                                disabled={verifying || code.length !== OTP_LENGTH}
                                variant="primary"
                                className="w-full h-11 mt-1 rounded-xl shadow-sm"
                            >
                                {verifying
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando…</>
                                    : "Confirmar cuenta"}
                            </BaseButton.Root>
                        </form>

                        <div className="p-3.5 border border-border-light rounded-xl bg-surface-1 shadow-sm">
                            <p className="font-sans text-[12px] text-text-tertiary flex items-start gap-2.5 leading-relaxed">
                                <AlertCircle className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                                <span>El código expira en 60 minutos. Revisa también tu carpeta de spam.</span>
                            </p>
                        </div>

                        <div className="pt-2 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => { setStage("form"); setCode(""); }}
                                className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] font-semibold text-text-tertiary hover:text-foreground transition-colors"
                                disabled={verifying}
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Atrás
                            </button>

                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={resendDisabled || verifying}
                                className="font-mono text-[11px] uppercase tracking-[0.12em] font-semibold text-primary-500 hover:text-primary-600 transition-colors disabled:opacity-40"
                            >
                                {resendLoading
                                    ? "Reenviando…"
                                    : cooldownActive
                                        ? `Reintentar en ${cooldownRemaining}s`
                                        : unlocking
                                            ? `Disponible en ${cooldownRemaining}s`
                                            : "Reenviar código"}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </AuthShell>
    );
}

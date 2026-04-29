"use client";

// ============================================================================
// FORGOT PASSWORD — single-page 3-stage OTP flow
//
//   Stage 1 · Correo     →  POST /api/auth/forgot-password (Supabase manda código)
//   Stage 2 · Código     →  supabase.auth.verifyOtp({ type: 'recovery' })
//   Stage 3 · Contraseña →  supabase.auth.updateUser({ password })
//
// Eliminamos el flujo de magic-link porque los escáneres de correo (Outlook
// Safe Links, Gmail Safe Browsing, antivirus, link previewers) consumen el
// OTP de un solo uso antes de que llegue el usuario, generando el clásico
// `otp_expired` con menos de un minuto de vida. El código de 6 dígitos es
// inmune: no hay link que escanear.
//
// La pantalla `/reset-password` queda como redirect-shim: usuarios con
// emails viejos (link) caen aquí y reinician el flujo.
// ============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Loader2,
    ChevronLeft,
    AlertCircle,
    Mail,
    KeyRound,
    LockKeyhole,
    CheckCircle2,
    ArrowRight,
} from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { notify } from "@/src/shared/frontend/notify";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import { AuthShell, AuthHeader, AuthVisual, PasswordField } from "../_components/auth-shell";

type Stage = "email" | "code" | "password" | "success";

type PwRule = { id: string; label: string; test: (p: string) => boolean };
const PW_RULES: PwRule[] = [
    { id: "len",   label: "8+ caracteres", test: p => p.length >= 8 },
    { id: "lower", label: "Minúscula",     test: p => /[a-z]/.test(p) },
    { id: "upper", label: "Mayúscula",     test: p => /[A-Z]/.test(p) },
    { id: "num",   label: "Número",        test: p => /[0-9]/.test(p) },
];

const STAGES_META: Array<{ id: Exclude<Stage, "success">; label: string }> = [
    { id: "email",    label: "Correo" },
    { id: "code",     label: "Código" },
    { id: "password", label: "Clave" },
];

export default function ForgotPasswordPage() {
    const router = useRouter();

    const [stage,    setStage]    = useState<Stage>("email");
    const [email,    setEmail]    = useState("");
    const [code,     setCode]     = useState("");
    const [password, setPassword] = useState("");
    const [confirm,  setConfirm]  = useState("");
    const [loading,  setLoading]  = useState(false);

    // ── Etapa 1 · Enviar correo ────────────────────────────────────────────
    async function handleSendEmail(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim()) { notify.error("El correo es requerido."); return; }

        setLoading(true);
        const res  = await fetch("/api/auth/forgot-password", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email }),
        });
        const json = await res.json().catch(() => ({}));
        setLoading(false);

        if (!res.ok) { notify.error(json.error ?? "Error al enviar el correo."); return; }

        setCode("");
        setStage("code");
    }

    // ── Etapa 2 · Verificar código ─────────────────────────────────────────
    async function handleVerifyCode(e: React.FormEvent) {
        e.preventDefault();
        const token = code.replace(/\D/g, "");
        if (token.length !== 6) { notify.error("El código debe tener 6 dígitos."); return; }

        setLoading(true);
        const supabase = getSupabaseBrowser();
        const { error } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token,
            type:  "recovery",
        });
        setLoading(false);

        if (error) { notify.error("Código inválido o vencido. Solicita uno nuevo."); return; }

        setPassword("");
        setConfirm("");
        setStage("password");
    }

    async function handleResendCode() {
        if (loading) return;
        setLoading(true);
        const res = await fetch("/api/auth/forgot-password", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email }),
        });
        const json = await res.json().catch(() => ({}));
        setLoading(false);
        if (!res.ok) { notify.error(json.error ?? "No pudimos reenviar el código."); return; }
        notify.success("Código reenviado.");
    }

    // ── Etapa 3 · Cambiar contraseña ───────────────────────────────────────
    async function handleUpdatePassword(e: React.FormEvent) {
        e.preventDefault();

        if (!password)            { notify.error("La contraseña es requerida."); return; }
        if (password.length < 8)  { notify.error("Mínimo 8 caracteres."); return; }
        if (password !== confirm) { notify.error("Las contraseñas no coinciden."); return; }

        setLoading(true);
        const supabase = getSupabaseBrowser();
        const { error } = await supabase.auth.updateUser({ password });

        if (error) { setLoading(false); notify.error(error.message); return; }

        await supabase.auth.signOut();
        setLoading(false);
        setStage("success");
        setTimeout(() => router.replace("/sign-in"), 2500);
    }

    // ── Visual side ────────────────────────────────────────────────────────
    const visual = (
        <AuthVisual
            heading={<>Tu acceso,<br /><span className="text-white/70">blindado siempre.</span></>}
            copy="Procesos de autenticación cifrados. Códigos de un solo uso que expiran en 60 minutos."
        />
    );

    // ── Header dinámico por etapa ──────────────────────────────────────────
    const HEADERS: Record<Stage, { icon: React.ReactNode; title: string; subtitle: string }> = {
        email: {
            icon:     <Mail className="w-5 h-5 text-white" />,
            title:    "Recuperar acceso",
            subtitle: "Ingresa tu correo y te enviaremos un código de 6 dígitos.",
        },
        code: {
            icon:     <KeyRound className="w-5 h-5 text-white" />,
            title:    "Verifica tu correo",
            subtitle: "Pega el código que enviamos a tu bandeja de entrada.",
        },
        password: {
            icon:     <LockKeyhole className="w-5 h-5 text-white" />,
            title:    "Nueva contraseña",
            subtitle: "Configura una contraseña nueva para retomar el acceso.",
        },
        success: {
            icon:     <CheckCircle2 className="w-5 h-5 text-white" />,
            title:    "Contraseña actualizada",
            subtitle: "Tu acceso fue restablecido. Te llevamos al inicio…",
        },
    };
    const header = HEADERS[stage];

    return (
        <AuthShell visual={visual}>
            <AuthHeader
                icon={header.icon}
                title={header.title}
                subtitle={header.subtitle}
            />

            {/* ── Step indicator ──────────────────────────────────────── */}
            {stage !== "success" && <StepIndicator current={stage} />}

            {/* ── Stage 1 · Correo ─────────────────────────────────────── */}
            {stage === "email" && (
                <div className="space-y-4">
                    <form onSubmit={handleSendEmail} className="space-y-4" noValidate>
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
                            disabled={loading}
                            variant="primary"
                            className="w-full h-11 mt-1 rounded-xl shadow-sm"
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                                : "Enviar código"}
                        </BaseButton.Root>
                    </form>

                    <div className="p-3.5 border border-border-light rounded-xl bg-surface-1 shadow-sm mt-2">
                        <p className="font-sans text-[12px] text-text-tertiary flex items-start gap-2.5 leading-relaxed">
                            <AlertCircle className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                            <span>El código expira en 60 minutos. Revisa también tu carpeta de spam.</span>
                        </p>
                    </div>

                    <div className="pt-3 flex justify-center">
                        <Link
                            href="/sign-in"
                            className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] font-semibold text-text-tertiary hover:text-foreground transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Regresar
                        </Link>
                    </div>
                </div>
            )}

            {/* ── Stage 2 · Código ─────────────────────────────────────── */}
            {stage === "code" && (
                <div className="space-y-4">
                    {/* Email pill — recordatorio del correo en uso */}
                    <div className="flex items-center justify-between px-3 py-2.5 border border-border-light rounded-xl bg-surface-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <Mail className="w-4 h-4 text-text-tertiary shrink-0" />
                            <span className="font-mono text-[12px] tabular-nums text-foreground truncate">
                                {email}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setStage("email"); setCode(""); }}
                            className="font-mono text-[10px] uppercase tracking-[0.14em] font-semibold text-primary-500 hover:text-primary-600 transition-colors shrink-0 ml-2"
                        >
                            Cambiar
                        </button>
                    </div>

                    <form onSubmit={handleVerifyCode} className="space-y-4" noValidate>
                        <BaseInput.Field
                            label="Código de 6 dígitos"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="000000"
                            maxLength={6}
                            value={code}
                            onValueChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                            isDisabled={loading}
                            inputClassName="text-center text-[22px] font-bold tracking-[0.5em] tabular-nums"
                            autoFocus
                        />

                        <BaseButton.Root
                            type="submit"
                            disabled={loading || code.length !== 6}
                            variant="primary"
                            className="w-full h-11 mt-1 rounded-xl shadow-sm"
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando…</>
                                : "Verificar código"}
                        </BaseButton.Root>
                    </form>

                    <div className="pt-2 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => { setStage("email"); setCode(""); }}
                            className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] font-semibold text-text-tertiary hover:text-foreground transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Atrás
                        </button>

                        <button
                            type="button"
                            onClick={handleResendCode}
                            disabled={loading}
                            className="font-mono text-[11px] uppercase tracking-[0.12em] font-semibold text-primary-500 hover:text-primary-600 transition-colors disabled:opacity-40"
                        >
                            Reenviar código
                        </button>
                    </div>
                </div>
            )}

            {/* ── Stage 3 · Contraseña ─────────────────────────────────── */}
            {stage === "password" && (
                <form onSubmit={handleUpdatePassword} className="space-y-4" noValidate>
                    <PasswordField
                        label="Contraseña nueva"
                        placeholder="Mínimo 8 caracteres"
                        value={password}
                        onValueChange={setPassword}
                        isDisabled={loading}
                        autoComplete="new-password"
                    />

                    <PasswordField
                        label="Confirmar"
                        placeholder="Repite la contraseña"
                        value={confirm}
                        onValueChange={setConfirm}
                        isDisabled={loading}
                        autoComplete="new-password"
                    />

                    {password.length > 0 && (
                        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-1 pt-1">
                            {PW_RULES.map(rule => {
                                const ok = rule.test(password);
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

                    <BaseButton.Root
                        type="submit"
                        disabled={loading}
                        variant="primary"
                        className="w-full h-11 mt-1 rounded-xl shadow-sm"
                    >
                        {loading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Actualizando…</>
                            : "Actualizar contraseña"}
                    </BaseButton.Root>
                </form>
            )}

            {/* ── Stage 4 · Éxito ──────────────────────────────────────── */}
            {stage === "success" && (
                <div className="space-y-6">
                    <div className="p-8 border border-emerald-500/30 rounded-2xl bg-emerald-500/[0.08] space-y-4 text-center">
                        <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <h3 className="font-sans font-bold text-emerald-700 dark:text-emerald-400 text-[18px]">
                            Listo
                        </h3>
                        <p className="font-sans text-[13px] text-text-tertiary leading-relaxed">
                            Tu contraseña fue actualizada. Serás redirigido al inicio en unos segundos.
                        </p>
                    </div>

                    <BaseButton.Root
                        as={Link}
                        href="/sign-in"
                        variant="secondary"
                        className="w-full h-11 rounded-xl"
                    >
                        Ir al inicio ahora
                        <ArrowRight className="w-4 h-4" />
                    </BaseButton.Root>
                </div>
            )}
        </AuthShell>
    );
}

// ============================================================================
// STEP INDICATOR — chrome dense, mono uppercase, primary accent on active
// ============================================================================

function StepIndicator({ current }: { current: Exclude<Stage, "success"> }) {
    const currentIdx = STAGES_META.findIndex(s => s.id === current);

    return (
        <div className="flex items-center gap-2 mb-6 -mt-3">
            {STAGES_META.map((s, i) => {
                const isActive = i === currentIdx;
                const isDone   = i < currentIdx;
                return (
                    <div key={s.id} className="flex-1 flex items-center gap-2 min-w-0">
                        <div
                            className={`flex items-center gap-2 min-w-0 px-2.5 h-7 rounded-md border transition-colors ${
                                isActive
                                    ? "border-primary-500/50 bg-primary-500/[0.08]"
                                    : isDone
                                        ? "border-border-light bg-surface-2"
                                        : "border-border-light bg-surface-1"
                            }`}
                        >
                            <span
                                className={`font-mono text-[10px] tabular-nums font-bold ${
                                    isActive
                                        ? "text-primary-500"
                                        : isDone
                                            ? "text-text-tertiary"
                                            : "text-text-disabled"
                                }`}
                            >
                                {String(i + 1).padStart(2, "0")}
                            </span>
                            <span
                                className={`font-mono text-[10px] uppercase tracking-[0.14em] font-semibold truncate ${
                                    isActive
                                        ? "text-foreground"
                                        : isDone
                                            ? "text-text-tertiary"
                                            : "text-text-disabled"
                                }`}
                            >
                                {s.label}
                            </span>
                        </div>
                        {i < STAGES_META.length - 1 && (
                            <span
                                className={`h-px flex-1 transition-colors ${
                                    isDone ? "bg-primary-500/40" : "bg-border-light"
                                }`}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

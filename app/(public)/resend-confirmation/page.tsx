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
    Inbox,
    RotateCcw,
    Clock,
    ShieldCheck,
    Mail,
    RefreshCw,
} from "lucide-react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { LogoMark } from "@/src/shared/frontend/components/logo";

const INPUT_CLS = [
    "w-full h-11 px-4 rounded-xl",
    "bg-surface-2 border border-border-medium hover:border-border-default",
    "text-[14px] font-medium text-foreground placeholder:text-[var(--text-disabled)]",
    "outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "transition-all duration-200",
].join(" ");

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

    const [email,       setEmail]       = useState(searchParams.get("email") ?? "");
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState<string | null>(null);
    const [sent,        setSent]        = useState(false);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [now,         setNow]         = useState(() => Date.now());

    // Supabase agrega errores al hash fragment (p.ej. #error_code=otp_expired).
    // useSyncExternalStore evita el pattern de "setState dentro de useEffect".
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
        setError(null);

        if (!email.trim()) { setError("El correo es requerido."); return; }
        if (!/\S+@\S+\.\S+/.test(email.trim())) { setError("El correo no es válido."); return; }
        if (cooldownRemaining > 0) return;

        setLoading(true);
        const err = await resendConfirmation(email.trim());
        setLoading(false);

        if (err) { setError(err); return; }

        setSent(true);
        setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000);
        setNow(Date.now());
    }

    const showExpiredBadge = hashDetected || reason === "expired";

    return (
        <div className="flex-1 flex flex-col md:flex-row min-h-0">

            {/* ── Form Side (Left) ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 lg:px-20 overflow-y-auto hidden-scrollbar">
                <div className="w-full max-w-[380px]">

                    <div className="flex flex-col items-center mb-8">
                        <div className="w-14 h-14 rounded-2xl bg-primary-500 flex items-center justify-center mb-5 shadow-lg shadow-primary-500/30">
                            <LogoMark size={24} className="text-white" />
                        </div>
                        <h1 className="text-[26px] font-bold text-foreground tracking-tight mb-2 text-center">
                            Reenviar confirmación
                        </h1>
                        <p className="text-[13px] text-text-tertiary text-center max-w-[300px] leading-relaxed">
                            Te enviaremos un nuevo enlace para confirmar tu correo.
                        </p>
                    </div>

                    {showExpiredBadge && !sent && (
                        <div className="flex items-start gap-3 px-4 py-3 mb-4 rounded-xl bg-amber-500/5 border border-amber-500/30">
                            <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-[12px] font-bold text-foreground leading-tight">
                                    El enlace anterior expiró
                                </p>
                                <p className="text-[11px] text-text-tertiary font-medium leading-relaxed mt-1">
                                    Los enlaces de Supabase duran unas horas. Pide uno nuevo abajo.
                                </p>
                            </div>
                        </div>
                    )}

                    {sent ? (
                        <div className="space-y-6">
                            <div className="p-6 border border-emerald-500/30 rounded-2xl bg-emerald-500/10 space-y-3 text-center">
                                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                                    <Send className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-emerald-600 dark:text-emerald-400 text-[17px]">
                                    Nuevo correo en camino
                                </h3>
                                <p className="text-[13px] text-text-tertiary font-medium leading-relaxed">
                                    Enviamos un enlace fresco a <span className="text-foreground font-bold">{email}</span>. Revisa tu bandeja y la carpeta de spam.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-3">
                                <BaseButton.Root
                                    type="submit"
                                    disabled={loading || cooldownRemaining > 0}
                                    variant="secondary"
                                    className="w-full h-11 rounded-xl text-[12px] font-bold flex items-center justify-center gap-2"
                                >
                                    {loading
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                                        : cooldownRemaining > 0
                                            ? <><RefreshCw className="w-3.5 h-3.5" /> Reintentar en {cooldownRemaining}s</>
                                            : <><RotateCcw className="w-3.5 h-3.5" /> Enviar otra vez</>}
                                </BaseButton.Root>
                                {error && (
                                    <p className="text-[11px] text-red-500 font-medium text-center">{error}</p>
                                )}
                            </form>

                            <Link
                                href="/sign-in"
                                className="flex items-center justify-center gap-2 text-[13px] font-bold text-primary-500 hover:text-primary-600 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Volver al login
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                                <div>
                                    <label className="block text-[12px] font-bold text-text-secondary mb-1.5 uppercase tracking-wider">
                                        Correo
                                    </label>
                                    <input
                                        type="email"
                                        autoComplete="email"
                                        placeholder="usuario@empresa.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        disabled={loading}
                                        className={INPUT_CLS}
                                    />
                                </div>

                                {error && (
                                    <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/10">
                                        <p className="text-[13px] text-red-500 font-medium">
                                            {error}
                                        </p>
                                    </div>
                                )}

                                <BaseButton.Root
                                    type="submit"
                                    disabled={loading || cooldownRemaining > 0}
                                    variant="primary"
                                    className="w-full h-11 mt-1 rounded-xl text-[13px] font-bold shadow-md shadow-primary-500/20 flex items-center justify-center gap-2"
                                >
                                    {loading
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                                        : cooldownRemaining > 0
                                            ? `Reintentar en ${cooldownRemaining}s`
                                            : "Enviar nuevo enlace"}
                                </BaseButton.Root>
                            </form>

                            <div className="p-4 border border-border-default rounded-xl bg-surface-1/50 shadow-sm mt-2">
                                <p className="text-[12px] text-text-tertiary flex items-start gap-3 leading-relaxed">
                                    <AlertCircle className="w-4 h-4 text-primary-400 mt-0.5 shrink-0" />
                                    <span>Solo funciona si aún no has confirmado tu correo. Si ya lo confirmaste, usa <Link href="/sign-in" className="text-primary-500 font-bold hover:underline">iniciar sesión</Link>.</span>
                                </p>
                            </div>

                            <div className="pt-4 flex justify-center">
                                <Link href="/sign-in" className="flex items-center gap-2 text-[13px] font-bold text-text-tertiary hover:text-foreground transition-colors">
                                    <ChevronLeft className="w-4 h-4" />
                                    Volver al login
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Visual Side (Right) ──────────────────────────────────── */}
            <div className="hidden md:flex flex-1 relative p-6 items-center justify-center">
                <div className="w-full h-full rounded-[28px] relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-primary-500 via-primary-600 to-orange-600">

                    <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-white/10 blur-[80px] pointer-events-none" />
                    <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-black/20 blur-[80px] pointer-events-none" />

                    <div
                        className="absolute inset-0 opacity-[0.07] pointer-events-none"
                        style={{
                            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
                            backgroundSize: "40px 40px",
                        }}
                    />

                    <div className="relative z-10 flex flex-col items-center">
                        <div className="relative w-64 h-64 flex items-center justify-center mb-10">
                            <div className="absolute inset-0 rounded-full border border-white/20" />
                            <div className="absolute inset-8 rounded-full border border-white/15" />
                            <div className="absolute inset-16 rounded-full border border-white/15" />

                            <div className="relative z-10 w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-2xl">
                                <MailCheck size={32} className="text-white" />
                            </div>

                            {[
                                { icon: <Mail       className="w-5 h-5 text-white" />, angle: 0   },
                                { icon: <Send       className="w-5 h-5 text-white" />, angle: 60  },
                                { icon: <Inbox      className="w-5 h-5 text-white" />, angle: 120 },
                                { icon: <ShieldCheck className="w-5 h-5 text-white" />, angle: 180 },
                                { icon: <Clock      className="w-5 h-5 text-white" />, angle: 240 },
                                { icon: <RotateCcw  className="w-5 h-5 text-white" />, angle: 300 },
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

                        <div className="text-center px-8 max-w-sm">
                            <h2 className="text-white text-[26px] font-black leading-tight mb-3">
                                Un enlace{" "}
                                <span className="text-white/70">fresco</span>
                                , directo a tu bandeja.
                            </h2>
                            <p className="text-white/60 text-[13px] leading-relaxed">
                                Reenvía tu correo de confirmación en segundos y retoma tu acceso a kont.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

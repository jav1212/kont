"use client";

import { useState } from "react";
import Link from "next/link";
import { 
    Loader2, 
    Lock, 
    Send, 
    ChevronLeft, 
    AlertCircle,
    Shield,
    Key,
    UserCheck,
    Fingerprint,
    Bell,
    CheckCircle2
} from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { LogoMark } from "@/src/shared/frontend/components/logo";

export default function ForgotPasswordPage() {
    const [email,   setEmail]   = useState("");
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const [sent,    setSent]    = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim()) { setError("El correo es requerido."); return; }

        setLoading(true);
        setError(null);

        const res  = await fetch("/api/auth/forgot-password", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email }),
        });
        const json = await res.json();
        setLoading(false);

        if (!res.ok) { setError(json.error ?? "Error al enviar el correo."); return; }

        setSent(true);
    }

    return (
        <div className="flex-1 flex flex-col md:flex-row min-h-0">

            {/* ── Form Side (Left) ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 lg:px-20 overflow-y-auto hidden-scrollbar">
                <div className="w-full max-w-[380px]">

                    {/* Logo icon */}
                    <div className="flex flex-col items-center mb-10">
                        <div className="w-14 h-14 rounded-2xl bg-primary-500 flex items-center justify-center mb-5 shadow-lg shadow-primary-500/30">
                            <LogoMark size={24} className="text-white" />
                        </div>
                        <h1 className="text-[26px] font-bold text-foreground tracking-tight mb-2">
                            Recuperar acceso
                        </h1>
                        <p className="text-[13px] text-text-tertiary text-center max-w-[280px] leading-relaxed">
                            Ingresa tu correo y te enviaremos un enlace de recuperación.
                        </p>
                    </div>

                    {sent ? (
                        <div className="space-y-6">
                            <div className="p-6 border border-emerald-500/30 rounded-2xl bg-emerald-500/10 space-y-3 text-center">
                                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                                    <Send className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-emerald-600 dark:text-emerald-400 text-[17px]">Enlace Enviado</h3>
                                <p className="text-[13px] text-text-tertiary font-medium leading-relaxed">
                                    Si hay una cuenta vinculada a <span className="text-foreground font-bold">{email}</span>, recibirás un mensaje en breve.
                                </p>
                            </div>
                            <Link href="/sign-in" className="flex items-center justify-center gap-2 mt-4 text-[13px] font-bold text-primary-500 hover:text-primary-600 transition-colors">
                                <ChevronLeft className="w-4 h-4" />
                                Volver al login
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                                <BaseInput.Field
                                    label="Correo Corporativo"
                                    type="email"
                                    placeholder="usuario@empresa.com"
                                    value={email}
                                    onValueChange={setEmail}
                                    isDisabled={loading}
                                />

                                {error && (
                                    <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/10">
                                        <p className="text-[13px] text-red-500 font-medium">
                                            {error}
                                        </p>
                                    </div>
                                )}

                                <BaseButton.Root
                                    type="submit"
                                    disabled={loading}
                                    variant="primary"
                                    className="w-full h-11 mt-1 rounded-xl text-[13px] font-bold shadow-md shadow-primary-500/20 flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                                    ) : (
                                        "Solicitar Link"
                                    )}
                                </BaseButton.Root>
                            </form>

                            <div className="p-4 border border-border-default rounded-xl bg-surface-1/50 shadow-sm mt-2">
                                <p className="text-[12px] text-text-tertiary flex items-start gap-3 leading-relaxed">
                                    <AlertCircle className="w-4 h-4 text-primary-400 mt-0.5 shrink-0" />
                                    <span>El enlace expira en 30 min. Recuerda revisar tu bandeja de correo no deseado.</span>
                                </p>
                            </div>

                            <div className="pt-4 flex justify-center">
                                <Link href="/sign-in" className="flex items-center gap-2 text-[13px] font-bold text-text-tertiary hover:text-foreground transition-colors">
                                    <ChevronLeft className="w-4 h-4" />
                                    Regresar
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Visual Side (Right) ──────────────────────────────────── */}
            <div className="hidden md:flex flex-1 relative p-6 items-center justify-center">
                <div className="w-full h-full rounded-[28px] relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-primary-500 via-primary-600 to-orange-600">
                    
                    {/* Ambient light glows */}
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
                            {/* Outer ring */}
                            <div className="absolute inset-0 rounded-full border border-white/20" />
                            {/* Middle ring */}
                            <div className="absolute inset-8 rounded-full border border-white/15" />
                            {/* Inner ring */}
                            <div className="absolute inset-16 rounded-full border border-white/15" />

                            {/* Center icon */}
                            <div className="relative z-10 w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-2xl">
                                <Lock size={32} className="text-white" />
                            </div>

                            {/* Orbiting icons — Cybersecurity-themed for recovery */}
                            {[
                                { icon: <Shield className="w-5 h-5 text-white" />, label: "Seguridad", angle: 0   },
                                { icon: <Key className="w-5 h-5 text-white" />, label: "Accesos", angle: 60  },
                                { icon: <UserCheck className="w-5 h-5 text-white" />, label: "Verificación", angle: 120 },
                                { icon: <Fingerprint className="w-5 h-5 text-white" />, label: "Biometría", angle: 180 },
                                { icon: <Bell className="w-5 h-5 text-white" />, label: "Alertas", angle: 240 },
                                { icon: <CheckCircle2 className="w-5 h-5 text-white" />, label: "Éxito", angle: 300 },
                            ].map(({ icon, angle }) => {
                                const rad = (angle * Math.PI) / 180;
                                const r   = 104;
                                const x   = Math.round(Math.cos(rad) * r);
                                const y   = Math.round(Math.sin(rad) * r);
                                return (
                                    <div
                                        key={angle}
                                        className="absolute w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg hover:bg-white/20 transition-colors cursor-default"
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
                                Protegemos tu{" "}
                                <span className="text-white/70">Información</span>
                            </h2>
                            <p className="text-white/60 text-[13px] leading-relaxed">
                                Procesos de autenticación blindados y cumplimiento con los más altos estándares de seguridad corporativa.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

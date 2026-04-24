"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Send, ChevronLeft, AlertCircle, KeyRound } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { AuthShell, AuthHeader, AuthVisual } from "../_components/auth-shell";

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

    const visual = (
        <AuthVisual
            heading={<>Tu acceso,<br /><span className="text-white/70">blindado siempre.</span></>}
            copy="Procesos de autenticación cifrados. Los enlaces de recuperación expiran en 30 minutos."
        />
    );

    return (
        <AuthShell visual={visual}>
            <AuthHeader
                icon={<KeyRound className="w-5 h-5 text-white" />}
                title="Recuperar acceso"
                subtitle="Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña."
            />

            {sent ? (
                <div className="space-y-6">
                    <div className="p-6 border border-emerald-500/30 rounded-2xl bg-emerald-500/[0.08] space-y-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
                            <Send className="w-6 h-6" />
                        </div>
                        <h3 className="font-sans font-bold text-emerald-700 dark:text-emerald-400 text-[17px]">Enlace enviado</h3>
                        <p className="font-sans text-[13px] text-text-tertiary leading-relaxed">
                            Si hay una cuenta vinculada a <span className="text-foreground font-semibold">{email}</span>, recibirás un mensaje en breve.
                        </p>
                    </div>
                    <Link href="/sign-in" className="flex items-center justify-center gap-2 mt-4 font-mono text-[12px] uppercase tracking-[0.1em] font-semibold text-primary-500 hover:text-primary-600 transition-colors">
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

                        {error && (
                            <div role="alert" aria-live="polite" className="px-4 py-3 border border-red-500/30 rounded-xl bg-red-500/[0.07]">
                                <p className="font-sans text-[13px] text-red-600 dark:text-red-400 leading-relaxed">{error}</p>
                            </div>
                        )}

                        <BaseButton.Root
                            type="submit"
                            disabled={loading}
                            variant="primary"
                            className="w-full h-11 mt-1 rounded-xl shadow-sm"
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                                : "Enviar enlace"}
                        </BaseButton.Root>
                    </form>

                    <div className="p-3.5 border border-border-light rounded-xl bg-surface-1 shadow-sm mt-2">
                        <p className="font-sans text-[12px] text-text-tertiary flex items-start gap-2.5 leading-relaxed">
                            <AlertCircle className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                            <span>El enlace expira en 30 minutos. Revisa también tu carpeta de spam.</span>
                        </p>
                    </div>

                    <div className="pt-3 flex justify-center">
                        <Link href="/sign-in" className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] font-semibold text-text-tertiary hover:text-foreground transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                            Regresar
                        </Link>
                    </div>
                </div>
            )}
        </AuthShell>
    );
}

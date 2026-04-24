"use client";

import { useState } from "react";
import Link from "next/link";
import { BaseInput } from "@/src/shared/frontend/components/base-input";

const Spinner = () => (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

export default function AdminForgotPasswordPage() {
    const [email,   setEmail]   = useState("");
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const [sent,    setSent]    = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim()) { setError("El correo es requerido."); return; }

        setLoading(true);
        setError(null);

        const res  = await fetch("/api/admin/forgot-password", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email }),
        });
        const json = await res.json();
        setLoading(false);

        if (!res.ok) {
            setError(json.error ?? "Error al enviar el correo.");
            return;
        }

        setSent(true);
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-8 bg-surface-2">
            <div className="w-full max-w-sm">

                {/* Logo */}
                <div className="flex flex-col gap-1 mb-10">
                    <div className="flex items-end leading-none gap-0" aria-label="Konta">
                        <span className="font-sans font-black text-[20px] leading-none tracking-[-0.03em] text-foreground">Konta</span>
                        <span className="font-black text-[20px] leading-none" style={{ color: '#FF4A18' }}>.</span>
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-500/70">Administración</span>
                </div>

                {sent ? (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <h1 className="font-mono text-[26px] font-black uppercase tracking-tighter text-foreground leading-none">
                                Revisa tu<br />correo
                            </h1>
                            <p className="font-mono text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                                Si <span className="text-[var(--text-secondary)]">{email}</span> está registrado como administrador, recibirás un enlace para restablecer tu contraseña.
                            </p>
                        </div>
                        <Link
                            href="/admin/sign-in"
                            className="font-mono text-[11px] text-[var(--text-tertiary)] hover:text-foreground transition-colors flex items-center gap-1.5"
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 6H2M6 2L2 6l4 4" />
                            </svg>
                            Volver al inicio de sesión
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-8">
                        <div className="space-y-2">
                            <h1 className="font-mono text-[26px] font-black uppercase tracking-tighter text-foreground leading-none">
                                Recuperar<br />contraseña
                            </h1>
                            <p className="font-mono text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                                Ingresa tu correo y te enviaremos un enlace para restablecerla.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            <BaseInput.Field
                                label="Correo electrónico"
                                type="email"
                                autoComplete="email"
                                autoFocus
                                placeholder="admin@empresa.com"
                                value={email}
                                onValueChange={setEmail}
                                isDisabled={loading}
                            />

                            {error && (
                                <div className="px-3 py-2.5 border border-red-500/20 rounded-lg bg-red-500/[0.06]">
                                    <p className="font-mono text-[10px] text-red-400">{error}</p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className={[
                                    "w-full h-10 mt-2 rounded-lg",
                                    "bg-red-600 hover:bg-red-500 active:bg-red-700",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    "font-mono text-[11px] uppercase tracking-[0.18em] text-white",
                                    "transition-colors duration-150 flex items-center justify-center gap-2",
                                ].join(" ")}
                            >
                                {loading ? <><Spinner /> Enviando…</> : "Enviar enlace"}
                            </button>
                        </form>

                        <Link
                            href="/admin/sign-in"
                            className="font-mono text-[11px] text-[var(--text-tertiary)] hover:text-foreground transition-colors flex items-center gap-1.5"
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 6H2M6 2L2 6l4 4" />
                            </svg>
                            Volver al inicio de sesión
                        </Link>
                    </div>
                )}

            </div>
        </div>
    );
}

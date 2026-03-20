"use client";

import { useState } from "react";
import Link from "next/link";

const INPUT_CLS = [
    "w-full h-10 px-3 rounded-lg",
    "bg-foreground/[0.04] border border-foreground/10",
    "font-mono text-[12px] text-foreground placeholder:text-[var(--text-disabled)]",
    "outline-none focus:border-red-500/50 focus:bg-foreground/[0.06]",
    "disabled:opacity-40 disabled:cursor-not-allowed",
    "transition-colors duration-150",
].join(" ");

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
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-8 h-8 rounded-[6px] bg-red-600 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                            <rect x="1" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.9" />
                            <rect x="8" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                            <rect x="1" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                            <rect x="8" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.9" />
                        </svg>
                    </div>
                    <div>
                        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground block">Kont</span>
                        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-500/70 block">Administración</span>
                    </div>
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
                            <div className="flex flex-col gap-1.5">
                                <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                                    Correo electrónico
                                </label>
                                <input
                                    type="email"
                                    autoComplete="email"
                                    autoFocus
                                    placeholder="admin@empresa.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                    className={INPUT_CLS}
                                />
                            </div>

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

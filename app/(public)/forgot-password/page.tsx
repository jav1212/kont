"use client";

import { useState } from "react";
import Link from "next/link";

const INPUT_CLS = [
    "w-full h-10 px-3 rounded-lg",
    "bg-foreground/[0.04] border border-foreground/10",
    "font-mono text-[12px] text-foreground placeholder:text-foreground/25",
    "outline-none focus:border-primary-500/60 focus:bg-foreground/[0.06]",
    "disabled:opacity-40 disabled:cursor-not-allowed",
    "transition-colors duration-150",
].join(" ");

const Spinner = () => (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

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
        <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-8 py-16">
            <div className="w-full max-w-sm">

                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-px w-6 bg-primary-500/60" />
                        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-primary-400/70">
                            Recuperación
                        </span>
                    </div>
                    <h1 className="font-mono text-[28px] font-black uppercase tracking-tighter text-foreground leading-none">
                        Restablecer<br />contraseña
                    </h1>
                    <p className="font-mono text-[11px] text-foreground/30 mt-3 leading-relaxed">
                        Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
                    </p>
                </div>

                {sent ? (
                    <div className="space-y-6">
                        <div className="px-4 py-3.5 border border-primary-500/20 rounded-lg bg-primary-500/[0.05]">
                            <p className="font-mono text-[11px] text-foreground/60 leading-relaxed">
                                Si <span className="text-foreground/80">{email}</span> está registrado, recibirás un enlace en tu correo. Revisa también la carpeta de spam.
                            </p>
                        </div>
                        <Link
                            href="/sign-in"
                            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/30 hover:text-foreground/60 transition-colors"
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 6H2M6 2L2 6l4 4" />
                            </svg>
                            Volver a iniciar sesión
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            <div className="flex flex-col gap-1.5">
                                <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                    Correo electrónico
                                </label>
                                <input
                                    type="email"
                                    autoFocus
                                    autoComplete="email"
                                    placeholder="usuario@empresa.com"
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
                                    "bg-primary-500 hover:bg-primary-400 active:bg-primary-600",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    "font-mono text-[11px] uppercase tracking-[0.18em] text-white",
                                    "transition-colors duration-150 flex items-center justify-center gap-2",
                                ].join(" ")}
                            >
                                {loading ? (
                                    <><Spinner /> Enviando…</>
                                ) : (
                                    <>
                                        Enviar enlace
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M1 6h10M6 1l5 5-5 5" />
                                        </svg>
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="px-4 py-3.5 border border-foreground/[0.07] rounded-lg bg-foreground/[0.02]">
                            <p className="font-mono text-[10px] text-foreground/25 leading-relaxed">
                                El enlace expira en 30 minutos. Revisa también tu carpeta de spam.
                            </p>
                        </div>

                        <Link
                            href="/sign-in"
                            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/30 hover:text-foreground/60 transition-colors"
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 6H2M6 2L2 6l4 4" />
                            </svg>
                            Volver a iniciar sesión
                        </Link>
                    </div>
                )}

            </div>
        </div>
    );
}

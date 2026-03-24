"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";

const INPUT_CLS = [
    "w-full h-10 px-3 rounded-lg",
    "bg-foreground/[0.04] border border-foreground/10",
    "font-mono text-[15px] text-foreground placeholder:text-[var(--text-disabled)]",
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

function SignInFormContent() {
    const { signIn } = useAuth();
    const router       = useRouter();
    const searchParams = useSearchParams();

    const [email,   setEmail]   = useState("");
    const [pass,    setPass]    = useState("");
    const [error,   setError]   = useState<string | null>(
        searchParams.get("error")
    );
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!email.trim()) { setError("El correo es requerido."); return; }
        if (!pass)         { setError("La contraseña es requerida."); return; }

        setLoading(true);
        const err = await signIn(email, pass);
        setLoading(false);

        if (err) { setError(err); return; }

        const redirectTo = searchParams.get("redirectTo") ?? "/documents";
        router.replace(redirectTo);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[12px] uppercase tracking-[0.18em] text-text-tertiary">
                    Correo electrónico
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

            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <label className="font-mono text-[12px] uppercase tracking-[0.18em] text-text-tertiary">
                        Contraseña
                    </label>
                    <Link
                        href="/forgot-password"
                        className="font-mono text-[12px] uppercase tracking-[0.16em] text-text-link hover:text-text-link-hover transition-colors"
                    >
                        ¿Olvidaste la tuya?
                    </Link>
                </div>
                <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    disabled={loading}
                    className={INPUT_CLS}
                />
            </div>

            {error && (
                <div className="px-3 py-2.5 border border-red-500/20 rounded-lg bg-red-500/[0.06]">
                    <p className="font-mono text-[13px] text-red-400 leading-relaxed">
                        {error}
                    </p>
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className={[
                    "w-full h-10 mt-2 rounded-lg",
                    "bg-primary-500 hover:bg-primary-400 active:bg-primary-600",
                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-500",
                    "font-mono text-[13px] uppercase tracking-[0.18em] text-white",
                    "transition-colors duration-150",
                    "flex items-center justify-center gap-2",
                ].join(" ")}
            >
                {loading ? (
                    <><Spinner /> Autenticando…</>
                ) : (
                    <>
                        Entrar
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 6h8M6 2l4 4-4 4" />
                        </svg>
                    </>
                )}
            </button>
        </form>
    );
}

export default function SignInPage() {
    return (
        <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-8 py-16">
            <div className="w-full max-w-sm">

                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-px w-6 bg-primary-500/60" />
                        <span className="font-mono text-[12px] uppercase tracking-[0.28em] text-text-link">
                            Acceso
                        </span>
                    </div>
                    <h1 className="font-mono text-[28px] font-black uppercase tracking-tighter text-foreground leading-none">
                        Iniciar<br />sesión
                    </h1>
                    <p className="font-mono text-[14px] text-text-tertiary mt-3 leading-relaxed">
                        Ingresa tus credenciales para acceder al sistema de gestión contable.
                    </p>
                </div>

                <Suspense fallback={<div className="h-40 flex items-center justify-center font-mono text-[13px] text-[var(--text-disabled)]">Cargando...</div>}>
                    <SignInFormContent />
                </Suspense>

                <div className="flex items-center gap-3 my-6">
                    <div className="flex-1 h-px bg-foreground/[0.06]" />
                    <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-disabled)]">o</span>
                    <div className="flex-1 h-px bg-foreground/[0.06]" />
                </div>

                <p className="font-mono text-[13px] text-center text-text-tertiary">
                    ¿Sin cuenta?{" "}
                    <Link
                        href="/sign-up"
                        className="text-text-link hover:text-text-link-hover transition-colors underline underline-offset-2"
                    >
                        Regístrate aquí
                    </Link>
                </p>

            </div>
        </div>
    );
}

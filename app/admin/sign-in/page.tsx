"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BaseInput } from "@/src/shared/frontend/components/base-input";

const Spinner = () => (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

export default function AdminSignInPage() {
    const router = useRouter();

    const [email,   setEmail]   = useState("");
    const [pass,    setPass]    = useState("");
    const [error,   setError]   = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!email.trim()) { setError("El correo es requerido."); return; }
        if (!pass)         { setError("La contraseña es requerida."); return; }

        setLoading(true);

        const res  = await fetch("/api/admin/sign-in", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email, password: pass }),
        });
        const json = await res.json();

        setLoading(false);

        if (!res.ok) {
            setError(json.error ?? "Error al iniciar sesión.");
            return;
        }

        router.replace("/admin");
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-8 bg-surface-2">
            <div className="w-full max-w-sm">

                <div className="mb-10">
                    {/* Logo */}
                    <div className="flex flex-col gap-1 mb-8">
                        <div className="flex items-end leading-none gap-0" aria-label="Kontave">
                            <span className="font-sans font-black text-[20px] leading-none tracking-[-0.03em] text-foreground">Kontave</span>
                            <span className="font-black text-[20px] leading-none" style={{ color: '#FF4A18' }}>.</span>
                        </div>
                        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-500/70">Administración</span>
                    </div>

                    <h1 className="font-mono text-[26px] font-black uppercase tracking-tighter text-foreground leading-none">
                        Acceso<br />restringido
                    </h1>
                    <p className="font-mono text-[11px] text-[var(--text-tertiary)] mt-3 leading-relaxed">
                        Solo administradores autorizados pueden ingresar.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <BaseInput.Field
                        label="Correo electrónico"
                        type="email"
                        autoComplete="email"
                        placeholder="admin@empresa.com"
                        value={email}
                        onValueChange={setEmail}
                        isDisabled={loading}
                    />

                    <BaseInput.Field
                        label="Contraseña"
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={pass}
                        onValueChange={setPass}
                        isDisabled={loading}
                    />

                    {error && (
                        <div className="px-3 py-2.5 border border-red-500/20 rounded-lg bg-red-500/[0.06]">
                            <p className="font-mono text-[10px] text-red-400 leading-relaxed">
                                {error}
                            </p>
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
                            "transition-colors duration-150",
                            "flex items-center justify-center gap-2",
                        ].join(" ")}
                    >
                        {loading ? (
                            <><Spinner /> Verificando…</>
                        ) : (
                            <>
                                Ingresar
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 6h8M6 2l4 4-4 4" />
                                </svg>
                            </>
                        )}
                    </button>
                </form>

                <Link
                    href="/admin/forgot-password"
                    className="mt-6 block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors text-center"
                >
                    Olvidé mi contraseña
                </Link>

            </div>
        </div>
    );
}

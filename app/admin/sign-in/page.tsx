"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const INPUT_CLS = [
    "w-full h-10 px-3 rounded-lg",
    "bg-foreground/[0.04] border border-foreground/10",
    "font-mono text-[12px] text-foreground placeholder:text-foreground/25",
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
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-8 h-8 rounded-[6px] bg-red-600 flex items-center justify-center">
                            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                                <rect x="1" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.9" />
                                <rect x="8" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                                <rect x="1" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                                <rect x="8" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.9" />
                            </svg>
                        </div>
                        <div>
                            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground block">
                                Kont
                            </span>
                            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-500/70 block">
                                Administración
                            </span>
                        </div>
                    </div>

                    <h1 className="font-mono text-[26px] font-black uppercase tracking-tighter text-foreground leading-none">
                        Acceso<br />restringido
                    </h1>
                    <p className="font-mono text-[11px] text-foreground/30 mt-3 leading-relaxed">
                        Solo administradores autorizados pueden ingresar.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                            Correo electrónico
                        </label>
                        <input
                            type="email"
                            autoComplete="email"
                            placeholder="admin@empresa.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
                            className={INPUT_CLS}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                            Contraseña
                        </label>
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
                    className="mt-6 block font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/30 hover:text-foreground/60 transition-colors text-center"
                >
                    Olvidé mi contraseña
                </Link>

            </div>
        </div>
    );
}

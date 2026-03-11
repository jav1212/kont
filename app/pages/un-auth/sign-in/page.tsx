import Link from "next/link";

// ============================================================================
// SIGN IN PAGE  —  /un-auth/login
// Same dark ledger aesthetic as the landing. Form-first, no distractions.
// ============================================================================

export default function SignInPage() {
    return (
        <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-8 py-16">
            <div className="w-full max-w-sm">

                {/* ── Header ───────────────────────────────────────────── */}
                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-px w-6 bg-indigo-500/60" />
                        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-indigo-400/70">
                            Acceso
                        </span>
                    </div>
                    <h1 className="font-mono text-[28px] font-black uppercase tracking-tighter text-white leading-none">
                        Iniciar<br />sesión
                    </h1>
                    <p className="font-mono text-[11px] text-white/30 mt-3 leading-relaxed">
                        Ingresa tus credenciales para acceder al sistema de nómina.
                    </p>
                </div>

                {/* ── Form ─────────────────────────────────────────────── */}
                <form className="space-y-4">

                    {/* Email */}
                    <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                            Correo electrónico
                        </label>
                        <input
                            type="email"
                            autoComplete="email"
                            placeholder="usuario@empresa.com"
                            className={[
                                "w-full h-10 px-3 rounded-lg",
                                "bg-white/[0.04] border border-white/10",
                                "font-mono text-[12px] text-white placeholder:text-white/20",
                                "outline-none focus:border-indigo-500/60 focus:bg-white/[0.06]",
                                "transition-colors duration-150",
                            ].join(" ")}
                        />
                    </div>

                    {/* Password */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                                Contraseña
                            </label>
                            <Link
                                href="/pages/un-auth/forgot-password"
                                className="font-mono text-[9px] uppercase tracking-[0.16em] text-indigo-400/60 hover:text-indigo-400 transition-colors"
                            >
                                ¿Olvidaste la tuya?
                            </Link>
                        </div>
                        <input
                            type="password"
                            autoComplete="current-password"
                            placeholder="••••••••"
                            className={[
                                "w-full h-10 px-3 rounded-lg",
                                "bg-white/[0.04] border border-white/10",
                                "font-mono text-[12px] text-white placeholder:text-white/20",
                                "outline-none focus:border-indigo-500/60 focus:bg-white/[0.06]",
                                "transition-colors duration-150",
                            ].join(" ")}
                        />
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        className={[
                            "w-full h-10 mt-2 rounded-lg",
                            "bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600",
                            "font-mono text-[11px] uppercase tracking-[0.18em] text-white",
                            "transition-colors duration-150",
                            "flex items-center justify-center gap-2",
                        ].join(" ")}
                    >
                        Entrar
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 6h8M6 2l4 4-4 4" />
                        </svg>
                    </button>
                </form>

                {/* ── Divider ───────────────────────────────────────────── */}
                <div className="flex items-center gap-3 my-6">
                    <div className="flex-1 h-px bg-white/[0.06]" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">o</span>
                    <div className="flex-1 h-px bg-white/[0.06]" />
                </div>

                {/* ── Register link ─────────────────────────────────────── */}
                <p className="font-mono text-[10px] text-center text-white/30">
                    ¿Sin cuenta?{" "}
                    <Link
                        href="/pages/un-auth/sign-up"
                        className="text-indigo-400/80 hover:text-indigo-400 transition-colors underline underline-offset-2"
                    >
                        Regístrate aquí
                    </Link>
                </p>

            </div>
        </div>
    );
}
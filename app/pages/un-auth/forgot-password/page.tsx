import Link from "next/link";

// ============================================================================
// FORGOT PASSWORD PAGE  —  /un-auth/forgot-password
// ============================================================================

export default function ForgotPasswordPage() {
    return (
        <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-8 py-16">
            <div className="w-full max-w-sm">

                {/* ── Header ───────────────────────────────────────────── */}
                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-px w-6 bg-indigo-500/60" />
                        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-indigo-400/70">
                            Recuperación
                        </span>
                    </div>
                    <h1 className="font-mono text-[28px] font-black uppercase tracking-tighter text-white leading-none">
                        Restablecer<br />contraseña
                    </h1>
                    <p className="font-mono text-[11px] text-white/30 mt-3 leading-relaxed">
                        Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
                    </p>
                </div>

                {/* ── Form ─────────────────────────────────────────────── */}
                <form className="space-y-4">

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
                        Enviar enlace
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 6h10M6 1l5 5-5 5" />
                        </svg>
                    </button>
                </form>

                {/* ── Info note ─────────────────────────────────────────── */}
                <div className="mt-6 px-4 py-3.5 border border-white/[0.07] rounded-lg bg-white/[0.02]">
                    <p className="font-mono text-[10px] text-white/25 leading-relaxed">
                        El enlace expira en 30 minutos. Revisa también tu carpeta de spam.
                    </p>
                </div>

                {/* ── Back to login ─────────────────────────────────────── */}
                <div className="flex items-center gap-3 mt-8">
                    <Link
                        href="/pages/un-auth/sign-in"
                        className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/30 hover:text-white/60 transition-colors"
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 6H2M6 2L2 6l4 4" />
                        </svg>
                        Volver a iniciar sesión
                    </Link>
                </div>

            </div>
        </div>
    );
}
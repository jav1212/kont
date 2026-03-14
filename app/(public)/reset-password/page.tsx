"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";

const INPUT_CLS = [
    "w-full h-10 px-3 rounded-lg",
    "bg-foreground/[0.04] border border-foreground/10",
    "font-mono text-[12px] text-foreground placeholder:text-foreground/25",
    "outline-none focus:border-indigo-500/60 focus:bg-foreground/[0.06]",
    "disabled:opacity-40 disabled:cursor-not-allowed",
    "transition-colors duration-150",
].join(" ");

const Spinner = () => (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

type Stage = "loading" | "ready" | "success" | "invalid";

export default function ResetPasswordPage() {
    const router = useRouter();
    const [stage,    setStage]    = useState<Stage>("loading");
    const [password, setPassword] = useState("");
    const [confirm,  setConfirm]  = useState("");
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState<string | null>(null);

    useEffect(() => {
        const supabase = getSupabaseBrowser();

        async function initFromHash() {
            const hash    = window.location.hash.slice(1);
            const params  = new URLSearchParams(hash);
            const type    = params.get("type");
            const access  = params.get("access_token");
            const refresh = params.get("refresh_token");

            if (type === "recovery" && access && refresh) {
                const { error } = await supabase.auth.setSession({
                    access_token:  access,
                    refresh_token: refresh,
                });
                if (error) {
                    setStage("invalid");
                } else {
                    window.history.replaceState(null, "", window.location.pathname);
                    setStage("ready");
                }
                return;
            }

            // Fallback: sesión activa por recarga
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setStage("ready");
            } else {
                setStage("invalid");
            }
        }

        initFromHash();
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!password)            { setError("La contraseña es requerida."); return; }
        if (password.length < 8)  { setError("Mínimo 8 caracteres."); return; }
        if (password !== confirm)  { setError("Las contraseñas no coinciden."); return; }

        setLoading(true);
        const supabase = getSupabaseBrowser();
        const { error: updateError } = await supabase.auth.updateUser({ password });
        setLoading(false);

        if (updateError) { setError(updateError.message); return; }

        await supabase.auth.signOut();
        setStage("success");
        setTimeout(() => router.replace("/sign-in"), 3000);
    }

    return (
        <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-8 py-16">
            <div className="w-full max-w-sm">

                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-px w-6 bg-indigo-500/60" />
                        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-indigo-400/70">
                            Recuperación
                        </span>
                    </div>
                    <h1 className="font-mono text-[28px] font-black uppercase tracking-tighter text-foreground leading-none">
                        Nueva<br />contraseña
                    </h1>
                </div>

                {stage === "loading" && (
                    <div className="flex items-center gap-3 text-foreground/40">
                        <Spinner />
                        <span className="font-mono text-[11px] uppercase tracking-widest">Verificando enlace…</span>
                    </div>
                )}

                {stage === "invalid" && (
                    <div className="space-y-5">
                        <div className="px-4 py-3.5 border border-red-500/20 rounded-lg bg-red-500/[0.05]">
                            <p className="font-mono text-[11px] text-foreground/50 leading-relaxed">
                                El enlace expiró o ya fue usado. Solicita uno nuevo.
                            </p>
                        </div>
                        <a
                            href="/forgot-password"
                            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-indigo-400/70 hover:text-indigo-400 transition-colors"
                        >
                            Solicitar nuevo enlace
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 6h10M6 1l5 5-5 5" />
                            </svg>
                        </a>
                    </div>
                )}

                {stage === "ready" && (
                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        <div className="flex flex-col gap-1.5">
                            <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                Nueva contraseña
                            </label>
                            <input
                                type="password"
                                autoFocus
                                autoComplete="new-password"
                                placeholder="Mín. 8 caracteres"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                                className={INPUT_CLS}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                Confirmar contraseña
                            </label>
                            <input
                                type="password"
                                autoComplete="new-password"
                                placeholder="Repite la contraseña"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
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
                                "bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                                "font-mono text-[11px] uppercase tracking-[0.18em] text-white",
                                "transition-colors duration-150 flex items-center justify-center gap-2",
                            ].join(" ")}
                        >
                            {loading ? <><Spinner /> Guardando…</> : "Guardar contraseña"}
                        </button>
                    </form>
                )}

                {stage === "success" && (
                    <div className="space-y-4">
                        <div className="px-4 py-3.5 border border-indigo-500/20 rounded-lg bg-indigo-500/[0.05]">
                            <p className="font-mono text-[11px] text-foreground/60 leading-relaxed">
                                Contraseña actualizada correctamente. Redirigiendo al inicio de sesión…
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-indigo-400/70">
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 7l3 3 6-6" />
                            </svg>
                            <span className="font-mono text-[10px] uppercase tracking-widest">Listo</span>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}

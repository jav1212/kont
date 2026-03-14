"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";

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

type Stage = "loading" | "ready" | "success" | "invalid";

export default function AdminResetPasswordPage() {
    const router  = useRouter();
    const [stage,    setStage]    = useState<Stage>("loading");
    const [password, setPassword] = useState("");
    const [confirm,  setConfirm]  = useState("");
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState<string | null>(null);

    // El link de Supabase usa implicit flow: los tokens van en el hash (#access_token=...&type=recovery).
    // Parseamos el hash manualmente y llamamos setSession() para establecer la sesión.
    useEffect(() => {
        const supabase = getSupabaseBrowser();

        async function initFromHash() {
            const hash   = window.location.hash.slice(1); // quitar el '#'
            const params = new URLSearchParams(hash);
            const type   = params.get("type");
            const access = params.get("access_token");
            const refresh = params.get("refresh_token");

            if (type === "recovery" && access && refresh) {
                const { error } = await supabase.auth.setSession({
                    access_token:  access,
                    refresh_token: refresh,
                });
                if (error) {
                    setStage("invalid");
                } else {
                    // Limpiar el hash de la URL sin recargar la página
                    window.history.replaceState(null, "", window.location.pathname);
                    setStage("ready");
                }
                return;
            }

            // Fallback: puede que ya haya sesión activa (recarga tras limpiar hash)
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

        if (!password)              { setError("La contraseña es requerida."); return; }
        if (password.length < 8)    { setError("Mínimo 8 caracteres."); return; }
        if (password !== confirm)   { setError("Las contraseñas no coinciden."); return; }

        setLoading(true);
        const supabase = getSupabaseBrowser();
        const { error: updateError } = await supabase.auth.updateUser({ password });
        setLoading(false);

        if (updateError) {
            setError(updateError.message);
            return;
        }

        await supabase.auth.signOut();
        setStage("success");

        setTimeout(() => router.replace("/admin/sign-in"), 3000);
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

                {stage === "loading" && (
                    <div className="flex items-center gap-3 text-foreground/40">
                        <Spinner />
                        <span className="font-mono text-[11px] uppercase tracking-widest">Verificando enlace…</span>
                    </div>
                )}

                {stage === "invalid" && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <h1 className="font-mono text-[26px] font-black uppercase tracking-tighter text-foreground leading-none">
                                Enlace<br />inválido
                            </h1>
                            <p className="font-mono text-[11px] text-foreground/40 leading-relaxed">
                                El enlace expiró o ya fue usado. Solicita uno nuevo.
                            </p>
                        </div>
                        <button
                            onClick={() => router.replace("/admin/forgot-password")}
                            className="font-mono text-[11px] text-red-500 hover:text-red-400 transition-colors"
                        >
                            Solicitar nuevo enlace →
                        </button>
                    </div>
                )}

                {stage === "ready" && (
                    <div className="space-y-8">
                        <div className="space-y-2">
                            <h1 className="font-mono text-[26px] font-black uppercase tracking-tighter text-foreground leading-none">
                                Nueva<br />contraseña
                            </h1>
                            <p className="font-mono text-[11px] text-foreground/30 leading-relaxed">
                                Elige una contraseña segura de al menos 8 caracteres.
                            </p>
                        </div>

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
                                    "bg-red-600 hover:bg-red-500 active:bg-red-700",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    "font-mono text-[11px] uppercase tracking-[0.18em] text-white",
                                    "transition-colors duration-150 flex items-center justify-center gap-2",
                                ].join(" ")}
                            >
                                {loading ? <><Spinner /> Guardando…</> : "Guardar contraseña"}
                            </button>
                        </form>
                    </div>
                )}

                {stage === "success" && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <h1 className="font-mono text-[26px] font-black uppercase tracking-tighter text-foreground leading-none">
                                Contraseña<br />actualizada
                            </h1>
                            <p className="font-mono text-[11px] text-foreground/40 leading-relaxed">
                                Tu contraseña se cambió correctamente. Redirigiendo…
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-green-500">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 7.5l3.5 3.5 6.5-7" />
                            </svg>
                            <span className="font-mono text-[11px] uppercase tracking-widest">Listo</span>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}

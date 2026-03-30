"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import Link from "next/link";
import { 
    Loader2, 
    Lock, 
    CheckCircle2, 
    XCircle, 
    ArrowRight,
    Shield,
    Key,
    Fingerprint,
    ShieldCheck,
    RefreshCw,
    UserCheck
} from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { LogoMark } from "@/src/shared/frontend/components/logo";

const INPUT_CLS = [
    "w-full h-11 px-4 rounded-xl",
    "bg-surface-2 border border-border-medium hover:border-border-default",
    "text-[14px] font-medium text-foreground placeholder:text-[var(--text-disabled)]",
    "outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "transition-all duration-200",
].join(" ");

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
        <div className="flex-1 flex flex-col md:flex-row min-h-0">

            {/* ── Form Side (Left) ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 lg:px-20 overflow-y-auto hidden-scrollbar">
                <div className="w-full max-w-[380px]">

                    {/* Logo icon */}
                    <div className="flex flex-col items-center mb-10">
                        <div className="w-14 h-14 rounded-2xl bg-primary-500 flex items-center justify-center mb-5 shadow-lg shadow-primary-500/30">
                            <LogoMark size={24} className="text-white" />
                        </div>
                        <h1 className="text-[26px] font-bold text-foreground tracking-tight mb-2">
                            Nueva contraseña
                        </h1>
                        <p className="text-[13px] text-text-tertiary text-center max-w-[280px] leading-relaxed">
                            Configura tu código de acceso personal para retornar al sistema.
                        </p>
                    </div>

                    {stage === "loading" && (
                        <div className="flex flex-col items-center justify-center py-10 gap-3 text-text-tertiary">
                            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                            <span className="text-[12px] font-bold uppercase tracking-widest">Validando Sesión…</span>
                        </div>
                    )}

                    {stage === "invalid" && (
                        <div className="space-y-6">
                            <div className="p-6 border border-red-500/20 rounded-2xl bg-red-500/10 flex flex-col items-center gap-4 text-center">
                                <XCircle className="w-10 h-10 text-red-500" />
                                <p className="text-[14px] text-red-500 font-medium leading-relaxed">
                                    El enlace caducó o es inválido. Por seguridad, debes solicitar uno nuevo.
                                </p>
                            </div>
                            <Link
                                href="/forgot-password"
                                className="flex items-center justify-center gap-2 w-full h-11 bg-surface-2 border border-border-medium hover:border-border-default rounded-xl transition-all font-bold text-[13px] text-foreground"
                            >
                                Solicitar nuevo enlace
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    )}

                    {stage === "ready" && (
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            <div>
                                <label className="block text-[12px] font-bold text-text-secondary mb-1.5 uppercase tracking-wider">
                                    Contraseña Nueva
                                </label>
                                <input
                                    type="password"
                                    placeholder="Mínimo 8 caracteres"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                    className={INPUT_CLS}
                                />
                            </div>

                            <div>
                                <label className="block text-[12px] font-bold text-text-secondary mb-1.5 uppercase tracking-wider">
                                    Verificar Clave
                                </label>
                                <input
                                    type="password"
                                    placeholder="Repite la contraseña"
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    disabled={loading}
                                    className={INPUT_CLS}
                                />
                            </div>

                            {error && (
                                <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/10 flex items-start gap-3">
                                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                    <p className="text-[13px] text-red-500 font-medium">
                                        {error}
                                    </p>
                                </div>
                            )}

                            <BaseButton.Root
                                type="submit"
                                disabled={loading}
                                variant="primary"
                                className="w-full h-11 mt-1 rounded-xl text-[13px] font-bold shadow-md shadow-primary-500/20 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</>
                                ) : (
                                    "Actualizar Clave"
                                )}
                            </BaseButton.Root>
                        </form>
                    )}

                    {stage === "success" && (
                        <div className="space-y-6">
                            <div className="p-8 border border-emerald-500/30 rounded-2xl bg-emerald-500/10 space-y-4 text-center">
                                <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-2">
                                    <CheckCircle2 className="w-8 h-8" />
                                </div>
                                <h3 className="font-bold text-emerald-600 dark:text-emerald-400 text-[18px]">
                                    Contraseña Actualizada
                                </h3>
                                <p className="text-[13px] text-text-tertiary font-medium leading-relaxed">
                                    Tu acceso ha sido restablecido con éxito. Serás redirigido al inicio en unos segundos.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Visual Side (Right) ──────────────────────────────────── */}
            <div className="hidden md:flex flex-1 relative p-6 items-center justify-center">
                <div className="w-full h-full rounded-[28px] relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-primary-500 via-primary-600 to-orange-600">
                    
                    {/* Ambient glows */}
                    <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-white/10 blur-[80px] pointer-events-none" />
                    <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-black/20 blur-[80px] pointer-events-none" />

                    {/* Grid */}
                    <div
                        className="absolute inset-0 opacity-[0.07] pointer-events-none"
                        style={{
                            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
                            backgroundSize: "40px 40px",
                        }}
                    />

                    {/* Orbit rings */}
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="relative w-64 h-64 flex items-center justify-center mb-10">
                            <div className="absolute inset-0 rounded-full border border-white/20" />
                            <div className="absolute inset-8 rounded-full border border-white/15" />
                            <div className="absolute inset-16 rounded-full border border-white/15" />

                            <div className="relative z-10 w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-2xl">
                                <Key size={32} className="text-white" />
                            </div>

                            {[
                                { icon: <Lock className="w-5 h-5 text-white" />, angle: 0   },
                                { icon: <ShieldCheck className="w-5 h-5 text-white" />, angle: 60  },
                                { icon: <Fingerprint className="w-5 h-5 text-white" />, angle: 120 },
                                { icon: <RefreshCw className="w-5 h-5 text-white" />, angle: 180 },
                                { icon: <UserCheck className="w-5 h-5 text-white" />, angle: 240 },
                                { icon: <Shield className="w-5 h-5 text-white" />, angle: 300 },
                            ].map(({ icon, angle }) => {
                                const rad = (angle * Math.PI) / 180;
                                const r   = 104;
                                const x   = Math.round(Math.cos(rad) * r);
                                const y   = Math.round(Math.sin(rad) * r);
                                return (
                                    <div
                                        key={angle}
                                        className="absolute w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg"
                                        style={{ transform: `translate(${x}px, ${y}px)` }}
                                    >
                                        {icon}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Caption */}
                        <div className="text-center px-8 max-w-sm">
                            <h2 className="text-white text-[26px] font-black leading-tight mb-3">
                                Recupera tu{" "}
                                <span className="text-white/70">Poder</span>
                            </h2>
                            <p className="text-white/60 text-[13px] leading-relaxed">
                                Actualizar tu contraseña con regularidad mantiene tus activos y los de tu compañía protegidos contra amenazas.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

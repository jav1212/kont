"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { 
    Loader2, 
    Briefcase, 
    BarChart3, 
    Receipt, 
    Package, 
    Banknote, 
    Folder 
} from "lucide-react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
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
            <div>
                <label className="block text-[12px] font-bold text-text-secondary mb-1.5 uppercase tracking-wider">
                    Correo
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

            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[12px] font-bold text-text-secondary uppercase tracking-wider">
                        Contraseña
                    </label>
                    <Link
                        href="/forgot-password"
                        className="text-[12px] font-bold text-primary-500 hover:underline transition-colors"
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
                <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/10">
                    <p className="text-[13px] text-red-500 font-medium leading-relaxed">
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
                    <><Loader2 className="w-4 h-4 animate-spin" /> Verificando…</>
                ) : (
                    "Ingresar"
                )}
            </BaseButton.Root>
        </form>
    );
}

export default function SignInPage() {
    return (
        <div className="flex-1 flex flex-col md:flex-row min-h-0">

            {/* ── Form Side (Left) ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 lg:px-20 overflow-y-auto hidden-scrollbar">
                <div className="w-full max-w-[380px]">

                    {/* Logo icon centered above form */}
                    <div className="flex flex-col items-center mb-10">
                        <div className="w-14 h-14 rounded-2xl bg-primary-500 flex items-center justify-center mb-5 shadow-lg shadow-primary-500/30">
                            <LogoMark size={24} className="text-white" />
                        </div>
                        <h1 className="text-[26px] font-bold text-foreground tracking-tight mb-2">
                            Iniciar sesión
                        </h1>
                        <p className="text-[13px] text-text-tertiary text-center max-w-[240px] leading-relaxed">
                            Ingresa tus credenciales para acceder al sistema contable.
                        </p>
                    </div>

                    <Suspense fallback={<div className="h-40 flex items-center justify-center text-[13px] text-text-tertiary">Conectando...</div>}>
                        <SignInFormContent />
                    </Suspense>

                    <div className="flex items-center gap-3 my-6">
                        <div className="flex-1 h-px bg-border-light" />
                        <span className="text-[10px] uppercase tracking-[0.15em] text-text-disabled font-bold">o</span>
                        <div className="flex-1 h-px bg-border-light" />
                    </div>

                    <p className="text-[13px] text-center text-text-tertiary">
                        ¿Compañía nueva?{" "}
                        <Link href="/sign-up" className="text-primary-500 font-bold hover:underline transition-all">
                            Crear cuenta gratis
                        </Link>
                    </p>
                </div>
            </div>

            {/* ── Visual Side (Right) ──────────────────────────────────── */}
            <div className="hidden md:flex flex-1 relative p-6 items-center justify-center">
                {/* Rounded gradient card — same pattern as reference image */}
                <div className="w-full h-full rounded-[28px] relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-primary-500 via-primary-600 to-orange-600">
                    
                    {/* Ambient light glows */}
                    <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-white/10 blur-[80px] pointer-events-none" />
                    <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-black/20 blur-[80px] pointer-events-none" />

                    {/* Grid pattern */}
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
                            {/* Outer ring */}
                            <div className="absolute inset-0 rounded-full border border-white/20" />
                            {/* Middle ring */}
                            <div className="absolute inset-8 rounded-full border border-white/15" />
                            {/* Inner ring */}
                            <div className="absolute inset-16 rounded-full border border-white/15" />

                            {/* Center icon */}
                            <div className="relative z-10 w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-2xl">
                                <LogoMark size={32} className="text-white" />
                            </div>

                            {/* Orbiting icons — accounting-themed */}
                            {[
                                { icon: <Briefcase className="w-5 h-5 text-white" />, label: "Nómina",    angle: 0   },
                                { icon: <BarChart3 className="w-5 h-5 text-white" />, label: "Reportes",  angle: 60  },
                                { icon: <Receipt className="w-5 h-5 text-white" />, label: "Facturas",  angle: 120 },
                                { icon: <Package className="w-5 h-5 text-white" />, label: "Inventario", angle: 180 },
                                { icon: <Banknote className="w-5 h-5 text-white" />, label: "Pagos",     angle: 240 },
                                { icon: <Folder className="w-5 h-5 text-white" />, label: "Archivos",  angle: 300 },
                            ].map(({ icon, label, angle }) => {
                                const rad = (angle * Math.PI) / 180;
                                const r   = 104;
                                const x   = Math.round(Math.cos(rad) * r);
                                const y   = Math.round(Math.sin(rad) * r);
                                return (
                                    <div
                                        key={angle}
                                        className="absolute w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg hover:bg-white/20 transition-colors cursor-default"
                                        style={{ transform: `translate(${x}px, ${y}px)` }}
                                        title={label}
                                    >
                                        {icon}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Caption */}
                        <div className="text-center px-8 max-w-sm">
                            <h2 className="text-white text-[26px] font-black leading-tight mb-3">
                                Gestiona Todo tu{" "}
                                <span className="text-white/70">Negocio</span>
                            </h2>
                            <p className="text-white/60 text-[13px] leading-relaxed">
                                Nómina, inventario, documentos y más — todo integrado en una sola plataforma diseñada para Venezuela.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

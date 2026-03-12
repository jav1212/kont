"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";

const PERKS = [
    { code: "01", text: "Cálculo LOTTT automático" },
    { code: "02", text: "Tasa BCV en tiempo real"  },
    { code: "03", text: "Auditoría línea a línea"  },
    { code: "04", text: "Nómina por lotes"         },
] as const;

const INPUT_CLS = [
    "w-full h-10 px-3 rounded-lg",
    "bg-white/[0.04] border border-white/10",
    "font-mono text-[12px] text-white placeholder:text-white/20",
    "outline-none focus:border-indigo-500/60 focus:bg-white/[0.06]",
    "disabled:opacity-40 disabled:cursor-not-allowed",
    "transition-colors duration-150",
].join(" ");

function validate(
    name: string, email: string, pass: string, confirm: string, terms: boolean
): string | null {
    if (!name.trim())                 return "El nombre es requerido.";
    if (!email.trim())                return "El correo es requerido.";
    if (!/\S+@\S+\.\S+/.test(email)) return "El correo no es válido.";
    if (pass.length < 6)             return "La contraseña debe tener al menos 6 caracteres.";
    if (pass !== confirm)            return "Las contraseñas no coinciden.";
    if (!terms)                      return "Debes aceptar los términos para continuar.";
    return null;
}

const Spinner = () => (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

export default function SignUpPage() {
    const { signUp } = useAuth();
    const router     = useRouter();

    const [name,    setName]    = useState("");
    const [email,   setEmail]   = useState("");
    const [pass,    setPass]    = useState("");
    const [confirm, setConfirm] = useState("");
    const [terms,   setTerms]   = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        const validationError = validate(name, email, pass, confirm, terms);
        if (validationError) { setError(validationError); return; }

        setLoading(true);
        const err = await signUp(email, pass, name);
        setLoading(false);

        if (err) { setError(err); return; }

        setSuccess(true);
        setTimeout(() => router.replace("/sign-in"), 2000);
    }

    return (
        <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-8 py-16">
            <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-16 items-start">

                {/* ── LEFT: Form ───────────────────────────────────────── */}
                <div>
                    <div className="mb-10">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-px w-6 bg-indigo-500/60" />
                            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-indigo-400/70">
                                Registro
                            </span>
                        </div>
                        <h1 className="font-mono text-[28px] font-black uppercase tracking-tighter text-white leading-none">
                            Crear<br />cuenta
                        </h1>
                        <p className="font-mono text-[11px] text-white/30 mt-3 leading-relaxed">
                            Acceso completo al sistema de gestión de nómina.
                        </p>
                    </div>

                    {success ? (
                        <div className="px-5 py-5 border border-indigo-500/30 rounded-xl bg-indigo-500/[0.06] space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full border border-indigo-500/50 bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                                    <svg width="7" height="7" viewBox="0 0 7 7" fill="none"
                                        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                                        className="text-indigo-400">
                                        <path d="M1 3.5l1.8 1.8L6 1.5" />
                                    </svg>
                                </div>
                                <span className="font-mono text-[11px] text-indigo-300 font-semibold">
                                    Cuenta creada exitosamente
                                </span>
                            </div>
                            <p className="font-mono text-[10px] text-white/30 leading-relaxed pl-6">
                                Redirigiendo al inicio de sesión…
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>

                            <div className="flex flex-col gap-1.5">
                                <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                                    Nombre completo
                                </label>
                                <input
                                    type="text"
                                    autoComplete="name"
                                    placeholder="Juan Pérez"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    disabled={loading}
                                    className={INPUT_CLS}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
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
                                <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                                    Contraseña
                                </label>
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="••••••••"
                                    value={pass}
                                    onChange={(e) => setPass(e.target.value)}
                                    disabled={loading}
                                    className={INPUT_CLS}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                                    Confirmar contraseña
                                </label>
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="••••••••"
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    disabled={loading}
                                    className={INPUT_CLS}
                                />
                            </div>

                            <label className="flex items-start gap-3 cursor-pointer mt-1">
                                <div className="relative mt-0.5 flex-shrink-0">
                                    <input
                                        type="checkbox"
                                        className="peer sr-only"
                                        checked={terms}
                                        onChange={(e) => setTerms(e.target.checked)}
                                        disabled={loading}
                                    />
                                    <div className={[
                                        "w-4 h-4 rounded border border-white/20 bg-white/[0.04]",
                                        "peer-checked:bg-indigo-500 peer-checked:border-indigo-500",
                                        "transition-colors duration-150",
                                    ].join(" ")} />
                                </div>
                                <span className="font-mono text-[10px] text-white/30 leading-relaxed">
                                    Acepto los{" "}
                                    <Link href="/terms" className="text-indigo-400/70 hover:text-indigo-400 underline underline-offset-2">
                                        términos de uso
                                    </Link>{" "}
                                    y la{" "}
                                    <Link href="/privacy" className="text-indigo-400/70 hover:text-indigo-400 underline underline-offset-2">
                                        política de privacidad
                                    </Link>.
                                </span>
                            </label>

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
                                    "bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600",
                                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-500",
                                    "font-mono text-[11px] uppercase tracking-[0.18em] text-white",
                                    "transition-colors duration-150",
                                    "flex items-center justify-center gap-2",
                                ].join(" ")}
                            >
                                {loading ? (
                                    <><Spinner /> Creando cuenta…</>
                                ) : (
                                    <>
                                        Crear cuenta
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M2 6h8M6 2l4 4-4 4" />
                                        </svg>
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    <p className="font-mono text-[10px] text-center text-white/30 mt-6">
                        ¿Ya tienes cuenta?{" "}
                        <Link
                            href="/sign-in"
                            className="text-indigo-400/80 hover:text-indigo-400 transition-colors underline underline-offset-2"
                        >
                            Inicia sesión
                        </Link>
                    </p>
                </div>

                {/* ── RIGHT: Feature list ───────────────────────────────── */}
                <div className="hidden md:flex flex-col justify-center">
                    <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-white/20 mb-6">
                        Incluido en tu cuenta
                    </p>
                    <div className="border border-white/[0.07] rounded-xl overflow-hidden">
                        {PERKS.map((p, i) => (
                            <div
                                key={p.code}
                                className={[
                                    "flex items-center gap-4 px-5 py-4",
                                    "hover:bg-white/[0.02] transition-colors duration-150",
                                    i < PERKS.length - 1 ? "border-b border-white/[0.06]" : "",
                                ].join(" ")}
                            >
                                <span className="font-mono text-[9px] text-indigo-500/50 tracking-widest w-4 flex-shrink-0">
                                    {p.code}
                                </span>
                                <div className="w-4 h-4 rounded-full border border-indigo-500/30 bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                                    <svg width="7" height="7" viewBox="0 0 7 7" fill="none"
                                        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                                        className="text-indigo-400">
                                        <path d="M1 3.5l1.8 1.8L6 1.5" />
                                    </svg>
                                </div>
                                <span className="font-mono text-[11px] text-white/50">{p.text}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 px-5 py-4 border border-indigo-500/10 rounded-xl bg-indigo-500/[0.03]">
                        <p className="font-mono text-[10px] text-indigo-400/50 leading-relaxed">
                            Sin límite de empleados.<br />
                            Sin costo por período de nómina.
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}

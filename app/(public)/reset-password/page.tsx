"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import { Loader2, CheckCircle2, XCircle, ArrowRight, LockKeyhole } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { notify } from "@/src/shared/frontend/notify";
import { AuthShell, AuthHeader, AuthVisual, PasswordField } from "../_components/auth-shell";

type Stage = "loading" | "ready" | "success" | "invalid";

type PwRule = { id: string; label: string; test: (p: string) => boolean };
const PW_RULES: PwRule[] = [
    { id: "len",   label: "8+ caracteres", test: p => p.length >= 8 },
    { id: "lower", label: "Minúscula",     test: p => /[a-z]/.test(p) },
    { id: "upper", label: "Mayúscula",     test: p => /[A-Z]/.test(p) },
    { id: "num",   label: "Número",        test: p => /[0-9]/.test(p) },
];

export default function ResetPasswordPage() {
    const router = useRouter();
    const [stage,    setStage]    = useState<Stage>("loading");
    const [password, setPassword] = useState("");
    const [confirm,  setConfirm]  = useState("");
    const [loading,  setLoading]  = useState(false);

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

        if (!password)            { notify.error("La contraseña es requerida."); return; }
        if (password.length < 8)  { notify.error("Mínimo 8 caracteres."); return; }
        if (password !== confirm) { notify.error("Las contraseñas no coinciden."); return; }

        setLoading(true);
        const supabase = getSupabaseBrowser();
        const { error: updateError } = await supabase.auth.updateUser({ password });
        setLoading(false);

        if (updateError) { notify.error(updateError.message); return; }

        await supabase.auth.signOut();
        setStage("success");
        setTimeout(() => router.replace("/sign-in"), 3000);
    }

    const visual = (
        <AuthVisual
            heading={<>Refresca tu clave,<br /><span className="text-white/70">mantén tu control.</span></>}
            copy="Una nueva contraseña protege tus empresas, tu kardex y tus recibos de nómina."
        />
    );

    return (
        <AuthShell visual={visual}>
            <AuthHeader
                icon={<LockKeyhole className="w-5 h-5 text-white" />}
                title="Nueva contraseña"
                subtitle="Configura una contraseña nueva para retomar el acceso al sistema."
            />

            {stage === "loading" && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-tertiary">
                    <Loader2 className="w-7 h-7 animate-spin text-primary-500" />
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]">Validando sesión…</span>
                </div>
            )}

            {stage === "invalid" && (
                <div className="space-y-5">
                    <div className="p-6 border border-red-500/30 rounded-2xl bg-red-500/[0.07] flex flex-col items-center gap-4 text-center">
                        <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
                        <p className="font-sans text-[14px] text-red-700 dark:text-red-300 leading-relaxed">
                            El enlace caducó o es inválido. Por seguridad, debes solicitar uno nuevo.
                        </p>
                    </div>
                    <BaseButton.Root
                        as={Link}
                        href="/forgot-password"
                        variant="secondary"
                        className="w-full h-11 rounded-xl"
                    >
                        Solicitar nuevo enlace
                        <ArrowRight className="w-4 h-4" />
                    </BaseButton.Root>
                </div>
            )}

            {stage === "ready" && (
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <PasswordField
                        label="Contraseña nueva"
                        placeholder="Mínimo 8 caracteres"
                        value={password}
                        onValueChange={setPassword}
                        isDisabled={loading}
                        autoComplete="new-password"
                    />

                    <PasswordField
                        label="Confirmar"
                        placeholder="Repite la contraseña"
                        value={confirm}
                        onValueChange={setConfirm}
                        isDisabled={loading}
                        autoComplete="new-password"
                    />

                    {password.length > 0 && (
                        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-1 pt-1">
                            {PW_RULES.map(rule => {
                                const ok = rule.test(password);
                                return (
                                    <li
                                        key={rule.id}
                                        className={`flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-text-disabled"}`}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-border-default"}`} />
                                        {rule.label}
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <BaseButton.Root
                        type="submit"
                        disabled={loading}
                        variant="primary"
                        className="w-full h-11 mt-1 rounded-xl shadow-sm"
                    >
                        {loading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Actualizando…</>
                            : "Actualizar contraseña"}
                    </BaseButton.Root>
                </form>
            )}

            {stage === "success" && (
                <div className="space-y-6">
                    <div className="p-8 border border-emerald-500/30 rounded-2xl bg-emerald-500/[0.08] space-y-4 text-center">
                        <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <h3 className="font-sans font-bold text-emerald-700 dark:text-emerald-400 text-[18px]">
                            Contraseña actualizada
                        </h3>
                        <p className="font-sans text-[13px] text-text-tertiary leading-relaxed">
                            Tu acceso fue restablecido. Serás redirigido al inicio en unos segundos.
                        </p>
                    </div>
                </div>
            )}
        </AuthShell>
    );
}

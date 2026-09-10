"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { notify } from "@/src/shared/frontend/notify";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";

const OTP_LENGTH = 8;

type Stage = "email" | "code" | "password" | "success";

const Spinner = () => (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

/**
 * Renders the administrator password-recovery flow using Supabase recovery OTPs.
 *
 * @returns The administrator recovery page.
 */
export default function AdminForgotPasswordPage() {
    const router = useRouter();
    const [stage, setStage] = useState<Stage>("email");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [signOutFailed, setSignOutFailed] = useState(false);

    const normalizedEmail = email.trim().toLowerCase();
    const isValidEmail = /^\S+@\S+\.\S+$/.test(normalizedEmail);

    /** Sends a new recovery OTP to the email address entered by the administrator. */
    async function sendRecoveryCode(): Promise<boolean> {
        try {
            const response = await fetch("/api/admin/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: normalizedEmail }),
            });

            if (!response.ok) {
                notify.error("No pudimos enviar el código. Inténtalo de nuevo.");
                return false;
            }
            return true;
        } catch {
            notify.error("No pudimos enviar el código. Revisa tu conexión e inténtalo de nuevo.");
            return false;
        }
    }

    /** Validates the email address and requests a recovery OTP. */
    async function handleSendEmail(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!isValidEmail) {
            notify.error("Ingresa un correo electrónico válido.");
            return;
        }

        setLoading(true);
        try {
            if (await sendRecoveryCode()) {
                setCode("");
                setStage("code");
            }
        } finally {
            setLoading(false);
        }
    }

    /** Opens OTP entry for an administrator who has already received a code. */
    function handleUseExistingCode() {
        if (!isValidEmail) {
            notify.error("Ingresa un correo electrónico válido.");
            return;
        }
        setCode("");
        setStage("code");
    }

    /** Verifies the recovery OTP and establishes the temporary recovery session. */
    async function handleVerifyCode(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const token = code.replace(/\D/g, "");
        if (token.length !== OTP_LENGTH) {
            notify.error(`El código debe tener ${OTP_LENGTH} dígitos.`);
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await getSupabaseBrowser().auth.verifyOtp({
                email: normalizedEmail,
                token,
                type: "recovery",
            });
            if (error || !data.session) {
                notify.error("Código inválido o vencido. Solicita uno nuevo.");
                return;
            }

            setPassword("");
            setConfirm("");
            setStage("password");
        } catch {
            notify.error("No pudimos verificar el código. Inténtalo de nuevo.");
        } finally {
            setLoading(false);
        }
    }

    /** Requests a replacement OTP for the email currently being recovered. */
    async function handleResendCode() {
        if (loading) return;
        setLoading(true);
        try {
            if (await sendRecoveryCode()) {
                setCode("");
                notify.success("Código reenviado.");
            }
        } finally {
            setLoading(false);
        }
    }

    /** Clears browser and administrator routing sessions after a completed recovery. */
    async function clearSessions(): Promise<boolean> {
        const { error } = await getSupabaseBrowser().auth.signOut();
        const response = await fetch("/api/admin/sign-out", { method: "POST" });
        return !error && response.ok;
    }

    /** Updates the verified user's password and then ends the temporary recovery session. */
    async function handleUpdatePassword(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (password.length < 8) {
            notify.error("La contraseña debe tener al menos 8 caracteres.");
            return;
        }
        if (password !== confirm) {
            notify.error("Las contraseñas no coinciden.");
            return;
        }

        setLoading(true);
        try {
            const { error } = await getSupabaseBrowser().auth.updateUser({ password });
            if (error) {
                notify.error("No pudimos actualizar la contraseña. Revisa los datos e inténtalo de nuevo.");
                setLoading(false);
                return;
            }
        } catch {
            notify.error("No pudimos actualizar la contraseña. Inténtalo de nuevo.");
            setLoading(false);
            return;
        }

        setPassword("");
        setConfirm("");
        setStage("success");

        try {
            const cleanupFailed = !(await clearSessions());
            setSignOutFailed(cleanupFailed);
            if (!cleanupFailed) window.setTimeout(() => router.replace("/admin/sign-in"), 2500);
        } catch {
            setSignOutFailed(true);
        } finally {
            setLoading(false);
        }
    }

    /** Retries ending the browser and administrator sessions after a successful password update. */
    async function handleRetrySignOut() {
        setLoading(true);
        try {
            if (await clearSessions()) {
                setSignOutFailed(false);
                router.replace("/admin/sign-in");
            } else {
                notify.error("No pudimos cerrar la sesión. Inténtalo de nuevo.");
            }
        } catch {
            notify.error("No pudimos cerrar la sesión. Inténtalo de nuevo.");
        } finally {
            setLoading(false);
        }
    }

    const buttonClassName = [
        "w-full h-10 mt-2 rounded-lg",
        "bg-red-600 hover:bg-red-500 active:bg-red-700",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "font-mono text-[11px] uppercase tracking-[0.18em] text-white",
        "transition-colors duration-150 flex items-center justify-center gap-2",
    ].join(" ");

    return (
        <div className="min-h-screen flex items-center justify-center px-8 bg-surface-2">
            <div className="w-full max-w-sm">
                <div className="flex flex-col gap-1 mb-10">
                    <div className="flex items-end leading-none gap-0" aria-label="Kontave">
                        <span className="font-sans font-black text-[20px] leading-none tracking-[-0.03em] text-foreground">Kontave</span>
                        <span className="font-black text-[20px] leading-none" style={{ color: "#FF4A18" }}>.</span>
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-500/70">Administración</span>
                </div>

                {stage === "email" && (
                    <EmailStage email={email} loading={loading} onEmailChange={setEmail} onSubmit={handleSendEmail} onUseExistingCode={handleUseExistingCode} buttonClassName={buttonClassName} />
                )}
                {stage === "code" && (
                    <CodeStage email={normalizedEmail} code={code} loading={loading} onCodeChange={setCode} onSubmit={handleVerifyCode} onChangeEmail={() => { setCode(""); setStage("email"); }} onResend={handleResendCode} buttonClassName={buttonClassName} />
                )}
                {stage === "password" && (
                    <PasswordStage password={password} confirm={confirm} loading={loading} onPasswordChange={setPassword} onConfirmChange={setConfirm} onSubmit={handleUpdatePassword} onReturnToCode={() => { setPassword(""); setConfirm(""); setCode(""); setStage("code"); }} buttonClassName={buttonClassName} />
                )}
                {stage === "success" && (
                    <SuccessStage loading={loading} signOutFailed={signOutFailed} onRetrySignOut={handleRetrySignOut} />
                )}
            </div>
        </div>
    );
}

type StageButtonProps = { buttonClassName: string; loading: boolean };

/** Displays the initial email collection stage. */
function EmailStage({ email, loading, onEmailChange, onSubmit, onUseExistingCode, buttonClassName }: StageButtonProps & { email: string; onEmailChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onUseExistingCode: () => void }) {
    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <h1 className="font-mono text-[26px] font-black uppercase tracking-tighter text-foreground leading-none">Recuperar<br />contraseña</h1>
                <p className="font-mono text-[11px] text-[var(--text-tertiary)] leading-relaxed">Ingresa tu correo y te enviaremos un código de {OTP_LENGTH} dígitos.</p>
            </div>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <BaseInput.Field label="Correo electrónico" type="email" autoComplete="email" autoFocus placeholder="admin@empresa.com" value={email} onValueChange={onEmailChange} isDisabled={loading} />
                <button type="submit" disabled={loading} className={buttonClassName}>{loading ? <><Spinner /> Enviando…</> : "Enviar código"}</button>
            </form>
            <button type="button" onClick={onUseExistingCode} disabled={loading} className="w-full font-mono text-[11px] text-red-500 hover:text-red-400 disabled:opacity-50 transition-colors">Ya tengo un código</button>
            <BackToSignIn />
        </div>
    );
}

/** Displays the eight-digit OTP verification stage. */
function CodeStage({ email, code, loading, onCodeChange, onSubmit, onChangeEmail, onResend, buttonClassName }: StageButtonProps & { email: string; code: string; onCodeChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onChangeEmail: () => void; onResend: () => void }) {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h1 className="font-mono text-[26px] font-black uppercase tracking-tighter text-foreground leading-none">Verifica tu<br />correo</h1>
                <p className="font-mono text-[11px] text-[var(--text-tertiary)] leading-relaxed">Ingresa el código de {OTP_LENGTH} dígitos enviado a <span className="text-[var(--text-secondary)] break-all">{email}</span>.</p>
            </div>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <BaseInput.Field label={`Código de ${OTP_LENGTH} dígitos`} type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder={"0".repeat(OTP_LENGTH)} maxLength={OTP_LENGTH} value={code} onValueChange={(value) => onCodeChange(value.replace(/\D/g, "").slice(0, OTP_LENGTH))} isDisabled={loading} inputClassName="text-center text-[18px] font-bold tracking-[0.32em] tabular-nums" />
                <button type="submit" disabled={loading || code.length !== OTP_LENGTH} className={buttonClassName}>{loading ? <><Spinner /> Verificando…</> : "Verificar código"}</button>
            </form>
            <div className="flex items-center justify-between gap-4">
                <button type="button" onClick={onChangeEmail} disabled={loading} className="font-mono text-[11px] text-[var(--text-tertiary)] hover:text-foreground disabled:opacity-50 transition-colors">Cambiar correo</button>
                <button type="button" onClick={onResend} disabled={loading} className="font-mono text-[11px] text-red-500 hover:text-red-400 disabled:opacity-50 transition-colors">Reenviar código</button>
            </div>
        </div>
    );
}

/** Displays password inputs after the recovery OTP has been verified. */
function PasswordStage({ password, confirm, loading, onPasswordChange, onConfirmChange, onSubmit, onReturnToCode, buttonClassName }: StageButtonProps & { password: string; confirm: string; onPasswordChange: (value: string) => void; onConfirmChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onReturnToCode: () => void }) {
    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <h1 className="font-mono text-[26px] font-black uppercase tracking-tighter text-foreground leading-none">Nueva<br />contraseña</h1>
                <p className="font-mono text-[11px] text-[var(--text-tertiary)] leading-relaxed">Elige una contraseña de al menos 8 caracteres.</p>
            </div>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <BaseInput.Field label="Nueva contraseña" type="password" autoFocus autoComplete="new-password" placeholder="Mín. 8 caracteres" value={password} onValueChange={onPasswordChange} isDisabled={loading} />
                <BaseInput.Field label="Confirmar contraseña" type="password" autoComplete="new-password" placeholder="Repite la contraseña" value={confirm} onValueChange={onConfirmChange} isDisabled={loading} />
                <button type="submit" disabled={loading} className={buttonClassName}>{loading ? <><Spinner /> Guardando…</> : "Guardar contraseña"}</button>
            </form>
            <button type="button" onClick={onReturnToCode} disabled={loading} className="font-mono text-[11px] text-[var(--text-tertiary)] hover:text-foreground disabled:opacity-50 transition-colors">Volver a verificar el código</button>
        </div>
    );
}

/** Confirms the password update and offers session cleanup retry when necessary. */
function SuccessStage({ loading, signOutFailed, onRetrySignOut }: { loading: boolean; signOutFailed: boolean; onRetrySignOut: () => void }) {
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <h1 className="font-mono text-[26px] font-black uppercase tracking-tighter text-foreground leading-none">Contraseña<br />actualizada</h1>
                <p className="font-mono text-[11px] text-[var(--text-tertiary)] leading-relaxed">{signOutFailed ? "Tu contraseña se actualizó. Cierra la sesión para completar el proceso." : "Tu contraseña se cambió correctamente. Redirigiendo…"}</p>
            </div>
            {signOutFailed ? (
                <button type="button" onClick={onRetrySignOut} disabled={loading} className="font-mono text-[11px] text-red-500 hover:text-red-400 disabled:opacity-50 transition-colors">{loading ? "Cerrando sesión…" : "Reintentar cierre de sesión"}</button>
            ) : (
                <Link href="/admin/sign-in" className="font-mono text-[11px] text-red-500 hover:text-red-400 transition-colors">Ir al inicio de sesión ahora →</Link>
            )}
        </div>
    );
}

/** Renders the shared return link for the administrator authentication screens. */
function BackToSignIn() {
    return (
        <Link href="/admin/sign-in" className="font-mono text-[11px] text-[var(--text-tertiary)] hover:text-foreground transition-colors flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 6H2M6 2L2 6l4 4" />
            </svg>
            Volver al inicio de sesión
        </Link>
    );
}

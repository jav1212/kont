import { useState, type FormEvent } from "react";
import { errorFeedback, successFeedback } from "@kontave/client-feedback-application";
import { Button, Card, presentFeedback, TextField } from "@kontave/ui-dom";
import type { DesktopAuthState } from "../../../shared/desktop-api";
import { PasswordRequirements } from "./password-requirements";
import { AuthHeading } from "./sign-in-form";

type RegistrationStage = "credentials" | "verification";

export function RegistrationForm({ onAuthenticated, onBack }: {
  readonly onAuthenticated: (state: DesktopAuthState) => void;
  readonly onBack: () => void;
}) {
  const [stage, setStage] = useState<RegistrationStage>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function register(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (password !== confirmation) {
      presentFeedback.execute(errorFeedback("Las contraseñas no coinciden.", { deduplicationKey: "auth-password-mismatch" }));
      return;
    }
    setLoading(true);
    try {
      const result = await window.kontave.auth.register({ email, password });
      if (result.ok) {
        setEmail(result.value.email);
        setPassword("");
        setConfirmation("");
        setStage("verification");
      } else presentFeedback.execute(errorFeedback(result.error.message, { deduplicationKey: result.error.code }));
    } catch {
      presentFeedback.execute(errorFeedback("No se pudo comunicar con Kontave.", { deduplicationKey: "auth-register-communication" }));
    } finally {
      setLoading(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await window.kontave.auth.verifyRegistration({ email, code });
      if (result.ok) onAuthenticated(result.value);
      else presentFeedback.execute(errorFeedback(result.error.message, { deduplicationKey: result.error.code }));
    } catch {
      presentFeedback.execute(errorFeedback("No se pudo comunicar con Kontave.", { deduplicationKey: "auth-verification-communication" }));
    } finally {
      setLoading(false);
    }
  }

  async function resend(): Promise<void> {
    setLoading(true);
    try {
      const result = await window.kontave.auth.resendRegistration({ email });
      if (result.ok) presentFeedback.execute(successFeedback("Enviamos un código nuevo a tu correo."));
      else presentFeedback.execute(errorFeedback(result.error.message, { deduplicationKey: result.error.code }));
    } catch {
      presentFeedback.execute(errorFeedback("No se pudo comunicar con Kontave.", { deduplicationKey: "auth-resend-communication" }));
    } finally {
      setLoading(false);
    }
  }

  return <Card className="auth-card" aria-labelledby="registration-title">
    {stage === "credentials" ? <>
      <AuthHeading label="Nueva cuenta" title="Crear cuenta" description="Registra tus credenciales. El perfil de usuario se configurará después del acceso." titleId="registration-title" />
      <form className="auth-form" onSubmit={(event) => void register(event)}>
        <TextField label="Correo electrónico" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <div className="auth-password-grid">
          <TextField label="Contraseña" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <TextField label="Confirmar contraseña" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        </div>
        <PasswordRequirements password={password} />
        <Button type="submit" loading={loading}>Crear cuenta</Button>
      </form>
    </> : <>
      <AuthHeading label="Verificación" title="Confirma tu correo" description={`Ingresa el código de 8 dígitos enviado a ${email}.`} titleId="registration-title" />
      <form className="auth-form" onSubmit={(event) => void verify(event)}>
        <TextField label="Código" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required />
        <Button type="submit" loading={loading}>Verificar y continuar</Button>
        <Button appearance="text" size="sm" className="auth-text-action" disabled={loading} onClick={() => void resend()}>Reenviar código</Button>
      </form>
    </>}
    <div className="auth-secondary-action"><Button appearance="text" size="sm" className="auth-text-action" onClick={onBack}>Volver al inicio de sesión</Button></div>
  </Card>;
}

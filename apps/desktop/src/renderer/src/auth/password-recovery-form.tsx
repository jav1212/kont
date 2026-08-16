import { useState, type FormEvent } from "react";
import { errorFeedback } from "@kontave/client-feedback-application";
import { Button, Card, presentFeedback, TextField } from "@kontave/ui-dom";
import { PasswordRequirements } from "./password-requirements";
import { AuthHeading } from "./sign-in-form";

type RecoveryStage = "email" | "verification" | "password" | "success";

export function PasswordRecoveryForm({ onBack }: { readonly onBack: () => void }) {
  const [stage, setStage] = useState<RecoveryStage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);

  async function request(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await perform(async () => {
      const result = await window.kontave.auth.requestPasswordRecovery({ email });
      if (result.ok) { setEmail(result.value.email); setStage("verification"); }
      else presentFeedback.execute(errorFeedback(result.error.message, { deduplicationKey: result.error.code }));
    });
  }

  async function verify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await perform(async () => {
      const result = await window.kontave.auth.verifyPasswordRecovery({ email, code });
      if (result.ok) { setCode(""); setStage("password"); }
      else presentFeedback.execute(errorFeedback(result.error.message, { deduplicationKey: result.error.code }));
    });
  }

  async function complete(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (password !== confirmation) {
      presentFeedback.execute(errorFeedback("Las contraseñas no coinciden.", { deduplicationKey: "auth-password-mismatch" }));
      return;
    }
    await perform(async () => {
      const result = await window.kontave.auth.completePasswordRecovery({ password });
      if (result.ok) { setPassword(""); setConfirmation(""); setStage("success"); }
      else presentFeedback.execute(errorFeedback(result.error.message, { deduplicationKey: result.error.code }));
    });
  }

  async function perform(operation: () => Promise<void>): Promise<void> {
    setLoading(true);
    try { await operation(); }
    catch { presentFeedback.execute(errorFeedback("No se pudo comunicar con Kontave.", { deduplicationKey: "auth-recovery-communication" })); }
    finally { setLoading(false); }
  }

  return <Card className="auth-card" aria-labelledby="recovery-title">
    {stage === "email" ? <>
      <AuthHeading label="Recuperación" title="Recuperar acceso" description="Te enviaremos un código de 8 dígitos para verificar tu identidad." titleId="recovery-title" />
      <form className="auth-form" onSubmit={(event) => void request(event)}>
        <TextField label="Correo electrónico" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <Button type="submit" loading={loading}>Enviar código</Button>
      </form>
    </> : null}
    {stage === "verification" ? <>
      <AuthHeading label="Recuperación" title="Verifica tu correo" description={`Ingresa el código enviado a ${email}.`} titleId="recovery-title" />
      <form className="auth-form" onSubmit={(event) => void verify(event)}>
        <TextField label="Código" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required />
        <Button type="submit" loading={loading}>Verificar código</Button>
      </form>
    </> : null}
    {stage === "password" ? <>
      <AuthHeading label="Recuperación" title="Nueva contraseña" description="La nueva contraseña cerrará la sesión temporal de recuperación." titleId="recovery-title" />
      <form className="auth-form" onSubmit={(event) => void complete(event)}>
        <div className="auth-password-grid">
          <TextField label="Nueva contraseña" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <TextField label="Confirmar contraseña" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        </div>
        <PasswordRequirements password={password} />
        <Button type="submit" loading={loading}>Actualizar contraseña</Button>
      </form>
    </> : null}
    {stage === "success" ? <div className="auth-success">
      <AuthHeading label="Acceso restaurado" title="Contraseña actualizada" description="Ya puedes iniciar sesión con tu nueva contraseña." titleId="recovery-title" />
      <Button onClick={onBack}>Volver al inicio de sesión</Button>
    </div> : null}
    {stage !== "success" ? <div className="auth-secondary-action"><Button appearance="text" size="sm" className="auth-text-action" onClick={onBack}>Volver al inicio de sesión</Button></div> : null}
  </Card>;
}

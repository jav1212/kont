import { useState, type FormEvent, type ReactNode } from "react";
import { errorFeedback } from "@kontave/client-feedback-application";
import { Button, Card, LogoFull, presentFeedback, Text, TextField } from "@kontave/ui-dom";
import { Eye, EyeOff } from "lucide-react";
import type { DesktopAuthState } from "../../../shared/desktop-api.js";

export function SignInForm({ onAuthenticated, onCreateAccount, onForgotPassword }: {
  readonly onAuthenticated: (state: DesktopAuthState) => void;
  readonly onCreateAccount: () => void;
  readonly onForgotPassword: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await window.kontave.auth.signIn({ email, password });
      if (result.ok) onAuthenticated(result.value);
      else presentFeedback.execute(errorFeedback(result.error.message, { deduplicationKey: result.error.code }));
    } catch {
      presentFeedback.execute(errorFeedback("No se pudo comunicar con Kontave.", { deduplicationKey: "auth-sign-in-communication" }));
    } finally {
      setLoading(false);
    }
  }

  return <Card className="auth-card" aria-labelledby="sign-in-title">
    <AuthHeading label={<LogoFull size={20} />} title="Bienvenido de nuevo" description="Ingresa a tu cuenta para continuar con tu operación." titleId="sign-in-title" />
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <TextField label="Correo electrónico" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <TextField
        label="Contraseña"
        type={passwordVisible ? "text" : "password"}
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        labelAction={<Button appearance="text" size="sm" className="auth-text-action" onClick={onForgotPassword}>¿Olvidaste tu contraseña?</Button>}
        endAdornment={<Button
          appearance="text"
          size="sm"
          className="auth-password-visibility"
          aria-label={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={passwordVisible}
          onClick={() => setPasswordVisible((visible) => !visible)}
        >{passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>}
        required
      />
      <Button type="submit" loading={loading}>Continuar</Button>
    </form>
    <div className="auth-secondary-action">
      <Text tone="subtle">¿Aún no tienes cuenta?</Text>
      <Button appearance="text" size="sm" className="auth-text-action" onClick={onCreateAccount}>Crear cuenta</Button>
    </div>
  </Card>;
}

export function AuthHeading({ description, label, title, titleId }: {
  readonly description: string;
  readonly label: ReactNode;
  readonly title: string;
  readonly titleId: string;
}) {
  return <div className="auth-heading">
    {typeof label === "string" ? <Text className="desktop-label" tone="subtle">{label}</Text> : <div className="desktop-label">{label}</div>}
    <h2 id={titleId}>{title}</h2>
    <p>{description}</p>
  </div>;
}

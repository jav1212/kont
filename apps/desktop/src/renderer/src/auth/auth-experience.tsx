import { useState } from "react";
import { Card, LogoFull, PageShell, Text } from "@kontave/ui-dom";
import type { DesktopAuthState } from "../../../shared/desktop-api.js";
import { PasswordRecoveryForm } from "./password-recovery-form.js";
import { RegistrationForm } from "./registration-form.js";
import { SignInForm } from "./sign-in-form.js";

type AuthScreen = "sign-in" | "registration" | "recovery";

export function AuthExperience({ onAuthenticated, state }: {
  readonly onAuthenticated: (state: DesktopAuthState) => void;
  readonly state: DesktopAuthState;
}) {
  const [screen, setScreen] = useState<AuthScreen>("sign-in");

  return <PageShell className="auth-page">
    <section className="auth-layout" aria-label="Acceso a Kontave">
      <aside className="auth-visual" aria-label="Kontave">
        <div className="auth-visual__glow auth-visual__glow--one" />
        <div className="auth-visual__glow auth-visual__glow--two" />
        <div className="auth-visual__glow auth-visual__glow--three" />
        <div className="auth-visual__content">
          <header className="auth-visual__brand">
            <LogoFull size={32} />
          </header>
          <div className="auth-visual__message">
            <Text className="auth-visual__eyebrow" tone="inherit">Gestión empresarial venezolana</Text>
            <h1>Todo tu negocio,<br />en un solo lugar.</h1>
            <p>Nómina, inventario y operaciones conectadas en una experiencia diseñada para trabajar con claridad.</p>
          </div>
          <footer className="auth-visual__footer">
            <Text tone="inherit">Preparado para tu operación</Text>
            <div className="auth-visual__capabilities" aria-label="Capacidades de Kontave">
              <Text as="strong" tone="inherit">LOTTT</Text>
              <Text as="strong" tone="inherit">SENIAT</Text>
              <Text as="strong" tone="inherit">BCV</Text>
            </div>
          </footer>
        </div>
      </aside>

      <div className="auth-form-panel">
        <div className="auth-form-panel__content">
          {state.status === "loading" ? <Card className="auth-card auth-loading">Restaurando sesión segura…</Card> : null}
          {state.status === "anonymous" && screen === "sign-in" ? <SignInForm
            onAuthenticated={onAuthenticated}
            onCreateAccount={() => setScreen("registration")}
            onForgotPassword={() => setScreen("recovery")}
          /> : null}
          {state.status === "anonymous" && screen === "registration" ? <RegistrationForm
            onAuthenticated={onAuthenticated}
            onBack={() => setScreen("sign-in")}
          /> : null}
          {state.status === "anonymous" && screen === "recovery" ? <PasswordRecoveryForm
            onBack={() => setScreen("sign-in")}
          /> : null}
        </div>
      </div>
    </section>
  </PageShell>;
}

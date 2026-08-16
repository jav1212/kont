import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Building2, CreditCard, Laptop, MonitorCog, Palette, ShieldCheck, Smartphone,
  UserRound, UsersRound,
} from "lucide-react";
import type { KontaveTheme } from "@kontave/design-tokens";
import { errorFeedback, successFeedback } from "@kontave/client-feedback-application";
import { Button, FieldSkeleton, Skeleton, SubscriptionPlanBadge } from "@kontave/ui-dom";
import { presentFeedback } from "@kontave/ui-dom";
import type {
  DesktopAuthState, DesktopBillingPlanState, DesktopCurrentUserState, DesktopSettingsSnapshot,
  DesktopWorkspaceState,
} from "../../shared/desktop-api";
import { runSettingsMutation } from "./client-interaction";

export type DesktopSettingsDestination =
  | "settings.profile" | "settings.appearance" | "settings.security"
  | "settings.organization" | "settings.members" | "settings.roles"
  | "settings.billing" | "settings.devices";

export interface DesktopSettingsDetailViewProps {
  readonly auth: Extract<DesktopAuthState, { status: "authenticated" }>;
  readonly billing: DesktopBillingPlanState;
  readonly currentUser: DesktopCurrentUserState;
  readonly destination: DesktopSettingsDestination;
  readonly deviceContent: ReactNode;
  readonly onThemeChange: (theme: KontaveTheme) => void;
  readonly theme: KontaveTheme;
  readonly workspace: DesktopWorkspaceState;
}

export function DesktopSettingsDetailView(props: DesktopSettingsDetailViewProps) {
  const context = props.workspace.status === "ready" ? props.workspace : null;
  const [snapshot, setSnapshot] = useState<DesktopSettingsSnapshot>();
  const [loading, setLoading] = useState(true);

  async function load(): Promise<void> {
    const result = await window.kontave.settings.getSnapshot(
      context?.activeWorkspaceId ?? null,
      context?.activeCompanyId ?? null,
    );
    if (result.ok) setSnapshot(result.value); else presentSettingsFailure(result.error);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    void window.kontave.settings.getSnapshot(
      context?.activeWorkspaceId ?? null,
      context?.activeCompanyId ?? null,
    ).then((result) => {
      if (!active) return;
      if (result.ok) setSnapshot(result.value); else presentSettingsFailure(result.error);
      setLoading(false);
    });
    return () => { active = false; };
  }, [context?.activeWorkspaceId, context?.activeCompanyId]);
  const definition = detailDefinition(props.destination);
  return <section className="desktop-settings-detail" aria-labelledby="desktop-settings-detail-title">
    <header className="desktop-settings-detail__heading">
      <span className="desktop-settings-detail__icon" aria-hidden="true">{definition.icon}</span>
      <div><h2 id="desktop-settings-detail-title">{definition.title}</h2><p>{definition.description}</p></div>
    </header>
    {loading && !snapshot ? <SettingsDetailSkeleton destination={props.destination} /> : renderDetail(props, snapshot, load)}
  </section>;
}

function renderDetail(props: DesktopSettingsDetailViewProps, snapshot: DesktopSettingsSnapshot | undefined, refresh: () => Promise<void>): ReactNode {
  if (props.destination === "settings.appearance") return <AppearanceSettings key={snapshot?.preferences.version ?? "loading"} snapshot={snapshot} theme={props.theme} onThemeChange={props.onThemeChange} onSaved={refresh} />;
  if (props.destination === "settings.devices") return <SettingsPanel title="Conexión local" description="Dispositivos administrados por esta instalación de Kontave.">{props.deviceContent}</SettingsPanel>;
  if (props.destination === "settings.profile") return <ProfileSettings key={snapshot?.profile.version ?? "loading"} snapshot={snapshot} fallbackEmail={props.auth.user.email} onSaved={refresh} />;
  if (props.destination === "settings.security") return <SecuritySettings snapshot={snapshot} onSaved={refresh} />;
  if (props.destination === "settings.organization") return <OrganizationSettings key={snapshot?.organization?.version ?? "loading"} snapshot={snapshot} onSaved={refresh} />;
  if (props.destination === "settings.members") return <MembersSettings snapshot={snapshot} />;
  if (props.destination === "settings.roles") return <RolesSettings snapshot={snapshot} />;
  return <BillingSettings snapshot={snapshot} fallback={props.billing} />;
}

function ProfileSettings({ fallbackEmail, onSaved, snapshot }: { fallbackEmail: string | null; onSaved: () => Promise<void>; snapshot: DesktopSettingsSnapshot | undefined }) {
  const [name, setName] = useState(snapshot?.profile.displayName ?? "");
  return <SettingsPanel title="Identidad" description="Información personal asociada a tu cuenta.">
    <SettingsForm onSubmit={async () => {
      if (!snapshot) { presentFeedback.execute(errorFeedback("La información del perfil aún no está disponible.")); return; }
      const result = await runSettingsMutation("Guardando perfil", () => window.kontave.settings.updateProfile({ displayName: name.trim(), expectedVersion: snapshot.profile.version }));
      if (result.ok) { presentFeedback.execute(successFeedback("Perfil actualizado.")); await onSaved(); }
      else presentSettingsFailure(result.error);
    }}>
      <Field label="Nombre"><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></Field>
      <Field label="Correo"><input value={snapshot?.profile.email ?? fallbackEmail ?? ""} disabled /></Field>
    </SettingsForm>
  </SettingsPanel>;
}

function AppearanceSettings({ onSaved, onThemeChange, snapshot, theme }: { snapshot: DesktopSettingsSnapshot | undefined; theme: KontaveTheme; onThemeChange: (theme: KontaveTheme) => void; onSaved: () => Promise<void> }) {
  const [density, setDensity] = useState<"comfortable" | "compact">(snapshot?.preferences.appearance.density ?? "comfortable");
  async function chooseTheme(value: KontaveTheme) {
    onThemeChange(value);
    if (!snapshot) return;
    const result = await runSettingsMutation("Guardando apariencia", () => window.kontave.settings.updatePreferences({ expectedVersion: snapshot.preferences.version, appearance: { colorScheme: value } }));
    if (result.ok) await onSaved(); else presentSettingsFailure(result.error);
  }
  return <SettingsPanel title="Interfaz" description="Preferencias sincronizadas con tu cuenta de Kontave.">
    <div className="desktop-settings-choice" role="group" aria-label="Tema de la interfaz">
      <button data-selected={theme === "light"} type="button" onClick={() => void chooseTheme("light")}><span>Claro</span><small>Superficies luminosas y neutrales.</small></button>
      <button data-selected={theme === "dark"} type="button" onClick={() => void chooseTheme("dark")}><span>Oscuro</span><small>Menor luminosidad para trabajar de noche.</small></button>
    </div>
    <div className="desktop-settings-inline-control"><div><strong>Densidad</strong><small>Controla el espacio entre controles y filas.</small></div><select value={density} onChange={async (event) => {
      const value = event.target.value as "comfortable" | "compact"; setDensity(value);
      if (!snapshot) return;
      const result = await runSettingsMutation("Guardando densidad", () => window.kontave.settings.updatePreferences({ expectedVersion: snapshot.preferences.version, appearance: { density: value } }));
      if (result.ok) await onSaved(); else presentSettingsFailure(result.error);
    }}><option value="comfortable">Cómoda</option><option value="compact">Compacta</option></select></div>
  </SettingsPanel>;
}

function OrganizationSettings({ onSaved, snapshot }: { snapshot: DesktopSettingsSnapshot | undefined; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(snapshot?.organization?.name ?? "");
  return <SettingsPanel title="Organización activa" description="Nombre y contexto utilizado por permisos, módulos y facturación.">
    <SettingsForm onSubmit={async () => {
      if (!snapshot?.organization) { presentFeedback.execute(errorFeedback("La organización aún no está disponible.")); return; }
      const result = await runSettingsMutation("Guardando organización", () => window.kontave.settings.updateOrganization(snapshot.organization!.id, { name: name.trim(), expectedVersion: snapshot.organization!.version }));
      if (result.ok) { presentFeedback.execute(successFeedback("Organización actualizada.")); await onSaved(); }
      else presentSettingsFailure(result.error);
    }}><Field label="Nombre"><input value={name} onChange={(event) => setName(event.target.value)} /></Field><SettingsFacts entries={[["Identificador", snapshot?.organization?.slug ?? "—"], ["Rol", snapshot?.organization?.role ?? "—"]]} /></SettingsForm>
  </SettingsPanel>;
}

function SecuritySettings({ onSaved, snapshot }: { snapshot: DesktopSettingsSnapshot | undefined; onSaved: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  return <>
    <SettingsPanel title="Contraseña" description="Usa una contraseña nueva que cumpla la política de seguridad.">
      <SettingsForm submitLabel="Cambiar contraseña" onSubmit={async () => {
        const result = await runSettingsMutation("Actualizando contraseña", () => window.kontave.settings.changePassword(password, true));
        if (result.ok) { setPassword(""); presentFeedback.execute(successFeedback("Contraseña actualizada y otras sesiones cerradas.")); await onSaved(); }
        else presentSettingsFailure(result.error);
      }}><Field label="Nueva contraseña"><input type="password" value={password} minLength={8} required autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} /></Field></SettingsForm>
    </SettingsPanel>
    <SettingsPanel title="Sesiones" description="Equipos que tienen acceso a tu cuenta." action={<Button size="sm" onClick={async () => { const result = await runSettingsMutation("Cerrando sesiones", () => window.kontave.settings.revokeOtherSessions()); if (result.ok) await onSaved(); else presentSettingsFailure(result.error); }}>Cerrar las demás</Button>}>
      <div className="desktop-settings-collection">{snapshot?.sessions.map((session) => <article key={session.id}><span className="desktop-settings-collection__icon">{session.client === "mobile" ? <Smartphone /> : <Laptop />}</span><div><strong>{session.deviceName ?? clientLabel(session.client)}</strong><small>{session.operatingSystem ?? "Sistema no identificado"} · {session.current ? "Sesión actual" : `Último acceso ${formatDate(session.lastSeenAt)}`}</small></div>{!session.current ? <Button size="sm" appearance="unstyled" onClick={async () => { const result = await runSettingsMutation("Revocando sesión", () => window.kontave.settings.revokeSession(session.id)); if (result.ok) await onSaved(); else presentSettingsFailure(result.error); }}>Revocar</Button> : null}</article>)}</div>
    </SettingsPanel>
  </>;
}

function MembersSettings({ snapshot }: { snapshot: DesktopSettingsSnapshot | undefined }) {
  return <SettingsPanel title="Acceso a la organización" description="Membresías e invitaciones de la organización activa."><div className="desktop-settings-collection">{snapshot?.members.map((member) => <article key={member.id}><span className="desktop-settings-avatar">{initials(member.displayName ?? member.email)}</span><div><strong>{member.displayName ?? member.email}</strong><small>{member.roleName} · {statusLabel(member.status)}</small></div></article>)}{snapshot?.members.length === 0 ? <EmptyState text="No hay miembros para mostrar." /> : null}</div></SettingsPanel>;
}

function RolesSettings({ snapshot }: { snapshot: DesktopSettingsSnapshot | undefined }) {
  return <SettingsPanel title="Modelo de permisos" description="Roles disponibles y cantidad de permisos asignados."><div className="desktop-settings-collection">{snapshot?.roles.map((role) => <article key={role.id}><span className="desktop-settings-collection__icon"><ShieldCheck /></span><div><strong>{role.name}</strong><small>{role.description || `${role.permissions.length} permisos`} · {role.kind === "system" ? "Rol del sistema" : "Rol personalizado"}</small></div><span className="desktop-settings-count">{role.permissions.length}</span></article>)}</div></SettingsPanel>;
}

function BillingSettings({ fallback, snapshot }: { fallback: DesktopBillingPlanState; snapshot: DesktopSettingsSnapshot | undefined }) {
  const planName = snapshot?.billing?.subscriptions[0]?.planName ?? (fallback.status === "ready" ? fallback.planName : null) ?? "Sin plan";
  return <>
    <SettingsPanel title="Suscripción" description="Plan y uso de la organización activa."><div className="desktop-settings-plan"><span>Plan actual</span><SubscriptionPlanBadge planName={planName} /></div>{snapshot?.billing ? <SettingsFacts entries={[["Empresas", usage(snapshot.billing.usage.companies)], ["Miembros", usage(snapshot.billing.usage.members)], ["Dispositivos", usage(snapshot.billing.usage.devices)]]} /> : null}</SettingsPanel>
    <SettingsPanel title="Planes disponibles" description="Opciones comerciales habilitadas para esta cuenta."><div className="desktop-settings-collection">{snapshot?.billingPlans.map((plan) => <article key={plan.id}><span className="desktop-settings-collection__icon"><CreditCard /></span><div><strong>{plan.name}</strong><small>{plan.contactOnly ? "Requiere contacto comercial" : `${money(plan.monthlyPrice)} al mes`}</small></div></article>)}</div></SettingsPanel>
    {snapshot?.paymentRequests.length ? <SettingsPanel title="Solicitudes de pago" description="Pagos manuales enviados recientemente."><div className="desktop-settings-collection">{snapshot.paymentRequests.map((request) => <article key={request.id}><div><strong>{money(request.amount)}</strong><small>{statusLabel(request.status)} · {formatDate(request.submittedAt)}</small></div></article>)}</div></SettingsPanel> : null}
  </>;
}

function SettingsForm({ children, onSubmit, submitLabel = "Guardar cambios" }: { children: ReactNode; onSubmit: () => Promise<void>; submitLabel?: string }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await onSubmit(); } finally { setSaving(false); } }
  return <form className="desktop-settings-form" onSubmit={(event) => void submit(event)}>{children}<div className="desktop-settings-form__footer"><span /><Button type="submit" size="sm" loading={saving}>{submitLabel}</Button></div></form>;
}
function Field({ children, label }: { children: ReactNode; label: string }) { return <label className="desktop-settings-field"><span>{label}</span>{children}</label>; }
function SettingsPanel({ action, children, description, title }: { action?: ReactNode; children: ReactNode; description: string; title: string }) { return <section className="desktop-settings-panel"><header><div><h3>{title}</h3><p>{description}</p></div>{action}</header><div className="desktop-settings-panel__body">{children}</div></section>; }
function SettingsFacts({ entries }: { entries: readonly (readonly [string, string])[] }) { return <dl className="desktop-settings-facts">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
function EmptyState({ text }: { text: string }) { return <p className="desktop-settings-empty">{text}</p>; }

function SettingsDetailSkeleton({ destination }: { destination: DesktopSettingsDestination }) {
  if (destination === "settings.devices") return null;
  if (destination === "settings.profile" || destination === "settings.organization") {
    return <SettingsPanel title="Identidad" description="Cargando información…"><div className="desktop-settings-skeleton-fields"><FieldSkeleton label="Nombre" /><FieldSkeleton label="Correo" /></div></SettingsPanel>;
  }
  if (destination === "settings.appearance") {
    return <SettingsPanel title="Interfaz" description="Cargando preferencias…"><div className="desktop-settings-choice"><Skeleton variant="rectangle" height={80} width="100%" /><Skeleton variant="rectangle" height={80} width="100%" /></div></SettingsPanel>;
  }
  if (destination === "settings.security") {
    return <><SettingsPanel title="Contraseña" description="Cargando seguridad…"><FieldSkeleton label="Nueva contraseña" /></SettingsPanel><CollectionSkeleton title="Sesiones" rows={2} /></>;
  }
  if (destination === "settings.members") return <CollectionSkeleton title="Acceso a la organización" rows={4} />;
  if (destination === "settings.roles") return <CollectionSkeleton title="Modelo de permisos" rows={4} />;
  return <><CollectionSkeleton title="Suscripción" rows={2} /><CollectionSkeleton title="Planes disponibles" rows={3} /></>;
}

function CollectionSkeleton({ rows, title }: { rows: number; title: string }) {
  return <SettingsPanel title={title} description="Cargando información…"><div className="desktop-settings-collection" aria-busy="true">{Array.from({ length: rows }, (_, index) => <article key={index}><Skeleton variant="rectangle" width={32} height={32} /><div><Skeleton variant="text" width="42%" /><Skeleton variant="text" width="68%" height={12} /></div></article>)}</div></SettingsPanel>;
}

function detailDefinition(destination: DesktopSettingsDestination): { title: string; description: string; icon: ReactNode } {
  if (destination === "settings.profile") return { title: "Perfil personal", description: "Identidad y datos asociados a tu cuenta.", icon: <UserRound /> };
  if (destination === "settings.appearance") return { title: "Apariencia", description: "Personaliza cómo se ve Kontave Desktop.", icon: <Palette /> };
  if (destination === "settings.security") return { title: "Seguridad", description: "Protege tu cuenta y administra el acceso.", icon: <ShieldCheck /> };
  if (destination === "settings.organization") return { title: "Organización", description: "Información general del espacio de trabajo.", icon: <Building2 /> };
  if (destination === "settings.members") return { title: "Miembros", description: "Personas con acceso a la organización.", icon: <UsersRound /> };
  if (destination === "settings.roles") return { title: "Roles y permisos", description: "Controla lo que puede hacer cada usuario.", icon: <ShieldCheck /> };
  if (destination === "settings.billing") return { title: "Facturación", description: "Plan, pagos y métodos de pago.", icon: <CreditCard /> };
  return { title: "Dispositivos", description: "Equipos conectados a esta instalación.", icon: <MonitorCog /> };
}
function presentSettingsFailure(error: { code: string; message: string; requestId: string | null }): void {
  presentFeedback.execute(errorFeedback(error.message, {
    description: `Tipo: ${error.code}`,
    referenceCode: error.requestId ?? error.code,
    deduplicationKey: error.requestId ?? error.code,
  }));
}
function initials(value: string) { return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?"; }
function clientLabel(value: string) { return value === "desktop" ? "Kontave Desktop" : value === "web" ? "Kontave Web" : "Kontave Mobile"; }
function statusLabel(value: string) { return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-VE", { dateStyle: "medium" }).format(new Date(value)); }
function usage(value: { used: number; maximum: number | null }) { return value.maximum === null ? `${value.used}` : `${value.used} de ${value.maximum}`; }
function money(value: { minorAmount: string; currency: string }) { return new Intl.NumberFormat("es-VE", { style: "currency", currency: value.currency }).format(Number(value.minorAmount) / 100); }

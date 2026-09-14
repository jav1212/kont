"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, Button } from "@heroui/react";
import { ArrowUpRight, Building2, Network, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { z } from "zod";
import {
    organizationCompanySchema,
    organizationMemberSchema,
    organizationRoleSchema,
    workspaceSchema,
    type OrganizationWorkspace,
} from "@/src/modules/organizations/contracts";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { organizationRequest } from "@/src/modules/organizations/frontend/organization-request";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { ContextLink } from "@/src/shared/frontend/components/context-link";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { notify } from "@/src/shared/frontend/notify";

const companiesSchema = z.array(organizationCompanySchema);
const membersSchema = z.array(organizationMemberSchema);
const rolesSchema = z.array(organizationRoleSchema);

const ROLE_LABELS: Readonly<Record<string, string>> = {
    owner: "Propietario",
    admin: "Administrador",
    accountant: "Contador",
    contador: "Contador",
    contable: "Contador",
    seller: "Vendedor",
    vendedor: "Vendedor",
    cashier: "Cajero",
    cajero: "Cajero",
};

const STATUS_LABELS = { active: "Activo", invited: "Invitado", suspended: "Suspendido" } as const;
type Section = "companies" | "members" | "roles";
type Resource<T> = { data: T | null; loading: boolean; failed: boolean; retry: () => void };

/**
 * Reads a permission-gated organization projection and discards superseded requests.
 *
 * @param path - Organization-scoped BFF path.
 * @param schema - Runtime decoder for the unwrapped response.
 * @param allowed - Whether the active access permits requesting this projection.
 * @param tenantId - Legacy scope paired with the selected organization by the API.
 * @returns Data and a retry action; inaccessible projections never issue a request.
 */
function useOrganizationResource<T>(path: string, schema: z.ZodType<T>, allowed: boolean, tenantId: string): Resource<T> {
    const [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState<{ key: string; data: T | null; failed: boolean } | null>(null);
    const key = `${path}:${tenantId}:${attempt}:${allowed}`;

    useEffect(() => {
        if (!allowed) return;
        const controller = new AbortController();
        void organizationRequest(path, schema, {
            signal: controller.signal,
            headers: { "X-Tenant-Id": tenantId },
        }).then(
            (data) => {
                if (!controller.signal.aborted) setResult({ key, data, failed: false });
            },
            (error: unknown) => {
                if (controller.signal.aborted) return;
                setResult({ key, data: null, failed: true });
                notify.error(error instanceof Error ? error.message : "No se pudo cargar la organización.");
            },
        );
        return () => controller.abort();
    }, [allowed, key, path, schema, tenantId]);

    const current = result?.key === key ? result : null;
    return {
        data: allowed ? current?.data ?? null : null,
        loading: allowed && current === null,
        failed: allowed && current?.failed === true,
        retry: () => setAttempt((value) => value + 1),
    };
}

/**
 * Displays organization administration without conflating the workspace with a personal account.
 * Organization changes remount all child state to isolate requests and unsaved drafts.
 *
 * @returns Identity controls and permission-aware organization projections.
 * @throws Error when rendered outside OrganizationProvider; expected API failures render inline.
 */
export function OrganizationSettings() {
    const { organization, loading, error, refresh } = useOrganization();

    if (loading) return <LoadingState label="Cargando configuración de la organización…" />;
    if (error) {
        return (
            <SettingsSection title="Configuración de la organización">
                <div className="space-y-4">
                    <p className="text-sm text-[var(--text-secondary)]">No se pudo cargar la configuración de la organización.</p>
                    <BaseButton.Root variant="outline" size="sm" onClick={() => void refresh()}>
                        Volver a intentar
                    </BaseButton.Root>
                </div>
            </SettingsSection>
        );
    }
    if (!organization) {
        return (
            <SettingsSection title="Configuración de la organización">
                <p className="text-sm text-[var(--text-secondary)]">
                    No tienes una organización disponible para configurar en este espacio de trabajo.
                </p>
            </SettingsSection>
        );
    }
    return <OrganizationOverview key={organization.id} organization={organization} refresh={refresh} />;
}

/**
 * Composes the current organization's editable identity and independent read projections.
 *
 * @param props - Authorized workspace and provider refresh operation.
 * @returns The overview; counts are shown only after their corresponding read succeeds.
 */
function OrganizationOverview({ organization, refresh }: {
    organization: OrganizationWorkspace;
    refresh: () => Promise<void>;
}) {
    const [section, setSection] = useState<Section>("companies");
    const permissions = organization.permissions;
    const all = permissions.includes("*");
    const canCompanies = all || permissions.includes("companies.read");
    const canMembers = all || permissions.includes("members.read");
    const canRoles = all || permissions.includes("roles.read");
    const base = `/api/organizations/${encodeURIComponent(organization.id)}`;
    const companies = useOrganizationResource(`${base}/companies`, companiesSchema, canCompanies, organization.legacyTenantId);
    const members = useOrganizationResource(`${base}/members`, membersSchema, canMembers, organization.legacyTenantId);
    const roles = useOrganizationResource(`${base}/roles`, rolesSchema, canRoles, organization.legacyTenantId);
    const context = `tid=${encodeURIComponent(organization.legacyTenantId)}`;
    const sections = [
        { id: "companies", label: "Empresas", icon: Building2, count: companies.data?.length, allowed: canCompanies },
        { id: "members", label: "Miembros", icon: Users, count: members.data?.length, allowed: canMembers },
        { id: "roles", label: "Roles", icon: ShieldCheck, count: roles.data?.length, allowed: canRoles },
    ] as const;
    const selected = sections.find((item) => item.id === section && item.allowed)?.id
        ?? sections.find((item) => item.allowed)?.id;

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-lg">
                    <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-primary-500">
                        <Network size={14} aria-hidden /> Espacio de trabajo
                    </p>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tu organización</h1>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                        Aquí se agrupan tus empresas, las personas que trabajan contigo y sus permisos.
                        Tu perfil personal se administra por separado.
                    </p>
                </div>
                <BaseButton.Root variant="ghost" size="sm" leftIcon={<RefreshCw size={14} aria-hidden />} onClick={() => void refresh()}>
                    Actualizar
                </BaseButton.Root>
            </header>

            <OrganizationIdentity key={`${organization.id}:${organization.version}`} organization={organization} refresh={refresh} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Contenido de la organización">
                {sections.map(({ id, label, icon: Icon, count, allowed }) => (
                    <Button
                        key={id}
                        type="button"
                        isDisabled={!allowed}
                        disableRipple
                        aria-pressed={selected === id}
                        aria-controls="organization-content"
                        onPress={() => setSection(id)}
                        className={[
                            "block h-auto min-w-0 rounded-xl border p-4 text-left whitespace-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-default disabled:opacity-60",
                            selected === id ? "border-primary-500/40 bg-primary-500/5" : "border-border-light bg-surface-1 enabled:hover:bg-surface-2",
                        ].join(" ")}
                    >
                        <span className="flex items-center justify-between gap-2">
                            <Icon size={18} className={selected === id ? "text-primary-500" : "text-[var(--text-tertiary)]"} aria-hidden />
                            {allowed && count !== undefined && <span className="font-mono text-2xl font-semibold text-foreground">{count}</span>}
                        </span>
                        <span className="mt-3 block text-sm font-semibold text-foreground">{label}</span>
                        <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                            {allowed ? "En esta organización" : "Sin permiso de consulta"}
                        </span>
                    </Button>
                ))}
            </div>

            <div id="organization-content">
                {selected === "companies" && (
                    <SettingsSection title="Empresas de la organización" subtitle="Cada empresa conserva sus datos fiscales y sus operaciones.">
                        <ResourceContent resource={companies} empty="Esta organización aún no tiene empresas disponibles para tu acceso.">
                            <ul className="divide-y divide-border-light">
                                {companies.data?.map((company) => (
                                    <li key={company.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                                        <Avatar src={company.logoUrl ?? undefined} name={company.name} className="h-10 w-10 shrink-0 border border-border-light bg-surface-2 text-foreground" />
                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-medium text-foreground">{company.name}</p>
                                            <p className="mt-1 font-mono text-xs text-[var(--text-tertiary)]">{company.rif ?? "RIF no registrado"}</p>
                                        </div>
                                        <ContextLink href={`/settings/company?${context}&cid=${encodeURIComponent(company.id)}`} className="rounded-md p-2 text-primary-500 hover:bg-primary-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label={`Configurar ${company.name}`}>
                                            <ArrowUpRight size={18} aria-hidden />
                                        </ContextLink>
                                    </li>
                                ))}
                            </ul>
                        </ResourceContent>
                    </SettingsSection>
                )}
                {selected === "members" && (
                    <SettingsSection title="Miembros de la organización" subtitle="Personas vinculadas a esta organización y sus invitaciones pendientes.">
                        <ResourceContent resource={members} empty="No hay miembros ni invitaciones para mostrar.">
                            <ul className="divide-y divide-border-light">
                                {members.data?.map((member) => (
                                    <li key={`${member.kind}:${member.id}`} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
                                        <Avatar src={member.avatarUrl ?? undefined} name={member.displayName ?? member.email} className="h-9 w-9 shrink-0 bg-surface-2 text-foreground" />
                                        <div className="min-w-0 flex-1 basis-40">
                                            <p className="break-words text-sm font-medium text-foreground">{member.displayName ?? member.email}</p>
                                            {member.displayName && <p className="mt-0.5 break-all text-xs text-[var(--text-secondary)]">{member.email}</p>}
                                            <p className="mt-1 text-xs text-[var(--text-tertiary)]">{member.roleName}</p>
                                        </div>
                                        <span className="rounded-md border border-border-light bg-surface-2 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">{STATUS_LABELS[member.status]}</span>
                                    </li>
                                ))}
                            </ul>
                        </ResourceContent>
                        <SectionLink href={`/settings/members?${context}`}>Gestionar miembros e invitaciones</SectionLink>
                    </SettingsSection>
                )}
                {selected === "roles" && (
                    <SettingsSection title="Roles de la organización" subtitle="Los roles definen lo que cada miembro puede consultar y gestionar.">
                        <ResourceContent resource={roles} empty="No hay roles disponibles para mostrar.">
                            <ul className="divide-y divide-border-light">
                                {roles.data?.map((role) => (
                                    <li key={role.id} className="space-y-1 py-4 first:pt-0 last:pb-0">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-medium text-foreground">{role.name}</p>
                                            <span className="text-xs text-[var(--text-tertiary)]">{role.status === "archived" ? "Archivado" : role.kind === "system" ? "Del sistema" : "Personalizado"}</span>
                                        </div>
                                        {role.description && <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{role.description}</p>}
                                        <p className="font-mono text-[11px] text-[var(--text-tertiary)]">{role.permissions.includes("*") ? "Todos los permisos" : `${role.permissions.length} permisos`}</p>
                                    </li>
                                ))}
                            </ul>
                        </ResourceContent>
                    </SettingsSection>
                )}
                {!selected && <p className="text-sm text-[var(--text-secondary)]">Tu rol permite ver la organización. Solicita acceso a su administración para consultar empresas, miembros o roles.</p>}
            </div>
        </div>
    );
}

/**
 * Edits organization identity using version-checked mutations and serializes submissions.
 *
 * @param props - Current identity/version and workspace refresh callback.
 * @returns An identity card; changing organizations aborts in-flight UI requests.
 */
function OrganizationIdentity({ organization, refresh }: {
    organization: OrganizationWorkspace;
    refresh: () => Promise<void>;
}) {
    const [name, setName] = useState(organization.name);
    const [saving, setSaving] = useState(false);
    const busy = useRef(false);
    const lifecycle = useRef<AbortController | null>(null);
    const canEdit = organization.permissions.includes("*") || organization.permissions.includes("organizations.update");

    useEffect(() => {
        const controller = new AbortController();
        lifecycle.current = controller;
        return () => controller.abort();
    }, []);

    async function save(suffix: string, options: RequestInit) {
        const controller = lifecycle.current;
        if (!canEdit || busy.current || !controller || controller.signal.aborted) return;
        busy.current = true;
        setSaving(true);
        try {
            const headers = new Headers(options.headers);
            headers.set("X-Tenant-Id", organization.legacyTenantId);
            await organizationRequest(`/api/organizations/${encodeURIComponent(organization.id)}${suffix}`, workspaceSchema, {
                ...options,
                headers,
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            notify.success("Organización actualizada.");
            await refresh();
        } catch (error) {
            if (!controller.signal.aborted) notify.error(error instanceof Error ? error.message : "No se pudo actualizar la organización.");
        } finally {
            busy.current = false;
            if (!controller.signal.aborted) setSaving(false);
        }
    }

    return (
        <SettingsSection title="Identidad de la organización" subtitle="Nombre e imagen que identifican este espacio de trabajo.">
            <div className="flex flex-col gap-6 sm:flex-row">
                <div className="shrink-0">
                    <Avatar src={organization.logoUrl ?? undefined} name={organization.name} className="h-20 w-20 rounded-2xl border border-primary-500/15 bg-primary-500/5 text-2xl text-primary-500" />
                </div>
                <div className="min-w-0 flex-1 space-y-5">
                    <div>
                        <p className="break-words text-lg font-semibold text-foreground">{organization.name}</p>
                        <span className="mt-3 inline-flex rounded-md border border-primary-500/20 bg-primary-500/5 px-2 py-1 text-xs text-primary-500">
                            Tu rol: {ROLE_LABELS[organization.role] ?? organization.role}
                        </span>
                    </div>
                    {canEdit ? (
                        <>
                            <form className="space-y-3" onSubmit={(event) => {
                                event.preventDefault();
                                void save("", {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name: name.trim(), expectedVersion: organization.version }),
                                });
                            }}>
                                <BaseInput.Field label="Nombre de la organización" value={name} onValueChange={setName} isRequired isDisabled={saving} autoComplete="organization" maxLength={160} />
                                <BaseButton.Root type="submit" variant="primary" size="sm" loading={saving} isDisabled={!name.trim() || name.trim() === organization.name}>
                                    Guardar nombre
                                </BaseButton.Root>
                            </form>
                            <div className="space-y-2 border-t border-border-light pt-4">
                                <label htmlFor="organization-logo" className="block text-xs font-medium text-foreground">Logo de la organización</label>
                                <input
                                    id="organization-logo"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    disabled={saving}
                                    aria-describedby="organization-logo-format"
                                    className="block w-full min-w-0 rounded-lg text-xs text-[var(--text-secondary)] file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border-light file:bg-surface-2 file:px-3 file:py-2 file:text-xs file:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        event.target.value = "";
                                        if (!file) return;
                                        const body = new FormData();
                                        body.set("file", file);
                                        body.set("expectedVersion", String(organization.version));
                                        void save("/logo", { method: "POST", body });
                                    }}
                                />
                                <p id="organization-logo-format" className="text-xs text-[var(--text-tertiary)]">PNG, JPG o WebP. Máximo 5 MB. Se guarda al seleccionar el archivo.</p>
                                {organization.logoUrl && (
                                    <BaseButton.Root variant="ghost" size="sm" isDisabled={saving} onClick={() => void save("/logo", {
                                        method: "DELETE",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ expectedVersion: organization.version }),
                                    })}>
                                        Quitar logo
                                    </BaseButton.Root>
                                )}
                            </div>
                        </>
                    ) : (
                        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">Tu rol tiene acceso de consulta a los datos de la organización.</p>
                    )}
                </div>
            </div>
        </SettingsSection>
    );
}

/**
 * Renders a projection's loading, failed, empty, or populated state.
 *
 * @param props - Projection state, empty copy, and populated content.
 * @returns Content whose empty state never masks a failed request.
 */
function ResourceContent<T extends readonly unknown[]>({ resource, empty, children }: {
    resource: Resource<T>;
    empty: string;
    children: ReactNode;
}) {
    if (resource.loading) return <LoadingState label="Cargando datos…" />;
    if (resource.failed) {
        return (
            <div className="space-y-3 py-3">
                <p className="text-sm text-[var(--text-secondary)]">No se pudo cargar esta sección.</p>
                <BaseButton.Root variant="outline" size="sm" onClick={resource.retry}>
                    Volver a intentar
                </BaseButton.Root>
            </div>
        );
    }
    if (!resource.data?.length) return <p className="py-4 text-sm text-[var(--text-secondary)]">{empty}</p>;
    return children;
}

/**
 * Announces pending organization data without displaying placeholder counts.
 *
 * @param props - Accessible loading message.
 * @returns A compact, responsive loading placeholder.
 */
function LoadingState({ label }: { label: string }) {
    return (
        <div role="status" className="space-y-3 py-4">
            <p className="text-sm text-[var(--text-tertiary)]">{label}</p>
            <div aria-hidden className="h-14 animate-pulse rounded-lg bg-surface-2" />
        </div>
    );
}

/**
 * Links an overview projection to its management page while retaining workspace context.
 *
 * @param props - Destination and descriptive link label.
 * @returns A keyboard-accessible contextual navigation link.
 */
function SectionLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <ContextLink href={href} className="mt-5 inline-flex items-center gap-2 rounded-md text-xs font-medium text-primary-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            {children}<ArrowUpRight size={14} aria-hidden />
        </ContextLink>
    );
}

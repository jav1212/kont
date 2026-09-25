"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { notify } from "@/src/shared/frontend/notify";
import { Check, LockKeyhole, Save, ShieldCheck } from "lucide-react";

interface Permission {
    code: string;
    resource: string;
    action: string;
    description: string;
}

interface Role {
    id: string;
    name: string;
    description: string;
    locked: boolean;
    version: number;
    permissions: string[];
}

const RESOURCE_LABELS: Record<string, string> = {
    companies: "Empresas",
    members: "Miembros",
    employees: "Empleados",
    payroll: "Nómina",
    inventory: "Inventario",
    purchases: "Compras",
    sales: "Ventas",
    accounting: "Contabilidad",
    documents: "Documentos",
    reports: "Reportes",
    billing: "Facturación",
};

const ACTION_LABELS: Record<string, string> = {
    read: "Ver",
    create: "Crear",
    update: "Editar",
    delete: "Eliminar",
    invite: "Invitar",
    revoke: "Revocar",
    confirm: "Confirmar",
    cancel: "Anular",
    post: "Publicar",
    close: "Cerrar",
    manage: "Gestionar",
};

function permissionLabel(permission: Permission): string {
    if (permission.code === "sales.read.dashboard") return "Ver tablero e indicadores de ventas";
    return ACTION_LABELS[permission.action] ?? permission.action;
}

/**
 * Renders the organization role-permission settings and protects the owner role from changes.
 *
 * @returns The role settings interface for the active organization.
 */
export default function RolesSettingsPage() {
    const router = useRouter();
    const { state: accessState, can } = useOrganizationModuleAccess("/settings/roles");
    const { refresh: refreshOrganization } = useOrganization();
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [selectedRole, setSelectedRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const response = await apiFetch("/api/authorization/roles");
        const json = await response.json() as { data?: { roles: Role[]; permissions: Permission[] }; error?: string };
        if (!response.ok) {
            notify.error(json.error ?? "No se pudieron cargar los roles");
            setLoading(false);
            return;
        }
        const nextRoles = json.data?.roles ?? [];
        setRoles(nextRoles);
        setPermissions(json.data?.permissions ?? []);
        setSelectedRole((current) => {
            if (current && nextRoles.some((item) => item.id === current)) return current;
            return nextRoles[0]?.id ?? null;
        });
        setLoading(false);
    }, []);

    useEffect(() => {
        if (accessState === "denied") router.replace("/");
        if (accessState === "allowed") void load();
    }, [accessState, router, load]);

    const role = roles.find((item) => item.id === selectedRole) ?? roles[0];
    const canManageRoles = can("roles.manage");
    const canEditSelectedRole = Boolean(role && !role.locked && canManageRoles && !loading && !saving);
    const groupedPermissions = useMemo(() => {
        const groups: Record<string, Permission[]> = {};
        for (const permission of permissions) {
            groups[permission.resource] ??= [];
            groups[permission.resource].push(permission);
        }
        return Object.entries(groups);
    }, [permissions]);

    function togglePermission(code: string) {
        if (!role || !canEditSelectedRole) return;
        setRoles((current) => current.map((item) => {
            if (item.id !== role.id) return item;
            const enabled = item.permissions.includes(code);
            return { ...item, permissions: enabled ? item.permissions.filter((value) => value !== code) : [...item.permissions, code] };
        }));
    }

    async function saveRole() {
        if (!role || !canEditSelectedRole) return;
        setSaving(true);
        const response = await apiFetch("/api/authorization/roles", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: role.id, permissions: role.permissions, expectedVersion: role.version }),
        });
        const json = await response.json() as { error?: string };
        setSaving(false);
        if (!response.ok) {
            notify.error(json.error ?? "No se pudieron guardar los permisos");
            return;
        }
        await Promise.all([load(), refreshOrganization()]);
        notify.success(`Permisos de ${role.name} actualizados`);
    }

    if (accessState !== "allowed") return null;

    return (
        <div className="space-y-6">
            <SettingsSection
                title="Roles y permisos"
                subtitle="Configura qué puede hacer cada perfil en esta organización. Los cambios aplican a todos los miembros que tengan ese rol."
                action={<ShieldCheck size={18} className="text-primary-500" />}
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {roles.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedRole(item.id)}
                                aria-pressed={selectedRole === item.id}
                                className={["text-left rounded-lg border px-3 py-3 transition-colors", selectedRole === item.id ? "border-primary-300 bg-primary-50" : "border-border-light hover:bg-surface-2"].join(" ")}
                            >
                                <p className="font-mono text-[12px] font-bold text-foreground flex items-center gap-1.5">{item.name}{item.locked && <LockKeyhole size={12} className="text-[var(--text-tertiary)]" />}</p>
                                <p className="font-sans text-[11px] text-[var(--text-tertiary)] mt-1 leading-snug">{item.locked ? "Acceso total protegido; sus permisos no se pueden modificar." : item.description}</p>
                            </button>
                        ))}
                    </div>

                    {loading || !role ? (
                        <div className="py-10 text-center font-mono text-xs text-[var(--text-tertiary)]">Cargando permisos…</div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-4 border-t border-border-light pt-4">
                                <div>
                                    <p className="font-mono text-[13px] font-bold text-foreground">Permisos de {role.name}</p>
                                    <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-1">{role.locked ? "Este perfil tiene acceso total y es de solo lectura." : canManageRoles ? "Activa solo las operaciones necesarias para este perfil." : "No tienes permiso para modificar este perfil."}</p>
                                </div>
                                <BaseButton.Root variant="primary" size="sm" onClick={saveRole} isDisabled={saving || !canEditSelectedRole} loading={saving} leftIcon={<Save size={13} />}>
                                    Guardar
                                </BaseButton.Root>
                            </div>

                            <div className="space-y-4">
                                {groupedPermissions.map(([resource, items]) => (
                                    <div key={resource} className="rounded-lg border border-border-light overflow-hidden">
                                        <div className="px-4 py-2.5 bg-surface-2/50 border-b border-border-light">
                                            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">{RESOURCE_LABELS[resource] ?? resource}</p>
                                        </div>
                                        <div className="divide-y divide-border-light">
                                            {items.map((permission) => {
                                                const checked = role.permissions.includes(permission.code);
                                                return (
                                                    <button
                                                        key={permission.code}
                                                        type="button"
                                                        onClick={() => togglePermission(permission.code)}
                                                        disabled={!canEditSelectedRole}
                                                        aria-pressed={checked}
                                                        className={["w-full flex items-center gap-3 px-4 py-3 text-left transition-colors", canEditSelectedRole ? "hover:bg-surface-2/40" : "cursor-not-allowed opacity-70"].join(" ")}
                                                    >
                                                        <span className={["w-5 h-5 rounded-md border flex items-center justify-center shrink-0", checked ? "bg-primary-500 border-primary-500 text-white" : "border-border-light"].join(" ")}>
                                                            {checked && <Check size={13} strokeWidth={3} />}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block font-mono text-[12px] text-foreground">{permissionLabel(permission)}</span>
                                                            <span className="block font-sans text-[11px] text-[var(--text-tertiary)] mt-0.5">{permission.description}</span>
                                                        </span>
                                                        <span className="font-mono text-[10px] text-[var(--text-disabled)] hidden sm:block">{permission.code}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </SettingsSection>

            <div className="flex items-start gap-3 px-1 text-[var(--text-tertiary)]">
                <LockKeyhole size={15} className="mt-0.5 shrink-0" />
                <p className="font-sans text-[12px] leading-relaxed">El rol Dueño siempre conserva acceso total y no puede modificarse. Los demás perfiles del sistema pueden ajustarse para esta organización. La autorización también se valida en el backend.</p>
            </div>
        </div>
    );
}

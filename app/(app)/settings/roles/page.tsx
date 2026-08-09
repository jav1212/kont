"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
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

export default function RolesSettingsPage() {
    const router = useRouter();
    const { loading: tenantLoading, can } = useActiveTenantContext();
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [selectedRole, setSelectedRole] = useState("admin");
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
        setRoles(json.data?.roles ?? []);
        setPermissions(json.data?.permissions ?? []);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!tenantLoading && !can("members.update")) router.replace("/");
        if (!tenantLoading && can("members.update")) void load();
    }, [tenantLoading, can, router, load]);

    const role = roles.find((item) => item.id === selectedRole) ?? roles[0];
    const groupedPermissions = useMemo(() => {
        const groups: Record<string, Permission[]> = {};
        for (const permission of permissions) {
            groups[permission.resource] ??= [];
            groups[permission.resource].push(permission);
        }
        return Object.entries(groups);
    }, [permissions]);

    function togglePermission(code: string) {
        if (!role || role.locked) return;
        setRoles((current) => current.map((item) => {
            if (item.id !== role.id) return item;
            const enabled = item.permissions.includes(code);
            return { ...item, permissions: enabled ? item.permissions.filter((value) => value !== code) : [...item.permissions, code] };
        }));
    }

    async function saveRole() {
        if (!role || role.locked) return;
        setSaving(true);
        const response = await apiFetch("/api/authorization/roles", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: role.id, permissions: role.permissions }),
        });
        const json = await response.json() as { error?: string };
        setSaving(false);
        if (!response.ok) {
            notify.error(json.error ?? "No se pudieron guardar los permisos");
            return;
        }
        notify.success(`Permisos de ${role.name} actualizados`);
    }

    if (tenantLoading || !can("members.update")) return null;

    return (
        <div className="space-y-6">
            <SettingsSection
                title="Roles y permisos"
                subtitle="Configura qué puede hacer cada perfil dentro de tus empresas. Los cambios aplican a todos los miembros con ese rol."
                action={<ShieldCheck size={18} className="text-primary-500" />}
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {roles.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => { if (!item.locked) setSelectedRole(item.id); }}
                                disabled={item.locked}
                                className={["text-left rounded-lg border px-3 py-3 transition-colors", item.locked ? "border-border-light bg-surface-2/50 cursor-not-allowed" : selectedRole === item.id ? "border-primary-300 bg-primary-50" : "border-border-light hover:bg-surface-2"].join(" ")}
                            >
                                <p className="font-mono text-[12px] font-bold text-foreground flex items-center gap-1.5">{item.name}{item.locked && <LockKeyhole size={12} className="text-[var(--text-tertiary)]" />}</p>
                                <p className="font-sans text-[11px] text-[var(--text-tertiary)] mt-1 leading-snug">{item.description}</p>
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
                                    <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-1">Activa solo las operaciones necesarias para este perfil.</p>
                                </div>
                                <BaseButton.Root variant="primary" size="sm" onClick={saveRole} isDisabled={saving} loading={saving} leftIcon={<Save size={13} />}>
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
                                                    <button key={permission.code} type="button" onClick={() => togglePermission(permission.code)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/40 transition-colors">
                                                        <span className={["w-5 h-5 rounded-md border flex items-center justify-center shrink-0", checked ? "bg-primary-500 border-primary-500 text-white" : "border-border-light"].join(" ")}>
                                                            {checked && <Check size={13} strokeWidth={3} />}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block font-mono text-[12px] text-foreground">{ACTION_LABELS[permission.action] ?? permission.action}</span>
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
                <p className="font-sans text-[12px] leading-relaxed">El rol Dueño siempre conserva acceso total y no puede modificarse. La autorización también se valida en el backend, aunque un miembro intente acceder directamente a una ruta.</p>
            </div>
        </div>
    );
}

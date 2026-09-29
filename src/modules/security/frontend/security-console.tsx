"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { notify } from "@/src/shared/frontend/notify";
import { DebouncedQuery } from "@kontave/client-interaction";
import { AUDIT_ACTIONS, AUDITED_ENTITY_TYPES } from "@kontave/audit-trail/domain";

const grantCategories = [
  {
    kind: "module",
    permission: "modules.access",
    label: "Módulo",
    example: "sales",
    hint: "sales, purchases, inventory, payroll, accounting o documents",
  },
  {
    kind: "table",
    permission: "tables.access",
    label: "Datos de un módulo",
    example: "sales",
    hint: "sales, purchases, inventory, employees, payroll, accounting o documents",
  },
  {
    kind: "process",
    permission: "processes.execute",
    label: "Proceso",
    example: "sales.confirm",
    hint: "Permiso de la operación, por ejemplo sales.confirm",
  },
  {
    kind: "report",
    permission: "reports.run",
    label: "Reporte",
    example: "inventory.read",
    hint: "Permiso de consulta del reporte, por ejemplo inventory.read",
  },
  {
    kind: "toolbar_action",
    permission: "toolbar_actions.use",
    label: "Acción",
    example: "sales.create",
    hint: "Permiso de la operación, por ejemplo sales.create",
  },
  {
    kind: "price_list",
    permission: "sales.price_lists.use",
    label: "Lista de precios",
    example: "default",
    hint: "default corresponde a la lista de precios habitual",
  },
];

type User = {
  organizationId: string;
  userId: string;
  email: string;
  displayName: string | null;
  administrativePriority: number;
  allowedCompanyIds: string[];
  status: "active" | "suspended";
  version: number;
};
type Policy = {
  organizationId: string;
  policy: {
    passwordMaximumAgeDays: number | null;
    inactivityMaximumDays: number | null;
    failedAttemptLimit: number;
    failedAttemptWindowMinutes: number;
    lockoutMinutes: number;
  };
  version: number;
  updatedAt: string;
};
type Audit = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  context: {
    actorId: string | null;
    occurredAt: string;
    branchId: string | null;
    deviceId: string | null;
  };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
type AuditPage = {
  entries: Audit[];
  total: number;
  offset: number;
  limit: number;
};
type AuditQuery = {
  companyId: string;
  entityType: string;
  entityId: string;
  actions: string;
  offset: number;
};
type Order = {
  id: string;
  companyId: string;
  beneficiary: string;
  concept: string;
  amount: string;
  currency: string;
  dueDate: string | null;
  status: "draft" | "cancelled";
  version: number;
};
type OrderPage = {
  entries: Order[];
  total: number;
  offset: number;
  limit: number;
};
type Member = {
  id: string;
  userId: string | null;
  email: string;
  status: "active" | "invited" | "suspended";
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  const value = (await response.json()) as { data?: T; error?: string };
  if (!response.ok || value.data === undefined)
    throw new Error(value.error ?? "No se pudo completar la operación.");
  return value.data;
}

function NumberField({
  label,
  value,
  onChange,
  nullable,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  nullable?: boolean;
}) {
  return (
    <BaseInput.Field
      label={label}
      type="number"
      value={value === null ? "" : String(value)}
      onValueChange={(next) =>
        onChange(next === "" && nullable ? null : Number(next))
      }
    />
  );
}

/** Manages organization user assignments, credential policy, and exact scoped grants. */
function SecurityConsolePanel(): React.JSX.Element {
  const { companies } = useCompany();
  const { organization } = useOrganization();
  const { state, can } = useOrganizationModuleAccess("/settings/security");
  const [users, setUsers] = useState<User[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    userId: "",
    displayName: "",
    priority: "0",
    companyIds: [] as string[],
  });
  const [editing, setEditing] = useState<User | null>(null);
  const [grant, setGrant] = useState({
    membershipId: "",
    permissionCode: "",
    targetKind: "",
    targetId: "",
    companyId: "",
  });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextUsers = await request<User[]>("/api/security/users");
      setUsers(nextUsers);
    } catch (error) {
      notify.error(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los usuarios.",
      );
    } finally {
      setLoading(false);
    }
    if (organization) {
      try {
        const nextMembers = await request<Member[]>(
          `/api/organizations/${encodeURIComponent(organization.id)}/members`,
        );
        setMembers(
          nextMembers.filter(
            (member) => member.status === "active" && member.userId,
          ),
        );
      } catch (error) {
        notify.error(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las personas de la organización.",
        );
      }
    }
    try {
      if (can("roles.manage"))
        setPolicy(await request<Policy>("/api/security/policy"));
    } catch (error) {
      notify.error(
        error instanceof Error
          ? error.message
          : "No se pudo cargar la política de credenciales.",
      );
    }
  }, [organization, can]);
  useEffect(() => {
    if (state === "allowed") void load();
  }, [load, state]);
  const saveUser = async () => {
    setSaving(true);
    try {
      const body = editing
        ? {
            expectedVersion: editing.version,
            displayName: draft.displayName || undefined,
            administrativePriority: Number(draft.priority),
            allowedCompanyIds: draft.companyIds,
          }
        : {
            userId: draft.userId,
            displayName: draft.displayName || undefined,
            administrativePriority: Number(draft.priority),
            allowedCompanyIds: draft.companyIds,
          };
      await request<User>(
        editing
          ? `/api/security/users/${encodeURIComponent(editing.userId)}`
          : "/api/security/users",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      setDraft({ userId: "", displayName: "", priority: "0", companyIds: [] });
      setEditing(null);
      await load();
      notify.success("Usuario de seguridad guardado.");
    } catch (error) {
      notify.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el usuario.",
      );
    } finally {
      setSaving(false);
    }
  };
  const savePolicy = async () => {
    if (!policy) return;
    try {
      const next = await request<Policy>("/api/security/policy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: policy.version,
          policy: policy.policy,
        }),
      });
      setPolicy(next);
      notify.success("Política de seguridad actualizada.");
    } catch (error) {
      notify.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la política.",
      );
    }
  };
  const grantAction = async (method: "POST" | "DELETE" | "HAS") => {
    try {
      const target = { kind: grant.targetKind, id: grant.targetId };
      const payload = {
        membershipId: grant.membershipId,
        permissionCode: grant.permissionCode,
        target,
        companyId: grant.companyId || undefined,
      };
      if (method === "HAS") {
        const result = await request<{ granted: boolean }>(
          "/api/security/scoped-grants/has",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              permissionCode: grant.permissionCode,
              target,
              companyId: grant.companyId || undefined,
            }),
          },
        );
        notify.success(
          result.granted
            ? "El permiso está concedido."
            : "El permiso no está concedido.",
        );
      } else {
        const response = await apiFetch("/api/security/scoped-grants", {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const value = (await response.json()) as { error?: string };
          throw new Error(value.error ?? "No se pudo actualizar el permiso.");
        }
        notify.success(
          method === "POST" ? "Permiso concedido." : "Permiso revocado.",
        );
      }
    } catch (error) {
      notify.error(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el permiso.",
      );
    }
  };
  if (state !== "allowed")
    return (
      <div className="py-8 text-sm text-[var(--text-tertiary)]">
        Verificando acceso…
      </div>
    );
  return (
    <div className="space-y-6">
      <SettingsSection
        title="Usuarios autorizados"
        subtitle="Define prioridad administrativa y empresas permitidas. Los usuarios existentes conservan su acceso hasta ser configurados."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <label className="font-mono text-xs uppercase text-[var(--text-tertiary)]">
            Persona
            <select
              className="mt-1 block h-10 w-full rounded-lg border border-border-default bg-surface-1 px-3 font-sans text-sm text-foreground"
              value={draft.userId}
              disabled={!!editing}
              onChange={(event) => {
                const selected = members.find(
                  (member) => member.userId === event.target.value,
                );
                setDraft({
                  ...draft,
                  userId: event.target.value,
                  displayName: selected?.email ?? draft.displayName,
                });
              }}
            >
              <option value="">Selecciona una persona</option>
              {members.map((member) => (
                <option key={member.id} value={member.userId ?? ""}>
                  {member.email}
                </option>
              ))}
            </select>
          </label>
          <BaseInput.Field
            label="Nombre visible"
            value={draft.displayName}
            onValueChange={(displayName) => setDraft({ ...draft, displayName })}
          />
          <BaseInput.Field
            label="Prioridad administrativa"
            type="number"
            value={draft.priority}
            onValueChange={(priority) => setDraft({ ...draft, priority })}
          />
        </div>
        <fieldset className="mt-4">
          <legend className="font-mono text-xs uppercase text-[var(--text-tertiary)]">
            Empresas permitidas
          </legend>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Selecciona las empresas a las que tendrá acceso. Si no seleccionas
            ninguna, no podrá operar en empresas.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {companies.map((company) => (
              <label
                key={company.id}
                className="flex items-center gap-2 rounded-lg border border-border-light px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={draft.companyIds.includes(company.id)}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      companyIds: draft.companyIds.includes(company.id)
                        ? draft.companyIds.filter((id) => id !== company.id)
                        : [...draft.companyIds, company.id],
                    })
                  }
                />
                {company.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BaseButton.Root
            size="sm"
            onPress={saveUser}
            loading={saving}
            isDisabled={!can("members.update") || (!editing && !draft.userId)}
          >
            {editing ? "Guardar cambios" : "Guardar usuario"}
          </BaseButton.Root>
          {editing && (
            <BaseButton.Root
              size="sm"
              variant="outline"
              onPress={() => {
                setEditing(null);
                setDraft({
                  userId: "",
                  displayName: "",
                  priority: "0",
                  companyIds: [],
                });
              }}
            >
              Cancelar edición
            </BaseButton.Root>
          )}
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-[var(--text-tertiary)]">
              <tr>
                <th className="pb-2">Usuario</th>
                <th>Prioridad</th>
                <th>Empresas</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>Cargando…</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.userId}
                    className="border-t border-border-light"
                  >
                    <td className="py-3">
                      <p>{user.displayName ?? user.email}</p>
                    </td>
                    <td>{user.administrativePriority}</td>
                    <td>
                      {user.allowedCompanyIds.length === 0
                        ? "Sin empresas permitidas"
                        : user.allowedCompanyIds
                            .map(
                              (id) =>
                                companies.find((company) => company.id === id)
                                  ?.name ?? id,
                            )
                            .join(", ")}
                    </td>
                    <td>{user.status}</td>
                    <td>
                      <div className="flex gap-1">
                        <BaseButton.Root
                          size="sm"
                          variant="outline"
                          onPress={() => {
                            setEditing(user);
                            setDraft({
                              userId: user.userId,
                              displayName: user.displayName ?? "",
                              priority: String(user.administrativePriority),
                              companyIds: user.allowedCompanyIds,
                            });
                          }}
                          isDisabled={!can("members.update")}
                        >
                          Editar
                        </BaseButton.Root>
                        <BaseButton.Root
                          size="sm"
                          variant="outline"
                          onPress={async () => {
                            try {
                              await request<unknown>(
                                `/api/security/users/${encodeURIComponent(user.userId)}/unlock`,
                                { method: "POST" },
                              );
                              notify.success("Cuenta desbloqueada.");
                            } catch (error) {
                              notify.error(
                                error instanceof Error
                                  ? error.message
                                  : "No se pudo desbloquear.",
                              );
                            }
                          }}
                          isDisabled={!can("members.update")}
                        >
                          Desbloquear
                        </BaseButton.Root>
                        <BaseButton.Root
                          size="sm"
                          variant="dangerOutline"
                          onPress={async () => {
                            try {
                              const response = await apiFetch(
                                `/api/security/users/${encodeURIComponent(user.userId)}`,
                                {
                                  method: "DELETE",
                                  headers: {
                                    "content-type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    expectedVersion: user.version,
                                  }),
                                },
                              );
                              if (!response.ok) {
                                const value = (await response.json()) as {
                                  error?: string;
                                };
                                throw new Error(
                                  value.error ?? "No se pudo revocar.",
                                );
                              }
                              await load();
                              notify.success("Usuario revocado.");
                            } catch (error) {
                              notify.error(
                                error instanceof Error
                                  ? error.message
                                  : "No se pudo revocar.",
                              );
                            }
                          }}
                          isDisabled={!can("members.update")}
                        >
                          Revocar
                        </BaseButton.Root>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SettingsSection>
      {policy && (
        <SettingsSection
          title="Política de credenciales"
          subtitle="Controla vencimiento de contraseña, inactividad e intentos fallidos."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <NumberField
              label="Días contraseña"
              nullable
              value={policy.policy.passwordMaximumAgeDays}
              onChange={(passwordMaximumAgeDays) =>
                setPolicy({
                  ...policy,
                  policy: { ...policy.policy, passwordMaximumAgeDays },
                })
              }
            />
            <NumberField
              label="Días inactividad"
              nullable
              value={policy.policy.inactivityMaximumDays}
              onChange={(inactivityMaximumDays) =>
                setPolicy({
                  ...policy,
                  policy: { ...policy.policy, inactivityMaximumDays },
                })
              }
            />
            <NumberField
              label="Intentos"
              value={policy.policy.failedAttemptLimit}
              onChange={(failedAttemptLimit) =>
                setPolicy({
                  ...policy,
                  policy: {
                    ...policy.policy,
                    failedAttemptLimit: failedAttemptLimit ?? 1,
                  },
                })
              }
            />
            <NumberField
              label="Ventana (min)"
              value={policy.policy.failedAttemptWindowMinutes}
              onChange={(failedAttemptWindowMinutes) =>
                setPolicy({
                  ...policy,
                  policy: {
                    ...policy.policy,
                    failedAttemptWindowMinutes: failedAttemptWindowMinutes ?? 1,
                  },
                })
              }
            />
            <NumberField
              label="Bloqueo (min)"
              value={policy.policy.lockoutMinutes}
              onChange={(lockoutMinutes) =>
                setPolicy({
                  ...policy,
                  policy: {
                    ...policy.policy,
                    lockoutMinutes: lockoutMinutes ?? 1,
                  },
                })
              }
            />
          </div>
          <div className="mt-3">
            <BaseButton.Root
              size="sm"
              onPress={savePolicy}
              isDisabled={!can("roles.manage")}
            >
              Guardar política
            </BaseButton.Root>
          </div>
        </SettingsSection>
      )}
      <SettingsSection
        title="Permisos específicos"
        subtitle="Concede, revoca o verifica un permiso sobre un recurso concreto."
      >
        <div className="grid gap-3 md:grid-cols-5">
          <label className="font-mono text-xs uppercase text-[var(--text-tertiary)]">
            Persona
            <select
              className="mt-1 block h-10 w-full rounded-lg border border-border-default bg-surface-1 px-3 font-sans text-sm text-foreground"
              value={grant.membershipId}
              onChange={(event) =>
                setGrant({ ...grant, membershipId: event.target.value })
              }
            >
              <option value="">Selecciona una persona</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.email}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Categoría
            <select
              className="mt-1 h-10 w-full rounded-lg border border-border-default bg-surface-1 px-3"
              value={grant.targetKind}
              onChange={(event) => {
                const category = grantCategories.find(
                  (value) => value.kind === event.target.value,
                );
                if (category)
                  setGrant({
                    ...grant,
                    targetKind: category.kind,
                    permissionCode: category.permission,
                    targetId: category.example,
                  });
              }}
            >
              <option value="">Selecciona una categoría</option>
              {grantCategories.map((category) => (
                <option key={category.kind} value={category.kind}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <BaseInput.Field
            label="Recurso"
            helperText={
              grantCategories.find((value) => value.kind === grant.targetKind)
                ?.hint ?? "Selecciona primero una categoría"
            }
            value={grant.targetId}
            onValueChange={(targetId) => setGrant({ ...grant, targetId })}
          />
          <label className="font-mono text-xs uppercase text-[var(--text-tertiary)]">
            Empresa
            <select
              className="mt-1 block h-10 w-full rounded-lg border border-border-default bg-surface-1 px-3 font-sans text-sm text-foreground"
              value={grant.companyId}
              onChange={(event) =>
                setGrant({ ...grant, companyId: event.target.value })
              }
            >
              <option value="">Toda la organización</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <BaseButton.Root
            size="sm"
            onPress={() => grantAction("POST")}
            isDisabled={!can("roles.manage") || !grant.membershipId}
          >
            Conceder
          </BaseButton.Root>
          <BaseButton.Root
            size="sm"
            variant="dangerOutline"
            onPress={() => grantAction("DELETE")}
            isDisabled={!can("roles.manage") || !grant.membershipId}
          >
            Revocar
          </BaseButton.Root>
          <BaseButton.Root
            size="sm"
            variant="outline"
            onPress={() => grantAction("HAS")}
          >
            Verificar mi acceso
          </BaseButton.Root>
        </div>
      </SettingsSection>
    </div>
  );
}

/** Renders a company-scoped immutable operational audit trail. */
function AuditConsolePanel(): React.JSX.Element {
  const { companyId } = useCompany();
  const { state } = useOrganizationModuleAccess("/settings/audit");
  const [loadedPage, setLoadedPage] = useState<{ key: string; page: AuditPage } | null>(null);
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [actions, setActions] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const queryRunner = useRef<DebouncedQuery<AuditQuery, AuditPage> | null>(null);
  if (queryRunner.current == null) {
    queryRunner.current = new DebouncedQuery(
      (filters) => {
        const query = new URLSearchParams({ companyId: filters.companyId, offset: String(filters.offset), limit: "50" });
        if (filters.entityType) query.set("entityType", filters.entityType);
        if (filters.entityId.trim()) query.set("entityId", filters.entityId.trim());
        if (filters.actions) query.set("actions", filters.actions);
        const controller = new AbortController();
        return { result: request<AuditPage>(`/api/security/audit?${query}`, { signal: controller.signal }), cancel: () => controller.abort() };
      },
      { schedule: (callback, delay) => window.setTimeout(callback, delay), cancel: (handle) => window.clearTimeout(handle as number) },
    );
  }
  const filterKey = JSON.stringify({ companyId, entityType, entityId: entityId.trim(), actions });
  const page = loadedPage?.key === filterKey ? loadedPage.page : null;
  const load = useCallback(async (offset = 0, immediate = false) => {
    if (!companyId || !queryRunner.current) return;
    const result = await (immediate
      ? queryRunner.current.runImmediately({ companyId, entityType, entityId, actions, offset })
      : queryRunner.current.schedule({ companyId, entityType, entityId, actions, offset }));
    if (result.status === "completed") setLoadedPage({ key: filterKey, page: result.value });
    else if (result.status === "failed") notify.error(
      result.error instanceof Error ? result.error.message : "No se pudo cargar la auditoría.",
      { deduplicationKey: "security:audit:query" },
    );
  }, [actions, companyId, entityId, entityType, filterKey]);
  useEffect(() => {
    if (state !== "allowed") return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      queryRunner.current?.cancel();
    };
  }, [load, state]);
  useEffect(() => () => queryRunner.current?.cancel(), []);
  if (state !== "allowed")
    return (
      <div className="py-8 text-sm text-[var(--text-tertiary)]">
        Verificando acceso…
      </div>
    );
  return (
    <SettingsSection
      title="Auditoría operativa"
      subtitle="Hechos inmutables de la empresa seleccionada."
    >
      <div className="grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-sm">
          Tipo
          <select className="h-10 rounded-md border border-border-light bg-surface-1 px-3" value={entityType} onChange={(event) => setEntityType(event.target.value)}>
            <option value="">Todos</option>
            {AUDITED_ENTITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <BaseInput.Field
          label="ID de entidad"
          value={entityId}
          onValueChange={setEntityId}
        />
        <label className="grid gap-1 text-sm">
          Acción
          <select className="h-10 rounded-md border border-border-light bg-surface-1 px-3" value={actions} onChange={(event) => setActions(event.target.value)}>
            <option value="">Todas</option>
            {AUDIT_ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <BaseButton.Root size="sm" onPress={() => void load(0, true)}>
            Filtrar
          </BaseButton.Root>
        </div>
      </div>
      {!companyId ? (
        <p className="mt-5 text-sm text-[var(--text-tertiary)]">
          Selecciona una empresa para consultar su auditoría.
        </p>
      ) : (
        <>
          <div className="mt-5 space-y-2">
            {page?.entries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-lg border border-border-light p-3"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setOpen(open === entry.id ? null : entry.id)}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>
                      {entry.entityType} · {entry.action}
                    </strong>
                    <time className="font-mono text-xs text-[var(--text-tertiary)]">
                      {new Date(entry.context.occurredAt).toLocaleString(
                        "es-VE",
                      )}
                    </time>
                  </div>
                  <p className="mt-1 font-mono text-xs text-[var(--text-tertiary)]">
                    {entry.entityId} · actor:{" "}
                    {entry.context.actorId ?? "sistema"}
                  </p>
                </button>
                {open === entry.id && (
                  <pre className="mt-3 max-h-72 overflow-auto rounded bg-surface-2 p-3 text-xs">
                    {JSON.stringify(
                      {
                        antes: entry.before,
                        después: entry.after,
                        sucursal: entry.context.branchId,
                        dispositivo: entry.context.deviceId,
                      },
                      null,
                      2,
                    )}
                  </pre>
                )}
              </article>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <BaseButton.Root
              size="sm"
              variant="outline"
              onPress={() => void load(Math.max(0, (page?.offset ?? 0) - 50), true)}
              isDisabled={!page || page.offset === 0}
            >
              Anterior
            </BaseButton.Root>
            <span className="text-xs text-[var(--text-tertiary)]">
              {page
                ? `${page.offset + 1}-${Math.min(page.offset + page.entries.length, page.total)} de ${page.total}`
                : "Cargando…"}
            </span>
            <BaseButton.Root
              size="sm"
              variant="outline"
              onPress={() => void load((page?.offset ?? 0) + 50, true)}
              isDisabled={
                !page || page.offset + page.entries.length >= page.total
              }
            >
              Siguiente
            </BaseButton.Root>
          </div>
        </>
      )}
    </SettingsSection>
  );
}

/** Creates and administers a payment-order draft by its identifier. */
function PaymentOrdersConsolePanel(): React.JSX.Element {
  const { companyId } = useCompany();
  const { state, can } = useOrganizationModuleAccess(
    "/settings/payment-orders",
  );
  const [order, setOrder] = useState<Order | null>(null);
  const [orders, setOrders] = useState<OrderPage | null>(null);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({
    beneficiary: "",
    concept: "",
    amount: "",
    currency: "VES",
    dueDate: "",
  });
  const [busy, setBusy] = useState(false);
  const activeCompany = useRef(companyId);
  useEffect(() => {
    activeCompany.current = companyId;
    const timer = window.setTimeout(() => {
      setOrder(null);
      setOrders(null);
      setId(crypto.randomUUID());
      setForm({
        beneficiary: "",
        concept: "",
        amount: "",
        currency: "VES",
        dueDate: "",
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [companyId]);
  const list = async (offset = 0) => {
    if (!companyId) return;
    try {
      setBusy(true);
      const next = await request<OrderPage>(
        `/api/security/payment-orders?companyId=${encodeURIComponent(companyId)}&offset=${offset}&limit=20`,
      );
      if (activeCompany.current === companyId) setOrders(next);
    } catch (error) {
      notify.error(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las órdenes.",
      );
    } finally {
      if (activeCompany.current === companyId) setBusy(false);
    }
  };
  const mutate = async (action: "create" | "update" | "cancel" | "delete") => {
    if (!companyId || !id) return;
    try {
      setBusy(true);
      const path =
        action === "create"
          ? "/api/security/payment-orders"
          : `/api/security/payment-orders/${encodeURIComponent(id)}${action === "cancel" ? "/cancel" : ""}`;
      const method =
        action === "create"
          ? "POST"
          : action === "update"
            ? "PATCH"
            : action === "cancel"
              ? "POST"
              : "DELETE";
      const versioned = { companyId, expectedVersion: order?.version };
      const body =
        action === "create"
          ? { companyId, id, ...form, dueDate: form.dueDate || null }
          : action === "update"
            ? { ...versioned, ...form, dueDate: form.dueDate || null }
            : versioned;
      if (action === "delete") {
        const response = await apiFetch(path, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const value = (await response.json()) as { error?: string };
          throw new Error(value.error ?? "No se pudo eliminar la orden.");
        }
        setOrder(null);
        setForm({
          beneficiary: "",
          concept: "",
          amount: "",
          currency: "VES",
          dueDate: "",
        });
        setId(crypto.randomUUID());
        await list();
        notify.success("Orden eliminada.");
        return;
      }
      const next = await request<Order>(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setOrder(next);
      await list();
      notify.success(
        action === "create"
          ? "Borrador creado."
          : action === "cancel"
            ? "Orden anulada."
            : "Orden actualizada.",
      );
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "No se pudo guardar la orden.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (state !== "allowed")
    return (
      <div className="py-8 text-sm text-[var(--text-tertiary)]">
        Verificando acceso…
      </div>
    );
  return (
    <SettingsSection
      title="Órdenes de pago"
      subtitle="Registra borradores administrativos. Esta pantalla no ejecuta transferencias."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <BaseInput.Field
          label="Referencia de orden"
          helperText="Se genera automáticamente"
          value={id}
          isReadOnly
        />
        <BaseInput.Field
          label="Beneficiario"
          value={form.beneficiary}
          onValueChange={(beneficiary) => setForm({ ...form, beneficiary })}
        />
        <BaseInput.Field
          label="Concepto"
          value={form.concept}
          onValueChange={(concept) => setForm({ ...form, concept })}
        />
        <BaseInput.Field
          label="Monto"
          prefix={form.currency}
          value={form.amount}
          onValueChange={(amount) => setForm({ ...form, amount })}
        />
        <BaseInput.Field
          label="Moneda"
          value={form.currency}
          onValueChange={(currency) =>
            setForm({ ...form, currency: currency.toUpperCase() })
          }
        />
        <BaseInput.Field
          label="Vencimiento"
          type="date"
          value={form.dueDate}
          onValueChange={(dueDate) => setForm({ ...form, dueDate })}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <BaseButton.Root
          size="sm"
          variant="outline"
          onPress={() => list()}
          loading={busy}
          isDisabled={!companyId || !can("payment_orders.read")}
        >
          Ver órdenes
        </BaseButton.Root>
        {order && (
          <BaseButton.Root
            size="sm"
            variant="outline"
            isDisabled={busy}
            onPress={() => {
              setOrder(null);
              setId(crypto.randomUUID());
              setForm({
                beneficiary: "",
                concept: "",
                amount: "",
                currency: "VES",
                dueDate: "",
              });
            }}
          >
            Nuevo borrador
          </BaseButton.Root>
        )}
        <BaseButton.Root
          size="sm"
          onPress={() => mutate(order ? "update" : "create")}
          loading={busy}
          isDisabled={
            !companyId ||
            !(order
              ? can("payment_orders.update")
              : can("payment_orders.create"))
          }
        >
          {order ? "Guardar cambios" : "Crear borrador"}
        </BaseButton.Root>
        {order?.status === "draft" && (
          <>
            <BaseButton.Root
              size="sm"
              variant="dangerOutline"
              onPress={() => mutate("cancel")}
              loading={busy}
              isDisabled={!can("payment_orders.void")}
            >
              Anular
            </BaseButton.Root>
            <BaseButton.Root
              size="sm"
              variant="dangerOutline"
              onPress={() => mutate("delete")}
              loading={busy}
              isDisabled={!can("payment_orders.delete")}
            >
              Eliminar
            </BaseButton.Root>
          </>
        )}
      </div>
      {orders && (
        <div className="mt-5 divide-y divide-border-light rounded-lg border border-border-light">
          {orders.entries.length === 0 ? (
            <p className="p-4 text-sm text-[var(--text-tertiary)]">
              Aún no hay órdenes para esta empresa.
            </p>
          ) : (
            orders.entries.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  setId(item.id);
                  setOrder(item);
                  setForm({
                    beneficiary: item.beneficiary,
                    concept: item.concept,
                    amount: item.amount,
                    currency: item.currency,
                    dueDate: item.dueDate ?? "",
                  });
                }}
              >
                <span>
                  <strong>{item.beneficiary}</strong>
                  <span className="block text-xs text-[var(--text-tertiary)]">
                    {item.concept}
                  </span>
                </span>
                <span className="font-mono text-xs">
                  {item.amount} {item.currency} · {item.status}
                </span>
              </button>
            ))
          )}
          <div className="flex items-center justify-between p-3">
            <BaseButton.Root
              size="sm"
              variant="outline"
              onPress={() => list(Math.max(0, orders.offset - orders.limit))}
              isDisabled={busy || orders.offset === 0}
            >
              Anterior
            </BaseButton.Root>
            <span className="text-xs text-[var(--text-tertiary)]">
              {orders.offset + 1}-
              {Math.min(orders.offset + orders.entries.length, orders.total)} de{" "}
              {orders.total}
            </span>
            <BaseButton.Root
              size="sm"
              variant="outline"
              onPress={() => list(orders.offset + orders.limit)}
              isDisabled={
                busy || orders.offset + orders.entries.length >= orders.total
              }
            >
              Siguiente
            </BaseButton.Root>
          </div>
        </div>
      )}
      {order && (
        <p className="mt-4 text-sm text-[var(--text-tertiary)]">
          Estado: <strong>{order.status}</strong> · versión {order.version}
        </p>
      )}
      {!companyId && (
        <p className="mt-4 text-sm text-[var(--text-tertiary)]">
          Selecciona una empresa para administrar órdenes.
        </p>
      )}
    </SettingsSection>
  );
}

/**
 * Renders an isolated administration screen for the selected organization and company.
 * @returns The authorized administration panel; changing scope resets pending UI state.
 * @throws Never; request failures are presented in the panel.
 */
export function SecurityConsole(): React.JSX.Element {
  const { organization } = useOrganization();
  return <SecurityConsolePanel key={organization?.id ?? "none"} />;
}

/**
 * Renders an isolated administration screen for the selected organization and company.
 * @returns The authorized administration panel; changing scope resets pending UI state.
 * @throws Never; request failures are presented in the panel.
 */
export function AuditConsole(): React.JSX.Element {
  const { organization } = useOrganization();
  const { companyId } = useCompany();
  return (
    <AuditConsolePanel
      key={`${organization?.id ?? "none"}:${companyId ?? "none"}`}
    />
  );
}

/**
 * Renders an isolated administration screen for the selected organization and company.
 * @returns The authorized administration panel; changing scope resets pending UI state.
 * @throws Never; request failures are presented in the panel.
 */
export function PaymentOrdersConsole(): React.JSX.Element {
  const { organization } = useOrganization();
  const { companyId } = useCompany();
  return (
    <PaymentOrdersConsolePanel
      key={`${organization?.id ?? "none"}:${companyId ?? "none"}`}
    />
  );
}

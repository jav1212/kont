import { requirePermission, withTenant } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

const EDITABLE_ROLES = ["admin", "contador", "vendedor", "cajero"] as const;
type EditableRole = typeof EDITABLE_ROLES[number];

const ROLE_LABELS: Record<string, string> = {
    owner: "Dueño",
    admin: "Administrador",
    contador: "Contador",
    vendedor: "Vendedor",
    cajero: "Cajero",
};

export const GET = withTenant(async (req, tenant) => {
    await requirePermission(tenant, "members.read", { req });
    const source = new ServerSupabaseSource().instance;

    const [{ data: permissions, error: permissionsError }, { data: assignments, error: assignmentsError }] = await Promise.all([
        source.from("shared_authorization_permissions").select("code, resource, action, description").order("resource").order("action"),
        source.from("shared_authorization_role_permissions").select("role, permission_code"),
    ]);

    if (permissionsError || assignmentsError) {
        return Response.json({ error: permissionsError?.message ?? assignmentsError?.message }, { status: 500 });
    }

    const assignmentMap: Record<string, string[]> = {};
    for (const row of (assignments ?? []) as Array<{ role: string; permission_code: string }>) {
        assignmentMap[row.role] ??= [];
        assignmentMap[row.role].push(row.permission_code);
    }

    const permissionCodes = ((permissions ?? []) as Array<{ code: string }>).map((permission) => permission.code);
    const roles = ["owner", ...EDITABLE_ROLES].map((role) => ({
        id: role,
        name: ROLE_LABELS[role],
        description: role === "owner"
            ? "Acceso total y control de la empresa."
            : role === "admin"
                ? "Gestiona la operación y los accesos del equipo."
                : role === "contador"
                    ? "Gestiona contabilidad, nómina y reportes."
                    : role === "vendedor"
                        ? "Opera ventas y consulta inventario."
                        : "Opera ventas en caja.",
        locked: role === "owner",
        permissions: role === "owner" ? permissionCodes : assignmentMap[role] ?? [],
    }));

    return Response.json({ data: { roles, permissions: permissions ?? [] } });
});

export const PATCH = withTenant(async (req, tenant) => {
    await requirePermission(tenant, "members.update", { req, auditAllow: true });

    let body: { role?: string; permissions?: unknown };
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Formato JSON inválido" }, { status: 400 });
    }

    if (!body.role || !EDITABLE_ROLES.includes(body.role as EditableRole)) {
        return Response.json({ error: "El rol no se puede editar" }, { status: 400 });
    }
    if (!Array.isArray(body.permissions) || !body.permissions.every((value) => typeof value === "string")) {
        return Response.json({ error: "permissions debe ser una lista de códigos" }, { status: 400 });
    }

    const source = new ServerSupabaseSource().instance;
    const requested = [...new Set(body.permissions as string[])];
    const { data: validPermissions, error: validError } = await source
        .from("shared_authorization_permissions")
        .select("code")
        .in("code", requested);

    if (validError) return Response.json({ error: validError.message }, { status: 500 });
    if ((validPermissions ?? []).length !== requested.length) {
        return Response.json({ error: "La lista contiene permisos inválidos" }, { status: 400 });
    }

    const { error: deleteError } = await source
        .from("shared_authorization_role_permissions")
        .delete()
        .eq("role", body.role);
    if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

    if (requested.length > 0) {
        const { error: insertError } = await source
            .from("shared_authorization_role_permissions")
            .insert(requested.map((permission_code) => ({ role: body.role, permission_code })));
        if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
    }

    return Response.json({ data: { role: body.role, permissions: requested } });
});

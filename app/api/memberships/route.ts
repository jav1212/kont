import { requireTenant } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/**
 * GET /api/memberships
 * Lista todos los tenants donde el caller es miembro activo (incluyendo el propio).
 * No usa withTenant() — solo necesita auth.
 */
export async function GET(req: Request) {
    let userId: string;
    try {
        const tenant = await requireTenant();
        userId = tenant.userId;
    } catch {
        return Response.json({ error: "No autenticado" }, { status: 401 });
    }

    const server = new ServerSupabaseSource();

    const { data, error } = await server.instance
        .from("tenant_memberships")
        .select(`
            tenant_id,
            role,
            accepted_at
        `)
        .eq("member_id", userId)
        .not("accepted_at", "is", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: true });

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    // Fetch tenant emails from auth.users via admin API
    const tenantIds = (data ?? []).map((row: any) => row.tenant_id as string);

    // Get user emails for each tenant_id (tenant_id = auth.uid() of owner)
    const emailMap: Record<string, string> = {};
    for (const tenantId of tenantIds) {
        const { data: userData } = await server.instance.auth.admin.getUserById(tenantId);
        if (userData?.user?.email) {
            emailMap[tenantId] = userData.user.email;
        }
    }

    const result = (data ?? []).map((row: any) => ({
        tenantId:    row.tenant_id,
        role:        row.role,
        tenantEmail: emailMap[row.tenant_id] ?? row.tenant_id,
        isOwn:       row.tenant_id === userId,
    }));

    // Sort: own first, then by tenantEmail
    result.sort((a: any, b: any) => {
        if (a.isOwn && !b.isOwn) return -1;
        if (!a.isOwn && b.isOwn) return 1;
        return a.tenantEmail.localeCompare(b.tenantEmail);
    });

    return Response.json({ data: result });
}

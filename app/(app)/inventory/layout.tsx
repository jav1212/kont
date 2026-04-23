import { redirect } from "next/navigation";
import { DesktopOnlyGuard } from "@/src/shared/frontend/components/desktop-only-guard";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import {
    requireTenant,
    TenantAuthError,
    TenantForbiddenError,
} from "@/src/shared/backend/utils/require-tenant";

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
    // Resolve the tenant to query against. For owners: their own userId.
    // For invited admins/contables with no own tenant: the first accepted
    // membership (the tenant that invited them). This mirrors the API
    // authorization path so module gating follows the same "acts on behalf"
    // semantics as the rest of the app.
    let tenantId: string;
    try {
        const ctx = await requireTenant();
        tenantId = ctx.actingAs?.ownerId ?? ctx.userId;
    } catch (err) {
        if (err instanceof TenantAuthError)     redirect("/sign-in");
        if (err instanceof TenantForbiddenError) redirect("/sign-in");
        throw err;
    }

    const adminClient = new ServerSupabaseSource().instance;
    const { data: sub } = await adminClient
        .from("tenant_subscriptions")
        .select("status, products!inner(slug)")
        .eq("tenant_id", tenantId)
        .eq("products.slug", "inventory")
        .single();

    const hasAccess = sub?.status === "active" || sub?.status === "trial";
    if (!hasAccess) redirect("/settings/billing");

    return <DesktopOnlyGuard>{children}</DesktopOnlyGuard>;
}

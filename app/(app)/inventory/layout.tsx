import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DesktopOnlyGuard } from "@/src/shared/frontend/components/desktop-only-guard";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: () => {},
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/sign-in");

    const adminClient = new ServerSupabaseSource().instance;
    const { data: sub } = await adminClient
        .from("tenant_subscriptions")
        .select("status, products!inner(slug)")
        .eq("tenant_id", user.id)
        .eq("products.slug", "inventory")
        .single();

    const hasAccess = sub?.status === "active" || sub?.status === "trial";
    if (!hasAccess) redirect("/settings/billing");

    return <DesktopOnlyGuard>{children}</DesktopOnlyGuard>;
}

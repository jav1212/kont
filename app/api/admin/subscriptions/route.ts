import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/src/shared/backend/utils/require-admin';

function serviceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

/**
 * GET /api/admin/subscriptions
 * Lists all tenant_subscriptions with product, plan, and tenant email.
 */
export async function GET(req: Request) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const supabase = serviceClient();

    const { data, error } = await supabase
        .from('tenant_subscriptions')
        .select(`
            id, tenant_id, status, billing_cycle,
            current_period_start, current_period_end, last_payment_at, created_at,
            products ( id, slug, name ),
            plans ( id, name, price_monthly_usd )
        `)
        .order('created_at', { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Fetch tenant emails from auth.users via RPC or admin API
    const tenantIds = [...new Set((data ?? []).map((r) => r.tenant_id))];
    let emailMap: Record<string, string> = {};

    if (tenantIds.length > 0) {
        const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        if (users?.users) {
            users.users.forEach((u) => { emailMap[u.id] = u.email ?? ''; });
        }
    }

    const subscriptions = (data ?? []).map((row) => {
        const product = Array.isArray(row.products) ? row.products[0] : row.products;
        const plan    = Array.isArray(row.plans)    ? row.plans[0]    : row.plans;
        return {
            id:                 row.id,
            tenantId:           row.tenant_id,
            tenantEmail:        emailMap[row.tenant_id] ?? null,
            status:             row.status,
            billingCycle:       row.billing_cycle,
            currentPeriodStart: row.current_period_start,
            currentPeriodEnd:   row.current_period_end,
            lastPaymentAt:      row.last_payment_at,
            createdAt:          row.created_at,
            product: product ? { id: product.id, slug: product.slug, name: product.name } : null,
            plan:    plan    ? { id: plan.id, name: plan.name, priceMonthlyUsd: plan.price_monthly_usd } : null,
        };
    });

    return Response.json({ data: subscriptions });
}

/**
 * POST /api/admin/subscriptions
 * Creates a new module subscription for a tenant.
 * Body: { tenantId, productSlug, status?, planId?, billingCycle? }
 */
export async function POST(req: Request) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    try {
        const body = await req.json();
        const { tenantId, productSlug, status = 'trial', planId, billingCycle } = body;

        if (!tenantId || !productSlug) {
            return Response.json({ error: 'tenantId y productSlug son requeridos' }, { status: 400 });
        }

        const supabase = serviceClient();

        // Resolve product id
        const { data: product, error: productErr } = await supabase
            .from('products')
            .select('id')
            .eq('slug', productSlug)
            .single();

        if (productErr || !product) {
            return Response.json({ error: 'Producto no encontrado' }, { status: 404 });
        }

        const insert: Record<string, unknown> = {
            tenant_id:  tenantId,
            product_id: product.id,
            status,
        };
        if (planId)       insert.plan_id       = planId;
        if (billingCycle) insert.billing_cycle = billingCycle;

        const { data, error } = await supabase
            .from('tenant_subscriptions')
            .insert(insert)
            .select()
            .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ data }, { status: 201 });
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }
}

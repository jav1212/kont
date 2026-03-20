import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /api/billing/subscriptions
 * Returns all module subscriptions for the current tenant.
 */
export async function GET() {
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data, error } = await supabase
        .from('tenant_subscriptions')
        .select(`
            id, status, billing_cycle,
            current_period_start, current_period_end, last_payment_at,
            products ( id, slug, name, description ),
            plans ( id, name, price_monthly_usd, price_quarterly_usd, price_annual_usd,
                    max_companies, max_employees_per_company )
        `)
        .eq('tenant_id', user.id);

    if (error) {
        return Response.json({ error: 'Error al cargar suscripciones' }, { status: 500 });
    }

    const subscriptions = (data ?? []).map((row) => {
        const product = Array.isArray(row.products) ? row.products[0] : row.products;
        const plan    = Array.isArray(row.plans)    ? row.plans[0]    : row.plans;
        return {
            id:                 row.id,
            status:             row.status,
            billingCycle:       row.billing_cycle,
            currentPeriodStart: row.current_period_start,
            currentPeriodEnd:   row.current_period_end,
            lastPaymentAt:      row.last_payment_at,
            product: product ? {
                id:          product.id,
                slug:        product.slug,
                name:        product.name,
                description: product.description,
            } : null,
            plan: plan ? {
                id:                     plan.id,
                name:                   plan.name,
                priceMonthlyUsd:        plan.price_monthly_usd,
                priceQuarterlyUsd:      plan.price_quarterly_usd,
                priceAnnualUsd:         plan.price_annual_usd,
                maxCompanies:           plan.max_companies,
                maxEmployeesPerCompany: plan.max_employees_per_company,
            } : null,
        };
    });

    return Response.json({ data: subscriptions });
}

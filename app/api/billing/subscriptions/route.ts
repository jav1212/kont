import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';

/**
 * GET /api/billing/subscriptions
 * Devuelve las suscripciones del tenant activo.
 * Si el usuario actúa en nombre de otro tenant (admin/contable),
 * devuelve las suscripciones de ese tenant, no las del usuario logueado.
 */
export const GET = withTenant(async (_req, { userId, actingAs }) => {
    const tenantId = actingAs?.ownerId ?? userId;

    const server = new ServerSupabaseSource();

    const { data, error } = await server.instance
        .from('tenant_subscriptions')
        .select(`
            id, status, billing_cycle,
            current_period_start, current_period_end, last_payment_at,
            products ( id, slug, name, description ),
            plans ( id, name, price_monthly_usd, price_quarterly_usd, price_annual_usd,
                    max_companies, max_employees_per_company )
        `)
        .eq('tenant_id', tenantId);

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
});

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /api/billing/tenant
 * Devuelve el tenant actual con plan, estado y período de facturación.
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
        .from('tenants')
        .select(`
            id, status, schema_name, billing_cycle,
            current_period_start, current_period_end, last_payment_at, created_at,
            plans (
                id, name, max_companies, max_employees_per_company,
                price_monthly_usd, price_quarterly_usd, price_annual_usd
            )
        `)
        .eq('id', user.id)
        .single();

    if (error || !data) {
        return Response.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const plan = Array.isArray(data.plans) ? data.plans[0] : data.plans;

    return Response.json({
        data: {
            id:                 data.id,
            status:             data.status,
            schemaName:         data.schema_name,
            billingCycle:       data.billing_cycle,
            currentPeriodStart: data.current_period_start,
            currentPeriodEnd:   data.current_period_end,
            lastPaymentAt:      data.last_payment_at,
            createdAt:          data.created_at,
            plan: plan ? {
                id:                     plan.id,
                name:                   plan.name,
                maxCompanies:           plan.max_companies,
                maxEmployeesPerCompany: plan.max_employees_per_company,
                priceMonthlyUsd:        plan.price_monthly_usd,
                priceQuarterlyUsd:      plan.price_quarterly_usd,
                priceAnnualUsd:         plan.price_annual_usd,
            } : null,
        },
    });
}

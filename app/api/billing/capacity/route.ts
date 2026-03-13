import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /api/billing/capacity
 * Devuelve cuántas empresas y empleados puede aún crear el usuario según su plan.
 */
export async function GET() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return Response.json({ error: 'No autenticado' }, { status: 401 });

    // Límites del plan
    const { data: limits } = await supabase
        .rpc('tenant_get_plan_limits', { p_user_id: user.id });

    const plan = limits?.[0] ?? { max_companies: null, max_employees_per_company: null };

    // Empresas actuales
    const { data: companiesData } = await supabase
        .rpc('tenant_companies_get_all', { p_user_id: user.id });

    const companies: any[] = companiesData ?? [];

    // Empleados por empresa
    const employeesByCompany: Record<string, number> = {};
    for (const co of companies) {
        const { data: empData } = await supabase
            .rpc('tenant_employees_get_by_company', { p_user_id: user.id, p_company_id: co.id });
        employeesByCompany[co.id] = (empData as any[])?.length ?? 0;
    }

    return Response.json({
        data: {
            companies: {
                used:    companies.length,
                max:     plan.max_companies,
                remaining: plan.max_companies === null ? null : Math.max(0, plan.max_companies - companies.length),
            },
            employeesPerCompany: {
                max: plan.max_employees_per_company,
                byCompany: employeesByCompany,
            },
        },
    });
}

import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/src/shared/backend/utils/require-admin';

/**
 * GET /api/admin/plans
 * Devuelve todos los planes (incluyendo inactivos). Admin only.
 */
export async function GET(req: Request) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('price_monthly_usd', { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
        data: (data ?? []).map((p) => ({
            id:                     p.id,
            name:                   p.name,
            maxCompanies:           p.max_companies,
            maxEmployeesPerCompany: p.max_employees_per_company,
            priceMonthlyUsd:        p.price_monthly_usd,
            priceQuarterlyUsd:      p.price_quarterly_usd,
            priceAnnualUsd:         p.price_annual_usd,
            isActive:               p.is_active,
        })),
    });
}

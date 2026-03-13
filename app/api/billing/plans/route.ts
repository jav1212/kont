import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /api/billing/plans
 * Devuelve todos los planes activos.
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

    const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly_usd', { ascending: true });

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({
        data: (data ?? []).map((p) => ({
            id:                     p.id,
            name:                   p.name,
            maxCompanies:           p.max_companies,
            maxEmployeesPerCompany: p.max_employees_per_company,
            priceMonthlyUsd:        p.price_monthly_usd,
            priceQuarterlyUsd:      p.price_quarterly_usd,
            priceAnnualUsd:         p.price_annual_usd,
        })),
    });
}

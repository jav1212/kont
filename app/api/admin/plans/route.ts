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
 * GET /api/admin/plans
 * Devuelve todos los planes (incluyendo inactivos). Admin only.
 */
export async function GET(req: Request) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const supabase = serviceClient();

    const { data, error } = await supabase
        .from('plans')
        .select('*, products ( slug, name )')
        .order('price_monthly_usd', { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
        data: (data ?? []).map((p) => {
            const product = Array.isArray(p.products) ? p.products[0] : p.products;
            return {
                id:                     p.id,
                name:                   p.name,
                maxCompanies:           p.max_companies,
                maxEmployeesPerCompany: p.max_employees_per_company,
                priceMonthlyUsd:        p.price_monthly_usd,
                priceQuarterlyUsd:      p.price_quarterly_usd,
                priceAnnualUsd:         p.price_annual_usd,
                isActive:               p.is_active,
                isContactOnly:          p.is_contact_only ?? false,
                productSlug:            product?.slug ?? null,
                productName:            product?.name ?? null,
            };
        }),
    });
}

/**
 * POST /api/admin/plans
 * Crea un nuevo plan. Admin only.
 * Body: { name, productSlug, priceMonthlyUsd, priceQuarterlyUsd?, priceAnnualUsd?,
 *         maxCompanies?, maxEmployeesPerCompany? }
 */
export async function POST(req: Request) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    try {
        const body = await req.json();
        const { name, priceMonthlyUsd } = body;

        if (!name || priceMonthlyUsd == null) {
            return Response.json(
                { error: 'name y priceMonthlyUsd son requeridos' },
                { status: 400 }
            );
        }

        const supabase = serviceClient();

        const { data, error } = await supabase
            .from('plans')
            .insert({
                name,
                product_id:               null,
                price_monthly_usd:        Number(priceMonthlyUsd),
                price_quarterly_usd:      body.priceQuarterlyUsd != null ? Number(body.priceQuarterlyUsd) : 0,
                price_annual_usd:         body.priceAnnualUsd    != null ? Number(body.priceAnnualUsd)    : 0,
                max_companies:            body.maxCompanies            != null ? Number(body.maxCompanies)            : null,
                max_employees_per_company: body.maxEmployeesPerCompany != null ? Number(body.maxEmployeesPerCompany) : null,
                is_active:                body.isActive ?? true,
                is_contact_only:          body.isContactOnly ?? false,
            })
            .select()
            .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({
            data: {
                id:                     data.id,
                name:                   data.name,
                maxCompanies:           data.max_companies,
                maxEmployeesPerCompany: data.max_employees_per_company,
                priceMonthlyUsd:        data.price_monthly_usd,
                priceQuarterlyUsd:      data.price_quarterly_usd,
                priceAnnualUsd:         data.price_annual_usd,
                isActive:               data.is_active,
                isContactOnly:          data.is_contact_only ?? false,
                productSlug:            null,
                productName:            null,
            },
        }, { status: 201 });
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }
}

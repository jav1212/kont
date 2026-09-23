import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/src/shared/backend/utils/require-admin';
import { kioskPublicationPriceError } from '@/src/modules/billing/backend/domain/kiosk-plan-policy';

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
                includedModules:        p.included_modules ?? [],
                commercialCode:         p.commercial_code ?? null,
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
        const monthly = Number(priceMonthlyUsd);
        const quarterly = body.priceQuarterlyUsd != null ? Number(body.priceQuarterlyUsd) : 0;
        const annual = body.priceAnnualUsd != null ? Number(body.priceAnnualUsd) : 0;
        if (![monthly, quarterly, annual].every(Number.isFinite) || [monthly, quarterly, annual].some((price) => price < 0)) {
            return Response.json({ error: 'Los precios deben ser numeros no negativos' }, { status: 400 });
        }
        const kioskPriceError = name === 'Kiosco' && body.isActive === true
            ? kioskPublicationPriceError(monthly)
            : null;
        if (kioskPriceError) {
            return Response.json({ error: kioskPriceError }, { status: 400 });
        }

        const supabase = serviceClient();
        const productSlug = typeof body.productSlug === 'string'
            ? body.productSlug
            : name === 'Kiosco' ? 'inventory' : null;
        let productId: string | null = null;
        if (productSlug) {
            const { data: product, error: productError } = await supabase
                .from('products').select('id').eq('slug', productSlug).maybeSingle();
            if (productError || !product) return Response.json({ error: 'Producto no encontrado' }, { status: 400 });
            productId = product.id;
        }
        if (name === 'Kiosco' && productSlug !== 'inventory') {
            return Response.json({ error: 'Kiosco debe usar el producto Inventario' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('plans')
            .insert({
                name,
                product_id:               productId,
                price_monthly_usd:        monthly,
                price_quarterly_usd:      quarterly,
                price_annual_usd:         annual,
                max_companies:            body.maxCompanies            != null ? Number(body.maxCompanies)            : null,
                max_employees_per_company: body.maxEmployeesPerCompany != null ? Number(body.maxEmployeesPerCompany) : null,
                is_active:                body.isActive ?? true,
                is_contact_only:          body.isContactOnly ?? false,
                included_modules:         Array.isArray(body.includedModules) ? body.includedModules : name === 'Kiosco' ? ['inventory', 'purchases', 'sales'] : [],
                commercial_code:          name === 'Kiosco' ? 'kiosk' : null,
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
                includedModules:        data.included_modules ?? [],
                commercialCode:         data.commercial_code ?? null,
                productSlug:            null,
                productName:            null,
            },
        }, { status: 201 });
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }
}

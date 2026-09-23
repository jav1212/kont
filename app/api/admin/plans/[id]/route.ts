import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/src/shared/backend/utils/require-admin';
import { kioskPublicationPriceError } from '@/src/modules/billing/backend/domain/kiosk-plan-policy';

/**
 * PATCH /api/admin/plans/[id]
 * Actualiza las propiedades de un plan. Admin only.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const adminCheck = await requireAdmin(req);
    if (adminCheck) return adminCheck;

    const { id } = await params;

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }

    const allowed = [
        'name',
        'max_companies',
        'max_employees_per_company',
        'price_monthly_usd',
        'price_quarterly_usd',
        'price_annual_usd',
        'is_active',
        'is_contact_only',
        'product_id',
        'included_modules',
    ];

    // Map camelCase keys sent from the client to snake_case DB columns
    const camelToSnake: Record<string, string> = {
        name:                   'name',
        maxCompanies:           'max_companies',
        maxEmployeesPerCompany: 'max_employees_per_company',
        priceMonthlyUsd:        'price_monthly_usd',
        priceQuarterlyUsd:      'price_quarterly_usd',
        priceAnnualUsd:         'price_annual_usd',
        isActive:               'is_active',
        isContactOnly:          'is_contact_only',
        productId:              'product_id',
        includedModules:        'included_modules',
    };

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
        const col = camelToSnake[key] ?? key;
        if (allowed.includes(col)) {
            updates[col] = value;
        }
    }

    if (Object.keys(updates).length === 0) {
        return Response.json({ error: 'No hay campos válidos para actualizar' }, { status: 400 });
    }
    if ('included_modules' in updates && (!Array.isArray(updates.included_modules) || !updates.included_modules.every((code) => typeof code === 'string'))) {
        return Response.json({ error: 'includedModules debe ser una lista de modulos' }, { status: 400 });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: existing, error: existingError } = await supabase
        .from('plans').select('name,price_monthly_usd,price_quarterly_usd,price_annual_usd,is_active').eq('id', id).single();
    if (existingError || !existing) return Response.json({ error: 'Plan no encontrado' }, { status: 404 });
    const resultingName = String(updates.name ?? existing.name);
    const resultingPrices = [
        Number(updates.price_monthly_usd ?? existing.price_monthly_usd),
        Number(updates.price_quarterly_usd ?? existing.price_quarterly_usd),
        Number(updates.price_annual_usd ?? existing.price_annual_usd),
    ];
    if (!resultingPrices.every(Number.isFinite) || resultingPrices.some((price) => price < 0)) {
        return Response.json({ error: 'Los precios deben ser numeros no negativos' }, { status: 400 });
    }
    const kioskPriceError = resultingName === 'Kiosco' && (updates.is_active ?? existing.is_active) === true
        ? kioskPublicationPriceError(resultingPrices[0]!)
        : null;
    if (kioskPriceError) {
        return Response.json({ error: kioskPriceError }, { status: 400 });
    }

    // If productSlug is provided, resolve to product_id
    if (body.productSlug && typeof body.productSlug === 'string') {
        const { data: prod } = await supabase
            .from('products')
            .select('id')
            .eq('slug', body.productSlug)
            .single();
        if (prod) updates['product_id'] = prod.id;
    }

    const { data, error } = await supabase
        .from('plans')
        .update(updates)
        .eq('id', id)
        .select('*, products ( slug, name )')
        .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const product = Array.isArray(data.products) ? data.products[0] : data.products;

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
            productSlug:            product?.slug ?? null,
            productName:            product?.name ?? null,
        },
    });
}

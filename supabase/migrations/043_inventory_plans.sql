-- ============================================================================
-- 043 — Planes de suscripción para el módulo de Inventario
-- ============================================================================

INSERT INTO public.plans (
    name,
    product_id,
    max_companies,
    max_employees_per_company,
    price_monthly_usd,
    price_quarterly_usd,
    price_annual_usd,
    is_active
)
SELECT
    p.name,
    inv.id,
    p.max_companies,
    NULL,
    p.price_monthly_usd,
    p.price_quarterly_usd,
    p.price_annual_usd,
    true
FROM (
    VALUES
        ('Emprendedor Inventario', 1,    6.00,  15.50,  57.00),
        ('Profesional Inventario', 3,   13.00,  33.00, 124.00),
        ('Contador Inventario',   10,   25.00,  64.00, 240.00),
        ('Empresarial Inventario', NULL, 45.00, 115.00, 432.00)
) AS p(name, max_companies, price_monthly_usd, price_quarterly_usd, price_annual_usd)
CROSS JOIN (SELECT id FROM public.products WHERE slug = 'inventory') AS inv
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 051 — Redefinición de planes unificados
--
-- Nuevos planes (sin product_id = acceso a todos los módulos):
--   Gratuito    · $0    · 1 empresa    · solo Documentos
--   Estudiante  · $9    · 2 empresas   · todos los módulos
--   Emprendedor · $19   · 8 empresas   · todos los módulos
--   Contable    · $35   · 15 empresas  · todos los módulos
--   Empresarial · contacto · ilimitado · todos los módulos
-- ============================================================================

-- 1. Nueva columna para el plan "contactar" (Empresarial)
ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS is_contact_only boolean NOT NULL DEFAULT false;

-- 2. Desactivar todos los planes actuales
UPDATE public.plans SET is_active = false;

-- 3. Upsert de los nuevos planes unificados
--    product_id = NULL significa acceso universal a todos los módulos.
--    Para Gratuito el control de módulos se maneja en la app (solo documentos).
INSERT INTO public.plans (
    name,
    product_id,
    max_companies,
    max_employees_per_company,
    price_monthly_usd,
    price_quarterly_usd,
    price_annual_usd,
    is_active,
    is_contact_only
) VALUES
    ('Gratuito',    NULL, 1,    NULL,  0.00,  0.00,   0.00,  true, false),
    ('Estudiante',  NULL, 2,    NULL,  9.00, 24.00,  86.00,  true, false),
    ('Emprendedor', NULL, 8,    NULL, 19.00, 49.00, 182.00,  true, false),
    ('Contable',    NULL, 15,   NULL, 35.00, 89.00, 336.00,  true, false),
    ('Empresarial', NULL, NULL, NULL,  0.00,  0.00,   0.00,  true, true)
ON CONFLICT (name) DO UPDATE SET
    product_id                = NULL,
    max_companies             = EXCLUDED.max_companies,
    max_employees_per_company = EXCLUDED.max_employees_per_company,
    price_monthly_usd         = EXCLUDED.price_monthly_usd,
    price_quarterly_usd       = EXCLUDED.price_quarterly_usd,
    price_annual_usd          = EXCLUDED.price_annual_usd,
    is_active                 = true,
    is_contact_only           = EXCLUDED.is_contact_only;

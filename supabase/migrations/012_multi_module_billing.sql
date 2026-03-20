-- ============================================================================
-- 012 — Multi-module billing (Option C)
--
-- Adds:
--   public.products            — catalog of billable modules (payroll, inventory…)
--   public.plans.product_id    — FK linking plans to a product
--   public.tenant_subscriptions — one row per (tenant, product), replaces
--                                  the single plan_id on tenants for multi-module support
--
-- Existing tenants keep working: their payroll subscription is seeded from
-- the current tenants.plan_id / status / period columns.
-- tenants.plan_id is left untouched for backward compatibility.
-- ============================================================================

-- ── 1. Products catalog ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.products (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL UNIQUE,
    name        text NOT NULL,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.products (slug, name, description) VALUES
    ('payroll',    'Nómina',      'Cálculo y gestión de nómina venezolana (LOTTT)'),
    ('inventory',  'Inventario',  'Control de inventario y productos por empresa')
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Link plans → products ──────────────────────────────────────────────────

ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id);

-- All current plans belong to the payroll product
UPDATE public.plans
SET product_id = (SELECT id FROM public.products WHERE slug = 'payroll')
WHERE product_id IS NULL;

-- ── 3. Tenant subscriptions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    product_id           uuid        NOT NULL REFERENCES public.products(id),
    plan_id              uuid        REFERENCES public.plans(id),
    status               text        NOT NULL DEFAULT 'trial'
                                     CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
    billing_cycle        text        CHECK (billing_cycle IN ('monthly', 'quarterly', 'annual')),
    current_period_start timestamptz,
    current_period_end   timestamptz,
    last_payment_at      timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, product_id)
);

-- ── 4. Migrate existing payroll subscriptions ─────────────────────────────────

INSERT INTO public.tenant_subscriptions (
    tenant_id, product_id, plan_id, status,
    billing_cycle, current_period_start, current_period_end, last_payment_at, created_at
)
SELECT
    t.id,
    (SELECT id FROM public.products WHERE slug = 'payroll'),
    t.plan_id,
    t.status,
    t.billing_cycle,
    t.current_period_start,
    t.current_period_end,
    t.last_payment_at,
    t.created_at
FROM public.tenants t
ON CONFLICT (tenant_id, product_id) DO NOTHING;

-- ── 5. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_public_read" ON public.products
    FOR SELECT USING (true);

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_subscriptions_own_read" ON public.tenant_subscriptions
    FOR SELECT USING (tenant_id = auth.uid());

-- ── 6. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_id
    ON public.tenant_subscriptions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_product_id
    ON public.tenant_subscriptions (product_id);

-- =============================================================================
-- 001_saas_public_schema.sql
-- Tablas de la capa pública SaaS: planes, tenants, solicitudes de pago y admins
-- =============================================================================

-- ---------------------------------------------------------------------------
-- public.plans
-- Planes de suscripción disponibles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        text        NOT NULL UNIQUE,
    max_companies               int         NULL,  -- NULL = ilimitado
    max_employees_per_company   int         NULL,  -- NULL = ilimitado
    price_monthly_usd           numeric(10,2) NOT NULL,
    price_quarterly_usd         numeric(10,2) NOT NULL,
    price_annual_usd            numeric(10,2) NOT NULL,
    is_active                   boolean     NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Datos semilla de planes
INSERT INTO public.plans (name, max_companies, max_employees_per_company, price_monthly_usd, price_quarterly_usd, price_annual_usd)
VALUES
    ('Emprendedor', 1,    15,  8.00,  21.00,  77.00),
    ('Profesional', 3,    50,  18.00, 46.00,  173.00),
    ('Contador',    10,   150, 35.00, 89.00,  336.00),
    ('Empresarial', NULL, NULL,60.00, 153.00, 576.00)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- public.tenants
-- Un registro por usuario registrado en el sistema
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
    id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id             uuid        NOT NULL REFERENCES public.plans(id),
    status              text        NOT NULL DEFAULT 'trial'
                            CHECK (status IN ('trial', 'active', 'suspended')),
    schema_name         text        NOT NULL UNIQUE,  -- 'tenant_<uuid_no_dashes>'
    billing_cycle       text        NOT NULL DEFAULT 'monthly'
                            CHECK (billing_cycle IN ('monthly', 'quarterly', 'annual')),
    current_period_start date        NULL,
    current_period_end   date        NULL,
    last_payment_at     timestamptz NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS tenants_status_idx   ON public.tenants(status);
CREATE INDEX IF NOT EXISTS tenants_plan_id_idx  ON public.tenants(plan_id);

-- ---------------------------------------------------------------------------
-- public.payment_requests
-- Comprobantes de pago subidos por el usuario para ser validados manualmente
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_requests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id         uuid        NOT NULL REFERENCES public.plans(id),
    billing_cycle   text        NOT NULL CHECK (billing_cycle IN ('monthly', 'quarterly', 'annual')),
    amount_usd      numeric(10,2) NOT NULL,
    payment_method  text        NOT NULL CHECK (payment_method IN ('transfer', 'cash')),
    receipt_url     text        NULL,  -- URL del comprobante subido a Storage
    status          text        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
    notes           text        NULL,  -- observaciones del admin al revisar
    submitted_at    timestamptz NOT NULL DEFAULT now(),
    reviewed_at     timestamptz NULL,
    reviewed_by     uuid        NULL REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_requests_tenant_idx  ON public.payment_requests(tenant_id);
CREATE INDEX IF NOT EXISTS payment_requests_status_idx  ON public.payment_requests(status);

-- ---------------------------------------------------------------------------
-- public.admin_users
-- Usuarios con privilegios de administrador de la plataforma
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
    id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS: solo el propio tenant puede leer su fila; admins leen todo
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users      ENABLE ROW LEVEL SECURITY;

-- plans: lectura pública para usuarios autenticados
CREATE POLICY "plans_read" ON public.plans
    FOR SELECT USING (true);

-- tenants: cada usuario ve solo su propio tenant
CREATE POLICY "tenants_self_read" ON public.tenants
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "tenants_self_update" ON public.tenants
    FOR UPDATE USING (auth.uid() = id);

-- Admins ven todos los tenants (via service role o is_admin helper)
CREATE POLICY "tenants_admin_all" ON public.tenants
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid())
    );

-- payment_requests: el tenant solo ve las suyas
CREATE POLICY "payment_requests_tenant_read" ON public.payment_requests
    FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "payment_requests_tenant_insert" ON public.payment_requests
    FOR INSERT WITH CHECK (tenant_id = auth.uid());

-- Admins gestionan todas las solicitudes
CREATE POLICY "payment_requests_admin_all" ON public.payment_requests
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid())
    );

-- admin_users: solo admins pueden ver esta tabla
CREATE POLICY "admin_users_self" ON public.admin_users
    FOR SELECT USING (auth.uid() = id);

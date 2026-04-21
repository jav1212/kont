-- =============================================================================
-- 057_referrals.sql
-- Sistema de referidos: cada tenant obtiene un código único; al registrarse con
-- ?ref=CODE el nuevo tenant queda ligado al referidor. Cuando el referido hace
-- su primer pago aprobado, se genera un crédito para el referidor (20% del
-- monto pagado) que se aplica automáticamente a sus próximas facturas.
-- =============================================================================

-- 1. Código y enlace de referidor en tenants -------------------------------------
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
    ADD COLUMN IF NOT EXISTS referred_by   uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tenants_referred_by_idx ON public.tenants(referred_by);

-- 2. Generador de códigos (8 chars base32, colisión-safe con reintento) ---------
CREATE OR REPLACE FUNCTION public.generate_referral_code() RETURNS text AS $$
DECLARE
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code text;
    exists_count int;
BEGIN
    LOOP
        code := '';
        FOR i IN 1..8 LOOP
            code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        END LOOP;
        SELECT count(*) INTO exists_count FROM public.tenants WHERE referral_code = code;
        EXIT WHEN exists_count = 0;
    END LOOP;
    RETURN code;
END $$ LANGUAGE plpgsql;

-- 3. Back-fill para tenants existentes ------------------------------------------
UPDATE public.tenants
   SET referral_code = public.generate_referral_code()
 WHERE referral_code IS NULL;

-- 4. Trigger para auto-asignar código en inserts --------------------------------
CREATE OR REPLACE FUNCTION public.set_referral_code_on_insert() RETURNS trigger AS $$
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := public.generate_referral_code();
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenants_set_referral_code ON public.tenants;
CREATE TRIGGER tenants_set_referral_code
    BEFORE INSERT ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.set_referral_code_on_insert();

-- 5. Créditos (un crédito por referido; se consume parcial vía redemptions) -----
CREATE TABLE IF NOT EXISTS public.referral_credits (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    referred_tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    source_payment_request_id uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
    amount_usd                numeric(10,2) NOT NULL CHECK (amount_usd >= 0),
    remaining_usd             numeric(10,2) NOT NULL CHECK (remaining_usd >= 0),
    status                    text NOT NULL DEFAULT 'available'
                                  CHECK (status IN ('available', 'partial', 'consumed')),
    created_at                timestamptz NOT NULL DEFAULT now(),
    UNIQUE (referred_tenant_id)  -- un solo crédito por referido; idempotente
);

CREATE INDEX IF NOT EXISTS referral_credits_referrer_idx
    ON public.referral_credits(referrer_tenant_id, status);

-- 6. Redenciones (cada aplicación del crédito a una factura) --------------------
CREATE TABLE IF NOT EXISTS public.referral_redemptions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_id           uuid NOT NULL REFERENCES public.referral_credits(id) ON DELETE CASCADE,
    payment_request_id  uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
    amount_usd          numeric(10,2) NOT NULL CHECK (amount_usd > 0),
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_redemptions_payment_idx
    ON public.referral_redemptions(payment_request_id);

-- 7. Descuento aplicado en la factura (auditoría) -------------------------------
ALTER TABLE public.payment_requests
    ADD COLUMN IF NOT EXISTS discount_usd numeric(10,2) NOT NULL DEFAULT 0
    CHECK (discount_usd >= 0);

-- 8. RLS -------------------------------------------------------------------------
ALTER TABLE public.referral_credits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_credits_self_read"   ON public.referral_credits;
DROP POLICY IF EXISTS "referral_credits_admin_all"   ON public.referral_credits;
DROP POLICY IF EXISTS "referral_redemptions_self_read" ON public.referral_redemptions;
DROP POLICY IF EXISTS "referral_redemptions_admin_all" ON public.referral_redemptions;

CREATE POLICY "referral_credits_self_read" ON public.referral_credits
    FOR SELECT USING (
        referrer_tenant_id = auth.uid() OR referred_tenant_id = auth.uid()
    );

CREATE POLICY "referral_credits_admin_all" ON public.referral_credits
    FOR ALL USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

CREATE POLICY "referral_redemptions_self_read" ON public.referral_redemptions
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.referral_credits c
         WHERE c.id = credit_id
           AND c.referrer_tenant_id = auth.uid()
    ));

CREATE POLICY "referral_redemptions_admin_all" ON public.referral_redemptions
    FOR ALL USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

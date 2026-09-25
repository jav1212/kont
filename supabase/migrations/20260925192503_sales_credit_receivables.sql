-- Customer credit sales with immutable currency and rate snapshots.
ALTER TABLE public.shared_inventory_sales_invoices
    ADD COLUMN IF NOT EXISTS credit_currency_code varchar(3),
    ADD COLUMN IF NOT EXISTS credit_amount numeric(20,8),
    ADD COLUMN IF NOT EXISTS credit_exchange_rate numeric(20,8),
    ADD COLUMN IF NOT EXISTS credit_rate_effective_date date,
    ADD COLUMN IF NOT EXISTS credit_rate_source text;

ALTER TABLE public.shared_inventory_sales_invoices
    ADD CONSTRAINT shared_sales_credit_currency_code_check
        CHECK (credit_currency_code IS NULL OR credit_currency_code ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT shared_sales_credit_amount_check
        CHECK (credit_amount IS NULL OR credit_amount > 0),
    ADD CONSTRAINT shared_sales_credit_rate_check
        CHECK (credit_exchange_rate IS NULL OR credit_exchange_rate > 0),
    ADD CONSTRAINT shared_sales_credit_source_check
        CHECK (credit_rate_source IS NULL OR credit_rate_source IN ('bcv','manual','legacy','identity'));

CREATE TABLE IF NOT EXISTS public.shared_sales_receivables (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL DEFAULT gen_random_uuid()::text,
    company_id text NOT NULL,
    customer_id text NOT NULL,
    sales_invoice_id text NOT NULL,
    debt_currency_code varchar(3) NOT NULL CHECK (debt_currency_code ~ '^[A-Z]{3}$'),
    original_amount numeric(20,8) NOT NULL CHECK (original_amount > 0),
    debt_exchange_rate numeric(20,8) NOT NULL CHECK (debt_exchange_rate > 0),
    rate_effective_date date NOT NULL,
    rate_source text NOT NULL CHECK (rate_source IN ('bcv','manual','legacy','identity')),
    due_date date NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,sales_invoice_id),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id),
    FOREIGN KEY (tenant_id,customer_id) REFERENCES public.shared_inventory_customers(tenant_id,id),
    FOREIGN KEY (tenant_id,sales_invoice_id) REFERENCES public.shared_inventory_sales_invoices(tenant_id,id)
);

CREATE TABLE IF NOT EXISTS public.shared_sales_receivable_payments (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL DEFAULT gen_random_uuid()::text,
    receivable_id text NOT NULL,
    idempotency_key text NOT NULL,
    received_amount numeric(20,8) NOT NULL CHECK (received_amount > 0),
    received_currency_code varchar(3) NOT NULL CHECK (received_currency_code ~ '^[A-Z]{3}$'),
    applied_debt_amount numeric(20,8) NOT NULL CHECK (applied_debt_amount > 0),
    exchange_rate_to_ves numeric(20,8) NOT NULL CHECK (exchange_rate_to_ves > 0),
    rate_effective_date date NOT NULL,
    rate_source text NOT NULL CHECK (rate_source IN ('bcv','manual','legacy','identity')),
    payment_method text,
    reference text,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,idempotency_key),
    FOREIGN KEY (tenant_id,receivable_id) REFERENCES public.shared_sales_receivables(tenant_id,id)
);

CREATE INDEX IF NOT EXISTS shared_sales_receivables_customer_due_idx
    ON public.shared_sales_receivables(tenant_id,company_id,customer_id,due_date) WHERE status='open';
CREATE INDEX IF NOT EXISTS shared_sales_receivable_payments_account_idx
    ON public.shared_sales_receivable_payments(tenant_id,receivable_id,occurred_at);

ALTER TABLE public.shared_sales_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_sales_receivable_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY shared_sales_receivables_member_access ON public.shared_sales_receivables FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_sales_receivables.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL))
    WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_sales_receivables.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));
CREATE POLICY shared_sales_receivable_payments_member_access ON public.shared_sales_receivable_payments FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_sales_receivable_payments.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));
GRANT SELECT ON public.shared_sales_receivables, public.shared_sales_receivable_payments TO authenticated;

CREATE OR REPLACE FUNCTION public.shared_sales_credit_confirmed_receivable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF NEW.status='confirmada' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.payment_terms='credito' THEN
        IF NEW.credit_currency_code IS NULL OR NEW.credit_amount IS NULL OR NEW.credit_exchange_rate IS NULL
           OR NEW.credit_rate_effective_date IS NULL OR NEW.credit_rate_source IS NULL OR NEW.due_date IS NULL THEN
            RAISE EXCEPTION 'Credit sale is missing its amount, currency, rate snapshot, or due date';
        END IF;
        IF NEW.customer_id LIKE 'consumer-final:%' THEN RAISE EXCEPTION 'Credit sale requires an identified customer'; END IF;
        INSERT INTO public.shared_sales_receivables(tenant_id,company_id,customer_id,sales_invoice_id,debt_currency_code,original_amount,debt_exchange_rate,rate_effective_date,rate_source,due_date)
        VALUES (NEW.tenant_id,NEW.company_id,NEW.customer_id,NEW.id,NEW.credit_currency_code,NEW.credit_amount,NEW.credit_exchange_rate,NEW.credit_rate_effective_date,NEW.credit_rate_source,NEW.due_date)
        ON CONFLICT (tenant_id,sales_invoice_id) DO NOTHING;
    END IF;
    IF OLD.status='confirmada' AND NEW.status='borrador' AND EXISTS (
        SELECT 1 FROM public.shared_sales_receivables r JOIN public.shared_sales_receivable_payments p ON p.tenant_id=r.tenant_id AND p.receivable_id=r.id
        WHERE r.tenant_id=OLD.tenant_id AND r.sales_invoice_id=OLD.id
    ) THEN RAISE EXCEPTION 'A credit sale with payments cannot be unconfirmed'; END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS shared_sales_credit_receivable_confirmed ON public.shared_inventory_sales_invoices;
CREATE TRIGGER shared_sales_credit_receivable_confirmed BEFORE UPDATE OF status ON public.shared_inventory_sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.shared_sales_credit_confirmed_receivable();

CREATE OR REPLACE FUNCTION public.shared_sales_receivable_apply_payment(
    p_tenant_id uuid, p_receivable_id text, p_idempotency_key text,
    p_received_amount numeric, p_received_currency_code varchar,
    p_exchange_rate_to_ves numeric, p_rate_effective_date date, p_rate_source text,
    p_payment_method text DEFAULT NULL, p_reference text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.shared_sales_receivables%ROWTYPE; v_applied numeric(20,8); v_paid numeric(20,8); v_payment public.shared_sales_receivable_payments%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL OR length(p_idempotency_key)<8 THEN RAISE EXCEPTION 'Valid idempotency key is required'; END IF;
    IF p_received_amount<=0 OR p_exchange_rate_to_ves<=0 OR p_received_currency_code !~ '^[A-Z]{3}$' OR p_rate_source NOT IN ('bcv','manual','legacy','identity') THEN RAISE EXCEPTION 'Invalid payment amount, currency, or rate snapshot'; END IF;
    SELECT * INTO v_payment FROM public.shared_sales_receivable_payments WHERE tenant_id=p_tenant_id AND idempotency_key=p_idempotency_key;
    IF FOUND THEN RETURN to_jsonb(v_payment); END IF;
    SELECT * INTO r FROM public.shared_sales_receivables WHERE tenant_id=p_tenant_id AND id=p_receivable_id FOR UPDATE;
    IF NOT FOUND OR r.status<>'open' THEN RAISE EXCEPTION 'Open receivable not found'; END IF;
    v_applied := round(p_received_amount*p_exchange_rate_to_ves/r.debt_exchange_rate,8);
    SELECT COALESCE(sum(applied_debt_amount),0) INTO v_paid FROM public.shared_sales_receivable_payments WHERE tenant_id=p_tenant_id AND receivable_id=p_receivable_id;
    IF v_applied > r.original_amount-v_paid+0.00000001 THEN RAISE EXCEPTION 'Payment exceeds the outstanding credit balance'; END IF;
    INSERT INTO public.shared_sales_receivable_payments(tenant_id,receivable_id,idempotency_key,received_amount,received_currency_code,applied_debt_amount,exchange_rate_to_ves,rate_effective_date,rate_source,payment_method,reference)
    VALUES(p_tenant_id,p_receivable_id,p_idempotency_key,p_received_amount,upper(p_received_currency_code),v_applied,p_exchange_rate_to_ves,p_rate_effective_date,p_rate_source,p_payment_method,p_reference)
    RETURNING * INTO v_payment;
    IF v_paid+v_applied >= r.original_amount-0.00000001 THEN UPDATE public.shared_sales_receivables SET status='settled' WHERE tenant_id=p_tenant_id AND id=p_receivable_id; END IF;
    RETURN to_jsonb(v_payment);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.shared_sales_receivable_apply_payment(uuid,text,text,numeric,varchar,numeric,date,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shared_sales_receivable_apply_payment(uuid,text,text,numeric,varchar,numeric,date,text,text,text) TO service_role;

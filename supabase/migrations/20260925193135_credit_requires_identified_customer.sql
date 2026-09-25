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
END; $$;

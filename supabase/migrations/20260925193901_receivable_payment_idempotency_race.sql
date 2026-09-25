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
    IF NOT FOUND THEN RAISE EXCEPTION 'Receivable not found'; END IF;
    SELECT * INTO v_payment FROM public.shared_sales_receivable_payments WHERE tenant_id=p_tenant_id AND idempotency_key=p_idempotency_key;
    IF FOUND THEN RETURN to_jsonb(v_payment); END IF;
    IF r.status<>'open' THEN RAISE EXCEPTION 'Open receivable not found'; END IF;
    v_applied := round(p_received_amount*p_exchange_rate_to_ves/r.debt_exchange_rate,8);
    SELECT COALESCE(sum(applied_debt_amount),0) INTO v_paid FROM public.shared_sales_receivable_payments WHERE tenant_id=p_tenant_id AND receivable_id=p_receivable_id;
    IF v_applied > r.original_amount-v_paid+0.00000001 THEN RAISE EXCEPTION 'Payment exceeds the outstanding credit balance'; END IF;
    INSERT INTO public.shared_sales_receivable_payments(tenant_id,receivable_id,idempotency_key,received_amount,received_currency_code,applied_debt_amount,exchange_rate_to_ves,rate_effective_date,rate_source,payment_method,reference)
    VALUES(p_tenant_id,p_receivable_id,p_idempotency_key,p_received_amount,upper(p_received_currency_code),v_applied,p_exchange_rate_to_ves,p_rate_effective_date,p_rate_source,p_payment_method,p_reference) RETURNING * INTO v_payment;
    IF v_paid+v_applied >= r.original_amount-0.00000001 THEN UPDATE public.shared_sales_receivables SET status='settled' WHERE tenant_id=p_tenant_id AND id=p_receivable_id; END IF;
    RETURN to_jsonb(v_payment);
END; $$;

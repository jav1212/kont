-- Keep the sales_invoice series exclusive to legacy document_type='venta'.
-- The earlier issuer remains private; the public RPC retains its stable signature.
alter function public.confirm_native_sales_invoice_with_document_series_secure(
  uuid,uuid,text,text,text,text,uuid,text,uuid,boolean,text,text,text,uuid,text
) rename to confirm_native_sales_invoice_with_document_series_core;
revoke all on function public.confirm_native_sales_invoice_with_document_series_core(
  uuid,uuid,text,text,text,text,uuid,text,uuid,boolean,text,text,text,uuid,text
) from public, anon, authenticated, service_role;

create function public.confirm_native_sales_invoice_with_document_series_secure(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_invoice_id text,
  p_idempotency_key text, p_scope_kind text, p_scope_branch_id uuid,
  p_selection_kind text, p_series_id uuid,
  p_allow_negative_stock boolean default false, p_price_list_id text default null,
  p_branch_id text default null, p_device_id text default null,
  p_company_branch_id uuid default null, p_sales_register_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_document_type text;
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'sales.confirm');
  select document_type into v_document_type from public.shared_inventory_sales_invoices
    where tenant_id=v_tenant and company_id=p_company_id and id=p_invoice_id for update;
  if not found then raise exception 'SALES_NOT_FOUND'; end if;
  if v_document_type <> 'venta' then raise exception 'SALES_DOCUMENT_SERIES_INVALID'; end if;
  return public.confirm_native_sales_invoice_with_document_series_core(
    p_actor_user_id,p_organization_id,p_company_id,p_invoice_id,p_idempotency_key,
    p_scope_kind,p_scope_branch_id,p_selection_kind,p_series_id,p_allow_negative_stock,
    p_price_list_id,p_branch_id,p_device_id,p_company_branch_id,p_sales_register_id);
end;
$$;
revoke all on function public.confirm_native_sales_invoice_with_document_series_secure(
  uuid,uuid,text,text,text,text,uuid,text,uuid,boolean,text,text,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.confirm_native_sales_invoice_with_document_series_secure(
  uuid,uuid,text,text,text,text,uuid,text,uuid,boolean,text,text,text,uuid,text
) to service_role;

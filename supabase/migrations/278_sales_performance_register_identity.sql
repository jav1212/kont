-- Attach a verified carnet terminal to its sales invoice inside the same
-- transaction that confirms the invoice and records performance attribution.
create or replace function public.shared_inventory_sales_invoice_confirm_with_register(
  p_tenant_id uuid,
  p_invoice_id text,
  p_actor_user_id uuid,
  p_allow_negative_stock boolean,
  p_sales_register_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_register_name text;
begin
  if p_sales_register_id is not null then
    select name into v_register_name from public.barcode_access_terminals
    where tenant_id=p_tenant_id and id::text=p_sales_register_id and status='active';
    if v_register_name is null then raise exception 'SALES_REGISTER_INVALID'; end if;

    update public.shared_inventory_sales_invoices
      set sales_register_id=p_sales_register_id,
          sales_register_name=v_register_name,
          sales_register_kind='browser'
    where tenant_id=p_tenant_id and id=p_invoice_id and status='borrador';
  end if;

  return public.shared_inventory_sales_invoice_confirm_attributed(
    p_tenant_id, p_invoice_id, p_actor_user_id, coalesce(p_allow_negative_stock, false)
  );
end $$;

revoke all on function public.shared_inventory_sales_invoice_confirm_with_register(uuid,text,uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.shared_inventory_sales_invoice_confirm_with_register(uuid,text,uuid,boolean,text)
  to service_role;

begin;

-- 281 stores a service classification after the legacy invoice writer has
-- created its rows. Older callers may omit line IDs, in which case the legacy
-- writer generates them and the post-write update cannot match the payload.
-- Normalize IDs before delegation so every classified service line is updated
-- through the same stable identifier.
create or replace function public.shared_inventory_sales_invoice_save(
  p_tenant_id uuid, p_invoice jsonb, p_items jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_item jsonb; v_code text;
begin
  select coalesce(jsonb_agg(
    case when nullif(btrim(item.value->>'id'), '') is null
      then jsonb_set(item.value, '{id}', to_jsonb(gen_random_uuid()::text))
      else item.value
    end order by item.ordinality
  ), '[]'::jsonb)
  into p_items
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as item(value, ordinality);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_code := nullif(btrim(v_item->>'service_tax_code'), '');
    if length(v_code) > 128 then raise exception 'TAXATION_PROFILE_INVALID'; end if;
    if v_code is not null and nullif(v_item->>'producto_id', '') is not null then
      raise exception 'TAXATION_PROFILE_INVALID';
    end if;
    if v_code is not null and not exists (
      select 1 from public.shared_service_tax_profiles p
      where p.tenant_id = p_tenant_id and p.company_id = p_invoice->>'empresa_id'
        and p.service_code = v_code
    ) then raise exception 'TAXATION_PROFILE_NOT_FOUND'; end if;
  end loop;

  v_result := public.shared_inventory_sales_invoice_save_service_tax_base(p_tenant_id, p_invoice, p_items);
  update public.shared_inventory_sales_invoice_items i
  set service_tax_code = nullif(btrim(item.value->>'service_tax_code'), '')
  from jsonb_array_elements(p_items) item
  where i.tenant_id = p_tenant_id and i.invoice_id = v_result->>'id'
    and i.id = item.value->>'id';
  return v_result;
end;
$$;

revoke all on function public.shared_inventory_sales_invoice_save(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.shared_inventory_sales_invoice_save(uuid, jsonb, jsonb) to service_role;

commit;

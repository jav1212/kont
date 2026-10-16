-- Bounded, company-scoped read for the visible page of the Web product catalog.
-- Values remain in the typed tables; legacy JSONB is not read or rewritten here.
create or replace function public.get_native_product_custom_field_values_batch(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_company_id text,
  p_product_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_result jsonb;
begin
  v_tenant := public.native_products_assert_access(p_actor_user_id, p_organization_id, p_company_id);
  if p_product_ids is null or cardinality(p_product_ids) > 50
    or cardinality(p_product_ids) <> (select count(distinct requested.id) from unnest(p_product_ids) requested(id)) then
    raise exception 'PRODUCT_CUSTOM_FIELDS_INVALID';
  end if;

  select coalesce(jsonb_object_agg(product.id, jsonb_build_object(
    'values', coalesce(custom_values.values, '{}'::jsonb),
    'version', coalesce(custom_values.version, 0)
  )), '{}'::jsonb)
  into v_result
  from unnest(p_product_ids) requested(id)
  join public.shared_inventory_products product
    on product.tenant_id = v_tenant
    and product.company_id = p_company_id
    and product.id = requested.id
  left join public.shared_inventory_product_custom_field_values custom_values
    on custom_values.tenant_id = v_tenant
    and custom_values.company_id = p_company_id
    and custom_values.product_id = product.id;

  return v_result;
end;
$$;

revoke all on function public.get_native_product_custom_field_values_batch(uuid, uuid, text, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.get_native_product_custom_field_values_batch(uuid, uuid, text, text[])
  to service_role;

-- Reversible RPC contract check for ADM-053. Run only against development.
-- All fixture selection is internal to the transaction; no identifiers are returned.
begin;
set local role service_role;

do $smoke$
declare
  fixture record;
  catalog_result jsonb;
  values_result jsonb;
  catalog_read jsonb;
  values_read jsonb;
begin
  select c.organization_id, c.id as company_id, p.id as product_id, m.user_id as actor_user_id
    into fixture
    from public.shared_companies c
    join public.shared_inventory_products p on p.tenant_id = c.tenant_id and p.company_id = c.id
    join public.organization_memberships m on m.organization_id = c.organization_id and m.status = 'active'
   where c.organization_id is not null
   limit 1;

  if not found then raise exception 'No development fixture is available'; end if;

  catalog_result := public.replace_native_product_custom_field_catalog(
    fixture.actor_user_id, fixture.organization_id, fixture.company_id, 0,
    '[{"id":"mcp-smoke","label":"Smoke rollback","type":"text","required":false,"maxLength":40}]'::jsonb
  );
  if catalog_result->>'version' <> '1' then raise exception 'Catalog write check failed'; end if;

  values_result := public.replace_native_product_custom_field_values(
    fixture.actor_user_id, fixture.organization_id, fixture.company_id, fixture.product_id, 0,
    '{"mcp-smoke":"validated"}'::jsonb
  );
  if values_result->>'version' <> '1' then raise exception 'Value write check failed'; end if;

  catalog_read := public.get_native_product_custom_field_catalog(
    fixture.actor_user_id, fixture.organization_id, fixture.company_id
  );
  values_read := public.get_native_product_custom_field_values(
    fixture.actor_user_id, fixture.organization_id, fixture.company_id, fixture.product_id
  );
  if catalog_read->>'version' <> '1' or values_read->'values'->>'mcp-smoke' <> 'validated' then
    raise exception 'RPC read check failed';
  end if;

  begin
    perform public.replace_native_product_custom_field_values(
      fixture.actor_user_id, fixture.organization_id, fixture.company_id, fixture.product_id, 1,
      '{"mcp-smoke":42}'::jsonb
    );
    raise exception 'Expected invalid field type to be rejected';
  exception when others then
    if sqlerrm not like '%PRODUCT_CUSTOM_FIELDS_INVALID%' then raise; end if;
  end;

  begin
    perform public.replace_native_product_custom_field_values(
      fixture.actor_user_id, fixture.organization_id, fixture.company_id, fixture.product_id, 0,
      '{"mcp-smoke":"stale"}'::jsonb
    );
    raise exception 'Expected stale revision to be rejected';
  exception when others then
    if sqlerrm not like '%PRODUCT_CUSTOM_FIELDS_VERSION_CONFLICT%' then raise; end if;
  end;
end
$smoke$;

rollback;

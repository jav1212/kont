-- Run only on the authorized development project. All fixture changes roll back.
begin;
set local role service_role;

do $smoke$
declare
  v_actor uuid;
  v_organization uuid;
  v_company text;
  v_category text;
  v_category_name text;
  v_alias text := 'ADM029-SMOKE-' || gen_random_uuid()::text;
  v_created jsonb;
  v_retired jsonb;
  v_resolved jsonb;
  v_list jsonb;
  v_alias_id uuid;
begin
  select m.user_id, m.organization_id, c.id, d.id, d.name
  into strict v_actor, v_organization, v_company, v_category, v_category_name
  from public.shared_inventory_departments d
  join public.shared_companies c on c.tenant_id = d.tenant_id and c.id = d.company_id
  join public.organization_memberships m on m.organization_id = c.organization_id
  join public.organization_roles r on r.id = m.role_id and r.organization_id = m.organization_id
  join public.organization_role_permissions rp on rp.role_id = r.id
  where d.active and m.status = 'active' and r.status = 'active'
    and rp.permission_code = 'inventory.update'
  limit 1;

  v_created := public.create_native_product_category_alias(
    v_actor, v_organization, v_company, v_category, v_alias
  );
  v_alias_id := (v_created->>'id')::uuid;
  perform set_config('adm029.smoke_alias', v_alias, true);
  if v_created->>'status' <> 'active' or (v_created->>'version')::integer <> 1 then
    raise exception 'ADM029 smoke failed: create response';
  end if;

  v_list := public.list_native_product_category_aliases(
    v_actor, v_organization, v_company, v_category
  );
  if jsonb_array_length(v_list) < 1 or not exists (
    select 1 from jsonb_array_elements(v_list) item where item->>'id' = v_alias_id::text
  ) then raise exception 'ADM029 smoke failed: list'; end if;

  v_resolved := public.resolve_native_product_category_alias(
    v_actor, v_organization, v_company, v_alias
  );
  if v_resolved->>'categoryId' <> v_category or v_resolved->>'matchedAs' <> 'alias' then
    raise exception 'ADM029 smoke failed: alias resolution';
  end if;
  v_resolved := public.resolve_native_product_category_alias(
    v_actor, v_organization, v_company, v_category_name
  );
  if v_resolved->>'categoryId' <> v_category or v_resolved->>'matchedAs' <> 'canonical' then
    raise exception 'ADM029 smoke failed: canonical resolution';
  end if;

  begin
    perform public.create_native_product_category_alias(
      v_actor, v_organization, v_company, v_category, v_alias
    );
    raise exception 'ADM029 smoke failed: duplicate alias was accepted';
  exception when others then
    if sqlerrm not like '%PRODUCT_DUPLICATE_CATEGORY_ALIAS%' then raise; end if;
  end;
  begin
    perform public.create_native_product_category_alias(
      v_actor, v_organization, v_company, v_category, v_category_name
    );
    raise exception 'ADM029 smoke failed: canonical collision was accepted';
  exception when others then
    if sqlerrm not like '%PRODUCT_CATEGORY_ALIAS_CONFLICT%' then raise; end if;
  end;

  v_retired := public.retire_native_product_category_alias(
    v_actor, v_organization, v_company, v_alias_id, 1
  );
  if v_retired->>'status' <> 'retired' or (v_retired->>'version')::integer <> 2 then
    raise exception 'ADM029 smoke failed: retire transition';
  end if;
  v_retired := public.retire_native_product_category_alias(
    v_actor, v_organization, v_company, v_alias_id, 1
  );
  if v_retired->>'status' <> 'retired' or (v_retired->>'version')::integer <> 2 then
    raise exception 'ADM029 smoke failed: idempotent retire';
  end if;
  begin
    perform public.retire_native_product_category_alias(
      v_actor, v_organization, v_company, v_alias_id, 0
    );
    raise exception 'ADM029 smoke failed: invalid revision was accepted';
  exception when others then
    if sqlerrm not like '%PRODUCT_CATEGORY_ALIAS_INVALID%' then raise; end if;
  end;
  v_resolved := public.resolve_native_product_category_alias(
    v_actor, v_organization, v_company, v_alias
  );
  if v_resolved is not null then raise exception 'ADM029 smoke failed: retired alias still resolves'; end if;
end;
$smoke$;

reset role;
do $audit$
declare v_event_count integer;
begin
  select count(*) into v_event_count
  from public.shared_inventory_product_category_alias_events
  where alias = current_setting('adm029.smoke_alias');
  if v_event_count <> 2 then raise exception 'ADM029 smoke failed: audit history'; end if;
end;
$audit$;

rollback;

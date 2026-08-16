-- Administrative read model for the historical inventory "departments".
-- Portable clients call them ProductCategory; production Web remains unchanged.
create index if not exists shared_inventory_products_category_count_idx
  on public.shared_inventory_products(tenant_id,company_id,department_id);

create or replace function public.native_product_category_overview_item(
  p_tenant uuid,p_company_id text,p_category_id text
) returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object(
    'category',jsonb_build_object(
      'id',d.id,'companyId',d.company_id,'legacyCategoryId',d.id,
      'name',d.name,'description',nullif(d.description,''),
      'status',case when d.active then 'active' else 'inactive' end,'version',d.version
    ),
    'productCount',(select count(*)::integer from public.shared_inventory_products p
      where p.tenant_id=d.tenant_id and p.company_id=d.company_id and p.department_id=d.id),
    'createdAt',d.created_at,'updatedAt',d.updated_at
  )
  from public.shared_inventory_departments d
  where d.tenant_id=p_tenant and d.company_id=p_company_id and d.id=p_category_id;
$$;

create or replace function public.get_native_product_category(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_category_id text
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid;
begin
  v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);
  return public.native_product_category_overview_item(v_tenant,p_company_id,p_category_id);
end;
$$;

create or replace function public.list_native_product_category_overview(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,
  p_search text default null,p_status text default 'all',p_sort text default 'name',
  p_direction text default 'asc',p_cursor text default null,p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid;v_offset integer:=0;v_total integer;v_items jsonb;v_next text;v_summary jsonb;
begin
  v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);
  if p_limit<1 or p_limit>100 or p_status not in('active','inactive','all') or p_sort not in('name','products','updatedAt') or p_direction not in('asc','desc') then raise exception 'PRODUCT_CATEGORY_INVALID';end if;
  if p_cursor is not null then begin v_offset:=convert_from(decode(p_cursor,'base64'),'utf8')::integer;exception when others then raise exception 'PRODUCT_CATEGORY_INVALID';end;end if;
  with category_counts as(
    select d.id,d.name,d.updated_at,count(p.id)::integer product_count
    from public.shared_inventory_departments d left join public.shared_inventory_products p
      on p.tenant_id=d.tenant_id and p.company_id=d.company_id and p.department_id=d.id
    where d.tenant_id=v_tenant and d.company_id=p_company_id
      and(p_search is null or d.name ilike '%'||p_search||'%' or d.description ilike '%'||p_search||'%')
      and(p_status='all' or(p_status='active')=d.active)
    group by d.tenant_id,d.id,d.name,d.updated_at
  ) select count(*) into v_total from category_counts;
  with category_counts as(
    select d.id,d.name,d.updated_at,count(p.id)::integer product_count
    from public.shared_inventory_departments d left join public.shared_inventory_products p
      on p.tenant_id=d.tenant_id and p.company_id=d.company_id and p.department_id=d.id
    where d.tenant_id=v_tenant and d.company_id=p_company_id
      and(p_search is null or d.name ilike '%'||p_search||'%' or d.description ilike '%'||p_search||'%')
      and(p_status='all' or(p_status='active')=d.active)
    group by d.tenant_id,d.id,d.name,d.updated_at
    order by
      case when p_sort='name' and p_direction='asc' then lower(d.name) end asc,
      case when p_sort='name' and p_direction='desc' then lower(d.name) end desc,
      case when p_sort='products' and p_direction='asc' then count(p.id) end asc,
      case when p_sort='products' and p_direction='desc' then count(p.id) end desc,
      case when p_sort='updatedAt' and p_direction='asc' then d.updated_at end asc,
      case when p_sort='updatedAt' and p_direction='desc' then d.updated_at end desc,d.id
    offset v_offset limit p_limit
  ) select coalesce(jsonb_agg(public.native_product_category_overview_item(v_tenant,p_company_id,id)),'[]'::jsonb) into v_items from category_counts;
  if v_offset+p_limit<v_total then v_next:=encode(convert_to((v_offset+p_limit)::text,'utf8'),'base64');end if;
  select jsonb_build_object(
    'active',count(*)filter(where active)::integer,'inactive',count(*)filter(where not active)::integer,
    'inUse',count(*)filter(where product_count>0)::integer,'unused',count(*)filter(where product_count=0)::integer,
    'unassignedProducts',(select count(*)::integer from public.shared_inventory_products p where p.tenant_id=v_tenant and p.company_id=p_company_id and p.department_id is null)
  ) into v_summary from(
    select d.active,count(p.id) product_count from public.shared_inventory_departments d
    left join public.shared_inventory_products p on p.tenant_id=d.tenant_id and p.company_id=d.company_id and p.department_id=d.id
    where d.tenant_id=v_tenant and d.company_id=p_company_id group by d.tenant_id,d.id,d.active
  ) counts;
  return jsonb_build_object('items',v_items,'nextCursor',v_next,'total',v_total,'summary',v_summary);
end;
$$;

do $$declare r record;begin for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('native_product_category_overview_item','get_native_product_category','list_native_product_category_overview') loop execute format('revoke all on function %s from public,anon,authenticated',r.signature);execute format('grant execute on function %s to service_role',r.signature);end loop;end$$;

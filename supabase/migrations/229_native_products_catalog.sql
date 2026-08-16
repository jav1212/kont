-- Portable product catalog for native clients. The existing shared inventory
-- tables remain the Web source of truth while adapters translate legacy names
-- and units into the products bounded context.
alter table public.shared_inventory_products add column if not exists version integer not null default 1;
alter table public.shared_inventory_departments add column if not exists version integer not null default 1;
alter table public.shared_inventory_departments add column if not exists updated_at timestamptz not null default now();

create table if not exists public.shared_product_barcodes(
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id text not null,
  product_id text not null,
  value text not null,
  created_at timestamptz not null default now(),
  primary key(tenant_id,product_id,value),
  foreign key(tenant_id,product_id) references public.shared_inventory_products(tenant_id,id) on delete cascade,
  foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade,
  check(value=btrim(value) and length(value)between 1 and 128)
);
create unique index if not exists shared_product_barcodes_company_value_uidx on public.shared_product_barcodes(tenant_id,company_id,value);
insert into public.shared_product_barcodes(tenant_id,company_id,product_id,value)
select tenant_id,company_id,id,btrim(barcode) from public.shared_inventory_products where nullif(btrim(barcode),'')is not null
on conflict do nothing;

create table if not exists public.shared_inventory_product_profiles(
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id text not null,
  product_id text not null,
  minimum_quantity numeric(14,4),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key(tenant_id,product_id),
  foreign key(tenant_id,product_id) references public.shared_inventory_products(tenant_id,id) on delete cascade,
  foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade,
  check(minimum_quantity is null or minimum_quantity>=0)
);
insert into public.shared_inventory_product_profiles(tenant_id,company_id,product_id)
select tenant_id,company_id,id from public.shared_inventory_products on conflict do nothing;

-- Legacy catalogs may contain duplicate non-empty codes. Native writes enforce
-- uniqueness transactionally without making the additive migration fail for
-- those historical rows; a later audited cleanup can add a physical index.

alter table public.shared_product_barcodes enable row level security;
alter table public.shared_inventory_product_profiles enable row level security;
revoke all on public.shared_product_barcodes,public.shared_inventory_product_profiles from anon,authenticated;

create or replace function public.native_products_assert_access(p_actor_user_id uuid,p_organization_id uuid,p_company_id text)
returns uuid language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid;v_allowed boolean;
begin
 select tenant_id into v_tenant from public.shared_companies where organization_id=p_organization_id and id=p_company_id;
 if v_tenant is null then raise exception 'PRODUCT_OUTSIDE_COMPANY';end if;
 select exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_actor_user_id and status='active')or exists(
  select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id
  join public.organization_delegation_scopes s on s.delegation_id=d.id and s.scope='inventory'
  where a.user_id=p_actor_user_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active'
    and d.valid_from<=now()and(d.valid_until is null or d.valid_until>now()))into v_allowed;
 if not coalesce(v_allowed,false)then raise exception 'PRODUCT_ACCESS_DENIED';end if;
 return v_tenant;
end$$;

create or replace function public.native_product_unit(p_legacy text)returns text language sql immutable as $$select case p_legacy
 when'unidad'then'each' when'kg'then'kilogram' when'g'then'gram' when'm'then'meter' when'm2'then'square_meter'
 when'm3'then'cubic_meter' when'litro'then'liter' when'galon'then'gallon' when'caja'then'box' when'rollo'then'roll'
 when'paquete'then'package' else'each'end$$;
create or replace function public.native_product_legacy_unit(p_unit text)returns text language sql immutable as $$select case p_unit
 when'each'then'unidad' when'kilogram'then'kg' when'gram'then'g' when'meter'then'm' when'square_meter'then'm2'
 when'cubic_meter'then'm3' when'liter'then'litro' when'gallon'then'galon' when'box'then'caja' when'roll'then'rollo'
 when'package'then'paquete' else null end$$;

create or replace function public.native_product_json(p_tenant uuid,p_product_id text)returns jsonb language sql stable set search_path=public as $$
 select jsonb_build_object('id',p.id,'companyId',p.company_id,'legacyProductId',p.id,'sku',p.code,
  'barcodes',coalesce((select jsonb_agg(b.value order by b.created_at,b.value)from public.shared_product_barcodes b where b.tenant_id=p.tenant_id and b.product_id=p.id),'[]'::jsonb),
  'name',p.name,'description',nullif(p.description,''),'category',case when d.id is null then null else jsonb_build_object('id',d.id,'companyId',d.company_id,'legacyCategoryId',d.id,'name',d.name,'description',nullif(d.description,''),'status',case when d.active then'active'else'inactive'end,'version',d.version)end,
  'baseUnit',public.native_product_unit(p.measure_unit),'status',case when p.active then'active'else'inactive'end,'version',p.version,'updatedAt',p.updated_at,
  'inventory',jsonb_build_object('onHand',jsonb_build_object('quantity',p.current_stock::text,'unit',public.native_product_unit(p.measure_unit)),
    'replenishment',jsonb_build_object('minimumQuantity',ip.minimum_quantity::text,'state',case when p.current_stock<=0 then'out'when ip.minimum_quantity is not null and p.current_stock<=ip.minimum_quantity then'low'else'available'end,'version',ip.version,'updatedAt',ip.updated_at),
    'valuation',jsonb_build_object('unitCost',p.average_cost::text,'totalValue',round(p.current_stock*p.average_cost,2)::text,'currency','VES')),
  'capabilities',jsonb_build_object('inventoryEnabled',true,'locationTracking',false,'lotTracking',false))
 from public.shared_inventory_products p left join public.shared_inventory_departments d on d.tenant_id=p.tenant_id and d.id=p.department_id
 left join public.shared_inventory_product_profiles ip on ip.tenant_id=p.tenant_id and ip.product_id=p.id
 where p.tenant_id=p_tenant and p.id=p_product_id;
$$;

create or replace function public.list_native_products(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_search text default null,p_status text default'all',p_category_id text default null,p_stock text default'all',p_sort text default'name',p_direction text default'asc',p_cursor text default null,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tenant uuid;v_offset integer:=0;v_total integer;v_items jsonb;v_summary jsonb;v_next text;
begin
 v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);
 if p_limit<1 or p_limit>100 or p_status not in('active','inactive','all')or p_stock not in('all','available','low','out')or p_sort not in('name','sku','stock','value','updatedAt')or p_direction not in('asc','desc')then raise exception'PRODUCT_INVALID';end if;
 if p_cursor is not null then begin v_offset:=convert_from(decode(p_cursor,'base64'),'utf8')::integer;exception when others then raise exception'PRODUCT_INVALID';end;end if;
 with filtered as(select p.id from public.shared_inventory_products p left join public.shared_inventory_product_profiles ip on ip.tenant_id=p.tenant_id and ip.product_id=p.id
  where p.tenant_id=v_tenant and p.company_id=p_company_id and(p_search is null or p.name ilike'%'||p_search||'%'or p.code ilike'%'||p_search||'%'or exists(select 1 from public.shared_product_barcodes b where b.tenant_id=p.tenant_id and b.product_id=p.id and b.value ilike'%'||p_search||'%'))
   and(p_status='all'or(p_status='active')=p.active)and(p_category_id is null or p.department_id=p_category_id)
   and(p_stock='all'or p_stock=case when p.current_stock<=0 then'out'when ip.minimum_quantity is not null and p.current_stock<=ip.minimum_quantity then'low'else'available'end))
 select count(*)into v_total from filtered;
 with filtered as(select p.* from public.shared_inventory_products p left join public.shared_inventory_product_profiles ip on ip.tenant_id=p.tenant_id and ip.product_id=p.id
  where p.tenant_id=v_tenant and p.company_id=p_company_id and(p_search is null or p.name ilike'%'||p_search||'%'or p.code ilike'%'||p_search||'%'or exists(select 1 from public.shared_product_barcodes b where b.tenant_id=p.tenant_id and b.product_id=p.id and b.value ilike'%'||p_search||'%'))
   and(p_status='all'or(p_status='active')=p.active)and(p_category_id is null or p.department_id=p_category_id)
   and(p_stock='all'or p_stock=case when p.current_stock<=0 then'out'when ip.minimum_quantity is not null and p.current_stock<=ip.minimum_quantity then'low'else'available'end)
  order by case when p_direction='asc'and p_sort='name'then lower(p.name)end asc,case when p_direction='desc'and p_sort='name'then lower(p.name)end desc,
   case when p_direction='asc'and p_sort='sku'then lower(p.code)end asc,case when p_direction='desc'and p_sort='sku'then lower(p.code)end desc,
   case when p_direction='asc'and p_sort='stock'then p.current_stock end asc,case when p_direction='desc'and p_sort='stock'then p.current_stock end desc,
   case when p_direction='asc'and p_sort='value'then p.current_stock*p.average_cost end asc,case when p_direction='desc'and p_sort='value'then p.current_stock*p.average_cost end desc,
   case when p_direction='asc'and p_sort='updatedAt'then p.updated_at end asc,case when p_direction='desc'and p_sort='updatedAt'then p.updated_at end desc,p.id asc offset v_offset limit p_limit)
 select coalesce(jsonb_agg(public.native_product_json(v_tenant,id)),'[]'::jsonb)into v_items from filtered;
 select jsonb_build_object('active',count(*)filter(where active),'inactive',count(*)filter(where not active),
  'lowStock',count(*)filter(where current_stock>0 and minimum_quantity is not null and current_stock<=minimum_quantity),'outOfStock',count(*)filter(where current_stock<=0),
  'inventoryValue',jsonb_build_object('amount',coalesce(round(sum(current_stock*average_cost),2),0)::text,'currency','VES'))into v_summary
 from(select p.active,p.current_stock,p.average_cost,ip.minimum_quantity from public.shared_inventory_products p left join public.shared_inventory_product_profiles ip on ip.tenant_id=p.tenant_id and ip.product_id=p.id where p.tenant_id=v_tenant and p.company_id=p_company_id)s;
 if v_offset+p_limit<v_total then v_next:=encode(convert_to((v_offset+p_limit)::text,'utf8'),'base64');end if;
 return jsonb_build_object('items',v_items,'nextCursor',v_next,'total',v_total,'summary',v_summary);
end$$;

create or replace function public.get_native_product(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_product_id text)
returns jsonb language plpgsql stable security definer set search_path=public as $$declare v_tenant uuid;begin v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);return public.native_product_json(v_tenant,p_product_id);end$$;

create or replace function public.create_native_product(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_sku text,p_barcodes text[],p_name text,p_description text,p_category_id text,p_base_unit text)
returns jsonb language plpgsql security definer set search_path=public as $$declare v_tenant uuid;v_id text:=gen_random_uuid()::text;v_barcode text;begin
 v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);
 if public.native_product_legacy_unit(p_base_unit)is null or nullif(btrim(p_sku),'')is null or nullif(btrim(p_name),'')is null then raise exception'PRODUCT_INVALID';end if;
 if p_category_id is not null and not exists(select 1 from public.shared_inventory_departments where tenant_id=v_tenant and company_id=p_company_id and id=p_category_id and active)then raise exception'PRODUCT_CATEGORY_NOT_FOUND';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||p_company_id||':sku:'||upper(btrim(p_sku)),0));
 if exists(select 1 from public.shared_inventory_products where tenant_id=v_tenant and company_id=p_company_id and upper(btrim(code))=upper(btrim(p_sku)))then raise exception'PRODUCT_DUPLICATE_SKU';end if;
 begin insert into public.shared_inventory_products(tenant_id,id,company_id,code,name,description,type,measure_unit,valuation_method,active,department_id,version)values(v_tenant,v_id,p_company_id,upper(btrim(p_sku)),btrim(p_name),coalesce(btrim(p_description),''),'mercancia',public.native_product_legacy_unit(p_base_unit),'promedio_ponderado',true,p_category_id,1);
 foreach v_barcode in array coalesce(p_barcodes,array[]::text[])loop insert into public.shared_product_barcodes values(v_tenant,p_company_id,v_id,btrim(v_barcode),now());end loop;
 insert into public.shared_inventory_product_profiles(tenant_id,company_id,product_id)values(v_tenant,p_company_id,v_id);
 exception when unique_violation then if sqlerrm ilike'%barcode%'then raise exception'PRODUCT_DUPLICATE_BARCODE';else raise exception'PRODUCT_DUPLICATE_SKU';end if;end;
 return public.native_product_json(v_tenant,v_id);end$$;

create or replace function public.update_native_product(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_product_id text,p_expected_version integer,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$declare v_tenant uuid;v_found integer;v_barcode text;begin
 v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);
 if p_changes?'baseUnit'and public.native_product_legacy_unit(p_changes->>'baseUnit')is null then raise exception'PRODUCT_INVALID';end if;
 if p_changes?'categoryId'and p_changes->>'categoryId'is not null and not exists(select 1 from public.shared_inventory_departments where tenant_id=v_tenant and company_id=p_company_id and id=p_changes->>'categoryId'and active)then raise exception'PRODUCT_CATEGORY_NOT_FOUND';end if;
 if p_changes?'sku'then perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||p_company_id||':sku:'||upper(btrim(p_changes->>'sku')),0));if exists(select 1 from public.shared_inventory_products where tenant_id=v_tenant and company_id=p_company_id and id<>p_product_id and upper(btrim(code))=upper(btrim(p_changes->>'sku')))then raise exception'PRODUCT_DUPLICATE_SKU';end if;end if;
 begin update public.shared_inventory_products set code=case when p_changes?'sku'then upper(btrim(p_changes->>'sku'))else code end,name=case when p_changes?'name'then btrim(p_changes->>'name')else name end,
  description=case when p_changes?'description'then coalesce(btrim(p_changes->>'description'),'')else description end,department_id=case when p_changes?'categoryId'then nullif(p_changes->>'categoryId','')else department_id end,
  measure_unit=case when p_changes?'baseUnit'then public.native_product_legacy_unit(p_changes->>'baseUnit')else measure_unit end,version=version+1,updated_at=now()
  where tenant_id=v_tenant and company_id=p_company_id and id=p_product_id and version=p_expected_version;get diagnostics v_found=row_count;
  if v_found=0 then if exists(select 1 from public.shared_inventory_products where tenant_id=v_tenant and company_id=p_company_id and id=p_product_id)then raise exception'PRODUCT_VERSION_CONFLICT';else raise exception'PRODUCT_NOT_FOUND';end if;end if;
  if p_changes?'barcodes'then delete from public.shared_product_barcodes where tenant_id=v_tenant and product_id=p_product_id;foreach v_barcode in array coalesce((select array_agg(value)from jsonb_array_elements_text(p_changes->'barcodes')value),array[]::text[])loop insert into public.shared_product_barcodes values(v_tenant,p_company_id,p_product_id,btrim(v_barcode),now());end loop;end if;
 exception when unique_violation then if sqlerrm ilike'%barcode%'then raise exception'PRODUCT_DUPLICATE_BARCODE';else raise exception'PRODUCT_DUPLICATE_SKU';end if;end;
 return public.native_product_json(v_tenant,p_product_id);end$$;

create or replace function public.set_native_product_status(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_product_id text,p_expected_version integer,p_status text)
returns jsonb language plpgsql security definer set search_path=public as $$declare v_tenant uuid;v_found integer;begin v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);if p_status not in('active','inactive')then raise exception'PRODUCT_INVALID';end if;
 update public.shared_inventory_products set active=p_status='active',version=version+1,updated_at=now()where tenant_id=v_tenant and company_id=p_company_id and id=p_product_id and version=p_expected_version and active<>(p_status='active');get diagnostics v_found=row_count;
 if v_found=0 then if exists(select 1 from public.shared_inventory_products where tenant_id=v_tenant and company_id=p_company_id and id=p_product_id and version<>p_expected_version)then raise exception'PRODUCT_VERSION_CONFLICT';else raise exception'PRODUCT_TRANSITION_INVALID';end if;end if;return public.native_product_json(v_tenant,p_product_id);end$$;

create or replace function public.list_native_product_categories(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_status text default'all')returns jsonb language plpgsql stable security definer set search_path=public as $$declare v_tenant uuid;begin v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);return coalesce((select jsonb_agg(jsonb_build_object('id',id,'companyId',company_id,'legacyCategoryId',id,'name',name,'description',nullif(description,''),'status',case when active then'active'else'inactive'end,'version',version)order by name,id)from public.shared_inventory_departments where tenant_id=v_tenant and company_id=p_company_id and(p_status='all'or(p_status='active')=active)),'[]'::jsonb);end$$;
create or replace function public.save_native_product_category(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_category_id text,p_expected_version integer,p_name text,p_description text)
returns jsonb language plpgsql security definer set search_path=public as $$declare v_tenant uuid;v_id text:=coalesce(p_category_id,gen_random_uuid()::text);v_found integer;begin v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);if nullif(btrim(p_name),'')is null then raise exception'PRODUCT_CATEGORY_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||p_company_id||':category:'||lower(btrim(p_name)),0));if exists(select 1 from public.shared_inventory_departments where tenant_id=v_tenant and company_id=p_company_id and lower(btrim(name))=lower(btrim(p_name))and id<>v_id)then raise exception'PRODUCT_DUPLICATE_CATEGORY';end if;
 if p_category_id is null then insert into public.shared_inventory_departments(tenant_id,id,company_id,name,description,active,version)values(v_tenant,v_id,p_company_id,btrim(p_name),coalesce(btrim(p_description),''),true,1);else update public.shared_inventory_departments set name=btrim(p_name),description=coalesce(btrim(p_description),''),version=version+1,updated_at=now()where tenant_id=v_tenant and company_id=p_company_id and id=v_id and version=p_expected_version;get diagnostics v_found=row_count;if v_found=0 then if exists(select 1 from public.shared_inventory_departments where tenant_id=v_tenant and id=v_id)then raise exception'PRODUCT_CATEGORY_VERSION_CONFLICT';else raise exception'PRODUCT_CATEGORY_NOT_FOUND';end if;end if;end if;
 return(select jsonb_build_object('id',id,'companyId',company_id,'legacyCategoryId',id,'name',name,'description',nullif(description,''),'status',case when active then'active'else'inactive'end,'version',version)from public.shared_inventory_departments where tenant_id=v_tenant and id=v_id);exception when unique_violation then raise exception'PRODUCT_DUPLICATE_CATEGORY';end$$;
create or replace function public.set_native_product_category_status(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_category_id text,p_expected_version integer,p_status text)
returns jsonb language plpgsql security definer set search_path=public as $$declare v_tenant uuid;v_found integer;begin v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);update public.shared_inventory_departments set active=p_status='active',version=version+1,updated_at=now()where tenant_id=v_tenant and company_id=p_company_id and id=p_category_id and version=p_expected_version and active<>(p_status='active');get diagnostics v_found=row_count;if v_found=0 then raise exception'PRODUCT_CATEGORY_VERSION_CONFLICT';end if;return(select jsonb_build_object('id',id,'companyId',company_id,'legacyCategoryId',id,'name',name,'description',nullif(description,''),'status',case when active then'active'else'inactive'end,'version',version)from public.shared_inventory_departments where tenant_id=v_tenant and id=p_category_id);end$$;

create or replace function public.list_native_product_movements(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_product_id text,p_from date default null,p_to date default null,p_type text default null,p_location_id text default null,p_cursor text default null,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path=public as $$declare v_tenant uuid;v_offset integer:=0;v_items jsonb;v_count integer;v_unit text;begin v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);if p_location_id is not null then raise exception'PRODUCT_LOCATION_TRACKING_UNAVAILABLE';end if;if p_limit<1 or p_limit>100 then raise exception'PRODUCT_INVALID';end if;if p_cursor is not null then begin v_offset:=convert_from(decode(p_cursor,'base64'),'utf8')::integer;exception when others then raise exception'PRODUCT_INVALID';end;end if;select public.native_product_unit(measure_unit)into v_unit from public.shared_inventory_products where tenant_id=v_tenant and company_id=p_company_id and id=p_product_id;if v_unit is null then raise exception'PRODUCT_NOT_FOUND';end if;
 select count(*)into v_count from public.shared_inventory_movements where tenant_id=v_tenant and company_id=p_company_id and product_id=p_product_id and(p_from is null or date>=p_from)and(p_to is null or date<=p_to)and(p_type is null or type=p_type);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'effectiveDate',date,'type',type,'quantity',jsonb_build_object('value',quantity::text,'unit',v_unit),'unitCost',jsonb_build_object('amount',unit_cost::text,'currency','VES'),'totalCost',jsonb_build_object('amount',total_cost::text,'currency','VES'),'balanceQuantity',balance_quantity::text,'reference',nullif(reference,''),'notes',nullif(notes,''),'createdAt',created_at)order by date desc,created_at desc,id desc),'[]'::jsonb)into v_items from(select * from public.shared_inventory_movements where tenant_id=v_tenant and company_id=p_company_id and product_id=p_product_id and(p_from is null or date>=p_from)and(p_to is null or date<=p_to)and(p_type is null or type=p_type)order by date desc,created_at desc,id desc offset v_offset limit p_limit)s;
 return jsonb_build_object('items',v_items,'nextCursor',case when v_offset+p_limit<v_count then encode(convert_to((v_offset+p_limit)::text,'utf8'),'base64')else null end);end$$;

create or replace function public.update_native_replenishment_policy(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_product_id text,p_minimum_quantity numeric,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$declare v_tenant uuid;v_found integer;v_result jsonb;begin v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);if p_minimum_quantity<0 then raise exception'INVENTORY_PROFILE_INVALID';end if;
 update public.shared_inventory_product_profiles set minimum_quantity=p_minimum_quantity,version=version+1,updated_at=now()where tenant_id=v_tenant and company_id=p_company_id and product_id=p_product_id and version=p_expected_version returning jsonb_build_object('companyId',company_id,'productId',product_id,'unit',(select public.native_product_unit(measure_unit)from public.shared_inventory_products where tenant_id=v_tenant and id=p_product_id),'minimumQuantity',minimum_quantity::text,'version',version,'updatedAt',updated_at)into v_result;get diagnostics v_found=row_count;
 if v_found=0 then if exists(select 1 from public.shared_inventory_product_profiles where tenant_id=v_tenant and product_id=p_product_id)then raise exception'INVENTORY_PROFILE_VERSION_CONFLICT';else raise exception'PRODUCT_NOT_FOUND';end if;end if;return v_result;end$$;

do $$declare r record;begin for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname in('native_products_assert_access','native_product_json','list_native_products','get_native_product','create_native_product','update_native_product','set_native_product_status','list_native_product_categories','save_native_product_category','set_native_product_category_status','list_native_product_movements','update_native_replenishment_policy')loop execute format('revoke all on function %s from public,anon,authenticated',r.signature);execute format('grant execute on function %s to service_role',r.signature);end loop;end$$;

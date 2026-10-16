-- ADM-005: copy only selected product master records between two companies.
-- Stock, costs, movements, pricing, tax fields, custom fields, composition and historical IDs are intentionally absent.

create table public.shared_product_catalog_import_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_user_id uuid not null,
  source_company_id text not null,
  destination_company_id text not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 128),
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id, actor_user_id, idempotency_key)
);
create table public.shared_product_catalog_import_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.shared_product_catalog_import_requests(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_user_id uuid not null,
  source_company_id text not null,
  destination_company_id text not null,
  selection jsonb not null,
  created_category_count integer not null check (created_category_count >= 0),
  created_product_count integer not null check (created_product_count >= 0),
  skipped_category_count integer not null check (skipped_category_count >= 0),
  skipped_product_count integer not null check (skipped_product_count >= 0),
  occurred_at timestamptz not null default now()
);
create index shared_product_catalog_import_events_organization_idx on public.shared_product_catalog_import_events(organization_id, occurred_at desc);
create index shared_product_catalog_import_events_request_idx on public.shared_product_catalog_import_events(request_id);
create index shared_product_catalog_import_requests_tenant_idx on public.shared_product_catalog_import_requests(tenant_id);
create index shared_product_catalog_import_events_tenant_idx on public.shared_product_catalog_import_events(tenant_id);
alter table public.shared_product_catalog_import_requests enable row level security;
alter table public.shared_product_catalog_import_events enable row level security;
revoke all on public.shared_product_catalog_import_requests, public.shared_product_catalog_import_events from public, anon, authenticated, service_role;
create or replace function public.prevent_product_catalog_import_event_update() returns trigger language plpgsql set search_path=public as $$ begin raise exception 'PRODUCT_CATALOG_IMPORT_EVENT_IMMUTABLE'; end $$;
revoke all on function public.prevent_product_catalog_import_event_update() from public, anon, authenticated, service_role;
create trigger shared_product_catalog_import_events_immutable before update on public.shared_product_catalog_import_events for each row execute function public.prevent_product_catalog_import_event_update();
create trigger shared_product_catalog_import_events_immutable_delete before delete on public.shared_product_catalog_import_events for each row execute function public.prevent_product_catalog_import_event_update();
create trigger shared_product_catalog_import_events_immutable_truncate before truncate on public.shared_product_catalog_import_events for each statement execute function public.prevent_product_catalog_import_event_update();

create or replace function public.product_catalog_import_selection_valid(p_selection jsonb) returns boolean language plpgsql immutable set search_path=public as $$
declare v_categories jsonb; v_products jsonb; v_count integer;
begin
 if p_selection is null or jsonb_typeof(p_selection) is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(p_selection) k where k not in ('sourceCategoryIds','sourceProductIds','conflictPolicy')) or not (p_selection ?& array['sourceCategoryIds','sourceProductIds','conflictPolicy']) then return false; end if;
 v_categories:=p_selection->'sourceCategoryIds'; v_products:=p_selection->'sourceProductIds';
 if jsonb_typeof(v_categories) is distinct from 'array' then return false; end if;
 if jsonb_typeof(v_products) is distinct from 'array' then return false; end if;
 if coalesce(p_selection->>'conflictPolicy','') not in ('fail','skip') then return false; end if;
 v_count:=jsonb_array_length(v_categories)+jsonb_array_length(v_products);
 if v_count not between 1 and 100 then return false; end if;
 if exists(select 1 from jsonb_array_elements(v_categories || v_products) value where jsonb_typeof(value)<>'string' or length(btrim(value#>>'{}')) not between 1 and 128) then return false; end if;
 if (select count(*) from jsonb_array_elements_text(v_categories))<>(select count(distinct value) from jsonb_array_elements_text(v_categories) value)
   or (select count(*) from jsonb_array_elements_text(v_products))<>(select count(distinct value) from jsonb_array_elements_text(v_products) value) then return false; end if;
 return true;
end $$;

create or replace function public.product_catalog_import_source_token(p_tenant uuid,p_source_company_id text,p_selection jsonb) returns text language sql volatile set search_path=public as $$
 with cats as (select d.id,d.name,d.description,d.active,d.version from public.shared_inventory_departments d where d.tenant_id=p_tenant and d.company_id=p_source_company_id and d.id in(select value from jsonb_array_elements_text(p_selection->'sourceCategoryIds')) order by d.id),
 products as (select p.id,p.code,p.name,p.description,p.measure_unit,p.active,p.department_id,p.version,p.type,p.composition_kind,p.barcode legacy_barcode,coalesce((select jsonb_agg(v.value order by v.value)from(select b.value from public.shared_product_barcodes b where b.tenant_id=p.tenant_id and b.product_id=p.id union select p.barcode where nullif(btrim(p.barcode),'') is not null) v),'[]'::jsonb) barcodes from public.shared_inventory_products p where p.tenant_id=p_tenant and p.company_id=p_source_company_id and p.id in(select value from jsonb_array_elements_text(p_selection->'sourceProductIds')) order by p.id)
 select encode(extensions.digest(jsonb_build_object('categories',coalesce((select jsonb_agg(to_jsonb(cats) order by cats.id)from cats),'[]'::jsonb),'products',coalesce((select jsonb_agg(to_jsonb(products) order by products.id)from products),'[]'::jsonb))::text,'sha256'),'hex');
$$;

create or replace function public.product_catalog_import_destination_token(p_tenant uuid,p_source_company_id text,p_destination_company_id text,p_selection jsonb) returns text language sql volatile set search_path=public as $$
 with source_cats as(select lower(btrim(d.name)) key from public.shared_inventory_departments d where d.tenant_id=p_tenant and d.company_id=p_source_company_id and d.id in(select value from jsonb_array_elements_text(p_selection->'sourceCategoryIds'))),
 source_products as(select lower(btrim(p.code)) sku,lower(btrim(p.name)) name,p.id from public.shared_inventory_products p where p.tenant_id=p_tenant and p.company_id=p_source_company_id and p.id in(select value from jsonb_array_elements_text(p_selection->'sourceProductIds'))),
 source_barcodes as(select b.value from public.shared_product_barcodes b join source_products p on p.id=b.product_id where b.tenant_id=p_tenant union select p.barcode from public.shared_inventory_products p join source_products s on s.id=p.id where nullif(btrim(p.barcode),'') is not null),
 matches as(select 'category' kind,d.id,lower(btrim(d.name)) key from public.shared_inventory_departments d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and lower(btrim(d.name)) in(select key from source_cats)
 union all select 'sku',p.id,lower(btrim(p.code)) from public.shared_inventory_products p where p.tenant_id=p_tenant and p.company_id=p_destination_company_id and lower(btrim(p.code)) in(select sku from source_products)
 union all select 'name',p.id,lower(btrim(p.name)) from public.shared_inventory_products p where p.tenant_id=p_tenant and p.company_id=p_destination_company_id and lower(btrim(p.name)) in(select name from source_products)
 union all select 'barcode',b.product_id,b.value from public.shared_product_barcodes b where b.tenant_id=p_tenant and b.company_id=p_destination_company_id and b.value in(select value from source_barcodes)
 union all select 'legacy_barcode',p.id,p.barcode from public.shared_inventory_products p where p.tenant_id=p_tenant and p.company_id=p_destination_company_id and nullif(btrim(p.barcode),'') is not null and p.barcode in(select value from source_barcodes))
 select encode(extensions.digest(coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'id',id,'key',key) order by kind,key,id)from matches),'[]'::jsonb)::text,'sha256'),'hex');
$$;

create or replace function public.product_catalog_import_preview_data(p_tenant uuid,p_source_company_id text,p_destination_company_id text,p_selection jsonb) returns jsonb language plpgsql volatile set search_path=public as $$
declare v_conflicts jsonb; v_categories integer; v_products integer;
begin
 if exists(select 1 from jsonb_array_elements_text(p_selection->'sourceCategoryIds') x where not exists(select 1 from public.shared_inventory_departments d where d.tenant_id=p_tenant and d.company_id=p_source_company_id and d.id=x.value))
   or exists(select 1 from jsonb_array_elements_text(p_selection->'sourceProductIds') x where not exists(select 1 from public.shared_inventory_products p where p.tenant_id=p_tenant and p.company_id=p_source_company_id and p.id=x.value)) then raise exception 'PRODUCT_CATALOG_IMPORT_INVALID'; end if;
 with selected_cats as(select d.id,lower(btrim(d.name)) key from public.shared_inventory_departments d where d.tenant_id=p_tenant and d.company_id=p_source_company_id and d.id in(select value from jsonb_array_elements_text(p_selection->'sourceCategoryIds'))),
 selected_products as(select p.id,p.department_id,lower(btrim(p.code)) sku,lower(btrim(p.name)) name from public.shared_inventory_products p where p.tenant_id=p_tenant and p.company_id=p_source_company_id and p.id in(select value from jsonb_array_elements_text(p_selection->'sourceProductIds'))),
 selected_barcodes as(select p.id,b.value from selected_products p join public.shared_product_barcodes b on b.tenant_id=p_tenant and b.product_id=p.id union select p.id,d.barcode from selected_products p join public.shared_inventory_products d on d.tenant_id=p_tenant and d.id=p.id where nullif(btrim(d.barcode),'') is not null),
 conflicts as(
  select 'category' kind,c.id source_id,'source_category_name_ambiguous' reason,null::text destination_id from selected_cats c where(select count(*)from selected_cats x where x.key=c.key)>1
  union all select 'category',c.id,'source_category_unsupported_master',null from selected_cats c join public.shared_inventory_departments d on d.tenant_id=p_tenant and d.id=c.id where length(btrim(d.name)) not between 1 and 120 or d.name~'[[:cntrl:]]' or length(d.description)>500
  union all select 'product',p.id,'source_product_sku_ambiguous',null from selected_products p where(select count(*)from selected_products x where x.sku=p.sku)>1
  union all select 'product',p.id,'source_product_name_ambiguous',null from selected_products p where(select count(*)from selected_products x where x.name=p.name)>1
  union all select 'product',b.id,'source_product_barcode_ambiguous',null from selected_barcodes b where(select count(distinct x.id)from selected_barcodes x where x.value=b.value)>1
  union all select 'product',p.id,'source_product_category_not_selected',null from selected_products p where p.department_id is not null and not exists(select 1 from selected_cats c where c.id=p.department_id)
  union all select 'product',p.id,'source_product_unsupported_master',null from selected_products p join public.shared_inventory_products s on s.tenant_id=p_tenant and s.id=p.id where length(btrim(s.code)) not between 1 and 64 or s.code~'[[:cntrl:]]' or length(btrim(s.name)) not between 1 and 200 or s.name~'[[:cntrl:]]' or length(s.description)>2000 or s.type<>'mercancia' or s.composition_kind<>'simple' or s.measure_unit not in('unidad','kg','g','m','m2','m3','litro','galon','caja','rollo','paquete')
  union all select 'product',p.id,'source_product_unsupported_master',null from selected_products p where exists(select 1 from public.shared_product_barcodes b where b.tenant_id=p_tenant and b.product_id=p.id and (b.value<>btrim(b.value) or length(b.value) not between 1 and 128 or b.value~'[[:cntrl:]]')) or exists(select 1 from public.shared_inventory_products s where s.tenant_id=p_tenant and s.id=p.id and s.barcode is not null and (s.barcode<>btrim(s.barcode) or length(s.barcode) not between 1 and 128 or s.barcode~'[[:cntrl:]]'))
  union all select 'category',c.id,case when(select count(*)from public.shared_inventory_departments d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and lower(btrim(d.name))=c.key)>1 then'destination_category_name_ambiguous'else'destination_category_name_exists'end,(select min(d.id)from public.shared_inventory_departments d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and lower(btrim(d.name))=c.key)from selected_cats c where exists(select 1 from public.shared_inventory_departments d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and lower(btrim(d.name))=c.key)
  union all select 'product',p.id,'destination_product_category_conflict',null from selected_products p where p.department_id is not null and exists(select 1 from selected_cats c join public.shared_inventory_departments source_category on source_category.tenant_id=p_tenant and source_category.id=c.id where c.id=p.department_id and ((select count(*) from selected_cats d where d.key=c.key)>1 or length(btrim(source_category.name)) not between 1 and 120 or source_category.name~'[[:cntrl:]]' or length(source_category.description)>500 or exists(select 1 from public.shared_inventory_departments d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and lower(btrim(d.name))=c.key)))
  union all select 'product',p.id,case when(select count(*)from public.shared_inventory_products d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and lower(btrim(d.code))=p.sku)>1 then'destination_product_sku_ambiguous'else'destination_product_sku_exists'end,(select min(d.id)from public.shared_inventory_products d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and lower(btrim(d.code))=p.sku)from selected_products p where exists(select 1 from public.shared_inventory_products d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and lower(btrim(d.code))=p.sku)
  union all select 'product',p.id,case when(select count(*)from public.shared_inventory_products d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and lower(btrim(d.name))=p.name)>1 then'destination_product_name_ambiguous'else'destination_product_name_exists'end,(select min(d.id)from public.shared_inventory_products d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and lower(btrim(d.name))=p.name)from selected_products p where exists(select 1 from public.shared_inventory_products d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and lower(btrim(d.name))=p.name)
  union all select 'product',b.id,case when(select count(distinct matched.product_id)from(select d.product_id from public.shared_product_barcodes d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and d.value=b.value union select d.id from public.shared_inventory_products d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and d.barcode=b.value)matched)>1 then'destination_product_barcode_ambiguous'else'destination_product_barcode_exists'end,(select min(matched.product_id)from(select d.product_id from public.shared_product_barcodes d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and d.value=b.value union select d.id from public.shared_inventory_products d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and d.barcode=b.value)matched)from selected_barcodes b where exists(select 1 from public.shared_product_barcodes d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and d.value=b.value) or exists(select 1 from public.shared_inventory_products d where d.tenant_id=p_tenant and d.company_id=p_destination_company_id and d.barcode=b.value)
 ) select coalesce(jsonb_agg(jsonb_build_object('itemKind',kind,'sourceItemId',source_id,'reason',reason,'destinationItemId',destination_id) order by kind,source_id,reason),'[]'::jsonb) into v_conflicts from conflicts;
 select count(*) into v_categories from public.shared_inventory_departments c where c.tenant_id=p_tenant and c.company_id=p_source_company_id and c.id in(select value from jsonb_array_elements_text(p_selection->'sourceCategoryIds')) and not exists(select 1 from jsonb_array_elements(v_conflicts) x where x->>'itemKind'='category' and x->>'sourceItemId'=c.id);
 select count(*) into v_products from public.shared_inventory_products p where p.tenant_id=p_tenant and p.company_id=p_source_company_id and p.id in(select value from jsonb_array_elements_text(p_selection->'sourceProductIds')) and not exists(select 1 from jsonb_array_elements(v_conflicts) x where x->>'itemKind'='product' and x->>'sourceItemId'=p.id);
 return jsonb_build_object('sourceCompanyId',p_source_company_id,'destinationCompanyId',p_destination_company_id,'sourceSnapshotToken',public.product_catalog_import_source_token(p_tenant,p_source_company_id,p_selection),'destinationSnapshotToken',public.product_catalog_import_destination_token(p_tenant,p_source_company_id,p_destination_company_id,p_selection),'selection',p_selection,'conflicts',v_conflicts,'importableCategoryCount',v_categories,'importableProductCount',v_products);
end $$;

create or replace function public.preview_native_product_catalog_import(p_actor_user_id uuid,p_organization_id uuid,p_source_company_id text,p_destination_company_id text,p_selection jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_destination_tenant uuid;
begin
 v_tenant:=public.assert_user_security_access(p_actor_user_id,p_organization_id,p_source_company_id,'inventory.read'); v_destination_tenant:=public.assert_user_security_access(p_actor_user_id,p_organization_id,p_destination_company_id,'inventory.update');
 if v_tenant is distinct from v_destination_tenant or p_source_company_id is null or p_destination_company_id is null or btrim(p_source_company_id)=btrim(p_destination_company_id) or not public.product_catalog_import_selection_valid(p_selection) or not exists(select 1 from public.shared_companies c where c.tenant_id=v_tenant and c.organization_id=p_organization_id and c.id=btrim(p_source_company_id) and c.status='active') or not exists(select 1 from public.shared_companies c where c.tenant_id=v_tenant and c.organization_id=p_organization_id and c.id=btrim(p_destination_company_id) and c.status='active') then raise exception 'PRODUCT_CATALOG_IMPORT_INVALID'; end if;
 return public.product_catalog_import_preview_data(v_tenant,btrim(p_source_company_id),btrim(p_destination_company_id),p_selection);
end $$;

create or replace function public.execute_native_product_catalog_import(p_actor_user_id uuid,p_organization_id uuid,p_source_company_id text,p_destination_company_id text,p_selection jsonb,p_expected_source_snapshot_token text,p_expected_destination_snapshot_token text,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' as $$
declare v_tenant uuid;v_destination_tenant uuid;v_preview jsonb;v_request public.shared_product_catalog_import_requests%rowtype;v_intent jsonb;v_hash text;v_category_map jsonb:='[]'::jsonb;v_product_map jsonb:='[]'::jsonb;v_skipped_categories jsonb;v_skipped_products jsonb;v_result jsonb;v_category record;v_product record;v_destination_id text;v_destination_category_id text;v_barcode text;
begin
 v_tenant:=public.assert_user_security_access(p_actor_user_id,p_organization_id,p_source_company_id,'inventory.read');v_destination_tenant:=public.assert_user_security_access(p_actor_user_id,p_organization_id,p_destination_company_id,'inventory.update');
 if v_tenant is distinct from v_destination_tenant or p_source_company_id is null or p_destination_company_id is null or btrim(p_source_company_id)=btrim(p_destination_company_id) or not public.product_catalog_import_selection_valid(p_selection) or length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 128 or length(btrim(coalesce(p_expected_source_snapshot_token,''))) not between 1 and 256 or length(btrim(coalesce(p_expected_destination_snapshot_token,''))) not between 1 and 256 then raise exception 'PRODUCT_CATALOG_IMPORT_INVALID'; end if;
 v_intent:=jsonb_build_object('sourceCompanyId',btrim(p_source_company_id),'destinationCompanyId',btrim(p_destination_company_id),'selection',p_selection,'sourceSnapshotToken',btrim(p_expected_source_snapshot_token),'destinationSnapshotToken',btrim(p_expected_destination_snapshot_token));v_hash:=encode(extensions.digest(v_intent::text,'sha256'),'hex');
 select * into v_request from public.shared_product_catalog_import_requests where organization_id=p_organization_id and actor_user_id=p_actor_user_id and idempotency_key=btrim(p_idempotency_key);
 if found then if v_request.intent_sha256<>v_hash then raise exception 'PRODUCT_CATALOG_IMPORT_IDEMPOTENCY_CONFLICT';end if;return v_request.result;end if;
 -- Legacy writers do not share advisory locks. These short, bounded table locks serialize all catalog writes before snapshots are rechecked.
 lock table public.shared_inventory_departments in share row exclusive mode;lock table public.shared_inventory_products in share row exclusive mode;lock table public.shared_product_barcodes in share row exclusive mode;
 perform 1 from public.shared_companies c where c.tenant_id=v_tenant and c.organization_id=p_organization_id and c.id in(btrim(p_source_company_id),btrim(p_destination_company_id)) order by c.id for update;
 if (select count(*) from public.shared_companies c where c.tenant_id=v_tenant and c.organization_id=p_organization_id and c.id in(btrim(p_source_company_id),btrim(p_destination_company_id)) and c.status='active')<>2 then raise exception 'PRODUCT_CATALOG_IMPORT_INVALID';end if;
 select * into v_request from public.shared_product_catalog_import_requests where organization_id=p_organization_id and actor_user_id=p_actor_user_id and idempotency_key=btrim(p_idempotency_key) for update;
 if found then if v_request.intent_sha256<>v_hash then raise exception 'PRODUCT_CATALOG_IMPORT_IDEMPOTENCY_CONFLICT';end if;return v_request.result;end if;
 v_preview:=public.product_catalog_import_preview_data(v_tenant,btrim(p_source_company_id),btrim(p_destination_company_id),p_selection);
 if v_preview->>'sourceSnapshotToken'<>btrim(p_expected_source_snapshot_token) then raise exception 'PRODUCT_CATALOG_IMPORT_SOURCE_VERSION_CONFLICT';end if;
 if v_preview->>'destinationSnapshotToken'<>btrim(p_expected_destination_snapshot_token) then raise exception 'PRODUCT_CATALOG_IMPORT_DESTINATION_VERSION_CONFLICT';end if;
 if p_selection->>'conflictPolicy'='fail' and jsonb_array_length(v_preview->'conflicts')>0 then raise exception 'PRODUCT_CATALOG_IMPORT_CONFLICT';end if;
 v_skipped_categories:=coalesce((select jsonb_agg(source_id order by source_id)from(select distinct x->>'sourceItemId' source_id from jsonb_array_elements(v_preview->'conflicts')x where x->>'itemKind'='category')q),'[]'::jsonb);v_skipped_products:=coalesce((select jsonb_agg(source_id order by source_id)from(select distinct x->>'sourceItemId' source_id from jsonb_array_elements(v_preview->'conflicts')x where x->>'itemKind'='product')q),'[]'::jsonb);
 for v_category in select d.* from public.shared_inventory_departments d where d.tenant_id=v_tenant and d.company_id=btrim(p_source_company_id) and d.id in(select value from jsonb_array_elements_text(p_selection->'sourceCategoryIds')) order by d.id loop
  if exists(select 1 from jsonb_array_elements_text(v_skipped_categories)x where x.value=v_category.id) then continue;end if;
  v_destination_id:=gen_random_uuid()::text;insert into public.shared_inventory_departments(tenant_id,id,company_id,name,description,active,version)values(v_tenant,v_destination_id,btrim(p_destination_company_id),btrim(v_category.name),v_category.description,v_category.active,1);v_category_map:=v_category_map||jsonb_build_array(jsonb_build_object('itemKind','category','sourceItemId',v_category.id,'destinationItemId',v_destination_id));
 end loop;
 for v_product in select p.* from public.shared_inventory_products p where p.tenant_id=v_tenant and p.company_id=btrim(p_source_company_id) and p.id in(select value from jsonb_array_elements_text(p_selection->'sourceProductIds')) order by p.id loop
  if exists(select 1 from jsonb_array_elements_text(v_skipped_products)x where x.value=v_product.id) then continue;end if;
  v_destination_category_id:=null;select x->>'destinationItemId' into v_destination_category_id from jsonb_array_elements(v_category_map)x where x->>'sourceItemId'=v_product.department_id;
  v_destination_id:=gen_random_uuid()::text;insert into public.shared_inventory_products(tenant_id,id,company_id,code,name,description,measure_unit,active,department_id,version)values(v_tenant,v_destination_id,btrim(p_destination_company_id),upper(btrim(v_product.code)),btrim(v_product.name),v_product.description,v_product.measure_unit,v_product.active,v_destination_category_id,1);insert into public.shared_inventory_product_profiles(tenant_id,company_id,product_id)values(v_tenant,btrim(p_destination_company_id),v_destination_id);
  for v_barcode in select value from public.shared_product_barcodes where tenant_id=v_tenant and product_id=v_product.id union select v_product.barcode where nullif(btrim(v_product.barcode),'')is not null loop insert into public.shared_product_barcodes(tenant_id,company_id,product_id,value)values(v_tenant,btrim(p_destination_company_id),v_destination_id,v_barcode);end loop;
  v_product_map:=v_product_map||jsonb_build_array(jsonb_build_object('itemKind','product','sourceItemId',v_product.id,'destinationItemId',v_destination_id));
 end loop;
 v_result:=jsonb_build_object('sourceCompanyId',btrim(p_source_company_id),'destinationCompanyId',btrim(p_destination_company_id),'sourceSnapshotToken',v_preview->>'sourceSnapshotToken','destinationSnapshotToken',public.product_catalog_import_destination_token(v_tenant,btrim(p_source_company_id),btrim(p_destination_company_id),p_selection),'conflictPolicy',p_selection->>'conflictPolicy','createdCategories',v_category_map,'skippedCategorySourceIds',v_skipped_categories,'createdProducts',v_product_map,'skippedProductSourceIds',v_skipped_products);
 insert into public.shared_product_catalog_import_requests(organization_id,tenant_id,actor_user_id,source_company_id,destination_company_id,idempotency_key,intent_sha256,result)values(p_organization_id,v_tenant,p_actor_user_id,btrim(p_source_company_id),btrim(p_destination_company_id),btrim(p_idempotency_key),v_hash,v_result)returning*into v_request;
 insert into public.shared_product_catalog_import_events(request_id,organization_id,tenant_id,actor_user_id,source_company_id,destination_company_id,selection,created_category_count,created_product_count,skipped_category_count,skipped_product_count)values(v_request.id,p_organization_id,v_tenant,p_actor_user_id,btrim(p_source_company_id),btrim(p_destination_company_id),p_selection,jsonb_array_length(v_category_map),jsonb_array_length(v_product_map),jsonb_array_length(v_skipped_categories),jsonb_array_length(v_skipped_products));return v_result;
end $$;

revoke all on function public.product_catalog_import_selection_valid(jsonb),public.product_catalog_import_source_token(uuid,text,jsonb),public.product_catalog_import_destination_token(uuid,text,text,jsonb),public.product_catalog_import_preview_data(uuid,text,text,jsonb),public.preview_native_product_catalog_import(uuid,uuid,text,text,jsonb),public.execute_native_product_catalog_import(uuid,uuid,text,text,jsonb,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.preview_native_product_catalog_import(uuid,uuid,text,text,jsonb),public.execute_native_product_catalog_import(uuid,uuid,text,text,jsonb,text,text,text) to service_role;

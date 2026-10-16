-- Company-owned typed definitions and product values for ADM-053.
-- Legacy shared_inventory_products.custom_fields remains untouched so this
-- additive migration cannot overwrite existing Web data or import metadata.

create or replace function public.native_product_custom_field_catalog_valid(p_definitions jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare v_definition jsonb;v_kind text;v_id text;v_min numeric;v_max numeric;v_count integer;v_distinct integer;
begin
 if jsonb_typeof(p_definitions) is distinct from 'array' or jsonb_array_length(p_definitions)>100 or octet_length(p_definitions::text)>65536 then return false;end if;
 select count(*),count(distinct value->>'id') into v_count,v_distinct from jsonb_array_elements(p_definitions) value;
 if v_count<>v_distinct then return false;end if;
 for v_definition in select value from jsonb_array_elements(p_definitions) value loop
  v_id:=v_definition->>'id';v_kind:=v_definition->>'type';
  if jsonb_typeof(v_definition) is distinct from 'object' or v_id is null or v_id!~'^[a-z][a-z0-9._-]{0,63}$'
    or jsonb_typeof(v_definition->'label') is distinct from 'string' or nullif(btrim(v_definition->>'label'),'') is null
    or length(v_definition->>'label')>60 or (v_definition->>'label')~'[[:cntrl:]]'
    or jsonb_typeof(v_definition->'required') is distinct from 'boolean' then return false;end if;
  if v_kind='text' then
   if jsonb_typeof(v_definition->'maxLength') is distinct from 'number' or (v_definition->>'maxLength')::numeric not between 1 and 2000
     or trunc((v_definition->>'maxLength')::numeric)<>(v_definition->>'maxLength')::numeric then return false;end if;
  elsif v_kind='number' then
   if v_definition?'minimum' and jsonb_typeof(v_definition->'minimum') not in('number','null') then return false;end if;
   if v_definition?'maximum' and jsonb_typeof(v_definition->'maximum') not in('number','null') then return false;end if;
   if jsonb_typeof(v_definition->'minimum')='number' then v_min:=(v_definition->>'minimum')::numeric;else v_min:=null;end if;
   if jsonb_typeof(v_definition->'maximum')='number' then v_max:=(v_definition->>'maximum')::numeric;else v_max:=null;end if;
   if v_min is not null and v_max is not null and v_min>v_max then return false;end if;
  elsif v_kind in('boolean','date') then null;
  elsif v_kind='select' then
   if jsonb_typeof(v_definition->'options') is distinct from 'array' or jsonb_array_length(v_definition->'options') not between 1 and 100 then return false;end if;
   if exists(select 1 from jsonb_array_elements(v_definition->'options') option where jsonb_typeof(option)<>'string' or nullif(btrim(option#>>'{}'),'') is null or length(option#>>'{}')>100 or(option#>>'{}')~'[[:cntrl:]]') then return false;end if;
   if (select count(*) from jsonb_array_elements_text(v_definition->'options'))<>(select count(distinct value) from jsonb_array_elements_text(v_definition->'options') value) then return false;end if;
  else return false;end if;
 end loop;
 return true;
exception when others then return false;
end$$;

create or replace function public.native_product_custom_field_values_valid(p_definitions jsonb,p_values jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare v_definition jsonb;v_value jsonb;v_id text;v_kind text;v_text text;v_number numeric;v_min numeric;v_max numeric;v_date date;
begin
 if not public.native_product_custom_field_catalog_valid(p_definitions) or jsonb_typeof(p_values) is distinct from 'object'
   or (select count(*) from jsonb_object_keys(p_values))>100 or octet_length(p_values::text)>65536 then return false;end if;
 for v_id,v_value in select key,value from jsonb_each(p_values) loop
  select value into v_definition from jsonb_array_elements(p_definitions) value where value->>'id'=v_id;
  if v_definition is null then return false;end if;
  v_kind:=v_definition->>'type';
  if v_value='null'::jsonb then
   if (v_definition->>'required')::boolean then return false;end if;
  elsif v_kind='text' then
   if jsonb_typeof(v_value)<>'string' then return false;end if;
   v_text:=v_value#>>'{}';
   if length(btrim(v_text))> (v_definition->>'maxLength')::integer or v_text~'[[:cntrl:]]' or ((v_definition->>'required')::boolean and nullif(btrim(v_text),'') is null) then return false;end if;
  elsif v_kind='number' then
   if jsonb_typeof(v_value)<>'number' then return false;end if;v_number:=(v_value#>>'{}')::numeric;
   if jsonb_typeof(v_definition->'minimum')='number' and v_number<(v_definition->>'minimum')::numeric then return false;end if;
   if jsonb_typeof(v_definition->'maximum')='number' and v_number>(v_definition->>'maximum')::numeric then return false;end if;
  elsif v_kind='boolean' then
   if jsonb_typeof(v_value)<>'boolean' then return false;end if;
  elsif v_kind='date' then
   if jsonb_typeof(v_value)<>'string' then return false;end if;v_text:=v_value#>>'{}';
   if v_text!~'^\d{4}-\d{2}-\d{2}$' then return false;end if;
   begin v_date:=v_text::date;exception when others then return false;end;
   if to_char(v_date,'YYYY-MM-DD')<>v_text then return false;end if;
  elsif v_kind='select' then
   if jsonb_typeof(v_value)<>'string' or not exists(select 1 from jsonb_array_elements_text(v_definition->'options') option where option=v_value#>>'{}') then return false;end if;
  else return false;end if;
 end loop;
 for v_definition in select value from jsonb_array_elements(p_definitions) value loop
  v_id:=v_definition->>'id';
  if (v_definition->>'required')::boolean and (not(p_values?v_id) or p_values->v_id='null'::jsonb) then return false;end if;
 end loop;
 return true;
exception when others then return false;
end$$;

create table if not exists public.shared_inventory_product_custom_field_catalogs(
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 company_id text not null,
 definitions jsonb not null default '[]'::jsonb,
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,company_id),
 foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade,
 check(version>0),
 check(public.native_product_custom_field_catalog_valid(definitions))
);

create table if not exists public.shared_inventory_product_custom_field_values(
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 company_id text not null,
 product_id text not null,
 values jsonb not null default '{}'::jsonb,
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,company_id,product_id),
 foreign key(tenant_id,product_id) references public.shared_inventory_products(tenant_id,id) on delete cascade,
 foreign key(tenant_id,company_id) references public.shared_companies(tenant_id,id) on delete cascade,
 check(version>0),
 check(jsonb_typeof(values)='object' and octet_length(values::text)<=65536)
);

alter table public.shared_inventory_product_custom_field_catalogs enable row level security;
alter table public.shared_inventory_product_custom_field_values enable row level security;
revoke all on public.shared_inventory_product_custom_field_catalogs,public.shared_inventory_product_custom_field_values from public,anon,authenticated,service_role;

create or replace function public.get_native_product_custom_field_catalog(p_actor_user_id uuid,p_organization_id uuid,p_company_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid;v_result jsonb;
begin
 v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);
 select jsonb_build_object('definitions',definitions,'version',version,'updatedAt',updated_at) into v_result from public.shared_inventory_product_custom_field_catalogs where tenant_id=v_tenant and company_id=p_company_id;
 return coalesce(v_result,jsonb_build_object('definitions','[]'::jsonb,'version',0,'updatedAt',null));
end$$;

create or replace function public.replace_native_product_custom_field_catalog(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_expected_version integer,p_definitions jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid;v_current integer;v_result jsonb;
begin
 v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);
 if p_expected_version<0 or not public.native_product_custom_field_catalog_valid(p_definitions) then raise exception 'PRODUCT_CUSTOM_FIELDS_INVALID';end if;
 select version into v_current from public.shared_inventory_product_custom_field_catalogs where tenant_id=v_tenant and company_id=p_company_id for update;
 if not found then
  if p_expected_version<>0 then raise exception 'PRODUCT_CUSTOM_FIELD_CATALOG_VERSION_CONFLICT';end if;
  begin insert into public.shared_inventory_product_custom_field_catalogs(tenant_id,company_id,definitions,version)values(v_tenant,p_company_id,p_definitions,1);
  exception when unique_violation then raise exception 'PRODUCT_CUSTOM_FIELD_CATALOG_VERSION_CONFLICT';end;
 else
  if v_current<>p_expected_version then raise exception 'PRODUCT_CUSTOM_FIELD_CATALOG_VERSION_CONFLICT';end if;
  update public.shared_inventory_product_custom_field_catalogs set definitions=p_definitions,version=version+1,updated_at=now() where tenant_id=v_tenant and company_id=p_company_id returning version into v_current;
 end if;
 select jsonb_build_object('definitions',definitions,'version',version,'updatedAt',updated_at) into v_result from public.shared_inventory_product_custom_field_catalogs where tenant_id=v_tenant and company_id=p_company_id;
 return v_result;
end$$;

create or replace function public.get_native_product_custom_field_values(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_product_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid;v_result jsonb;
begin
 v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);
 if not exists(select 1 from public.shared_inventory_products where tenant_id=v_tenant and company_id=p_company_id and id=p_product_id) then raise exception 'PRODUCT_NOT_FOUND';end if;
 select jsonb_build_object('values',values,'version',version,'updatedAt',updated_at) into v_result from public.shared_inventory_product_custom_field_values where tenant_id=v_tenant and company_id=p_company_id and product_id=p_product_id;
 return coalesce(v_result,jsonb_build_object('values','{}'::jsonb,'version',0,'updatedAt',null));
end$$;

create or replace function public.replace_native_product_custom_field_values(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_product_id text,p_expected_version integer,p_values jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid;v_definitions jsonb;v_current integer;v_result jsonb;
begin
 v_tenant:=public.native_products_assert_access(p_actor_user_id,p_organization_id,p_company_id);
 select definitions into v_definitions from public.shared_inventory_product_custom_field_catalogs where tenant_id=v_tenant and company_id=p_company_id;
 if v_definitions is null then v_definitions:='[]'::jsonb;end if;
 if p_expected_version<0 or not public.native_product_custom_field_values_valid(v_definitions,p_values) then raise exception 'PRODUCT_CUSTOM_FIELDS_INVALID';end if;
 if not exists(select 1 from public.shared_inventory_products where tenant_id=v_tenant and company_id=p_company_id and id=p_product_id) then raise exception 'PRODUCT_NOT_FOUND';end if;
 select version into v_current from public.shared_inventory_product_custom_field_values where tenant_id=v_tenant and company_id=p_company_id and product_id=p_product_id for update;
 if not found then
  if p_expected_version<>0 then raise exception 'PRODUCT_CUSTOM_FIELDS_VERSION_CONFLICT';end if;
  begin insert into public.shared_inventory_product_custom_field_values(tenant_id,company_id,product_id,values,version)values(v_tenant,p_company_id,p_product_id,p_values,1);
  exception when unique_violation then raise exception 'PRODUCT_CUSTOM_FIELDS_VERSION_CONFLICT';end;
 else
  if v_current<>p_expected_version then raise exception 'PRODUCT_CUSTOM_FIELDS_VERSION_CONFLICT';end if;
  update public.shared_inventory_product_custom_field_values set values=p_values,version=version+1,updated_at=now() where tenant_id=v_tenant and company_id=p_company_id and product_id=p_product_id returning version into v_current;
 end if;
 select jsonb_build_object('values',values,'version',version,'updatedAt',updated_at) into v_result from public.shared_inventory_product_custom_field_values where tenant_id=v_tenant and company_id=p_company_id and product_id=p_product_id;
 return v_result;
end$$;

revoke all on function public.native_product_custom_field_catalog_valid(jsonb),public.native_product_custom_field_values_valid(jsonb,jsonb),
 public.get_native_product_custom_field_catalog(uuid,uuid,text),public.replace_native_product_custom_field_catalog(uuid,uuid,text,integer,jsonb),
 public.get_native_product_custom_field_values(uuid,uuid,text,text),public.replace_native_product_custom_field_values(uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_native_product_custom_field_catalog(uuid,uuid,text),public.replace_native_product_custom_field_catalog(uuid,uuid,text,integer,jsonb),
 public.get_native_product_custom_field_values(uuid,uuid,text,text),public.replace_native_product_custom_field_values(uuid,uuid,text,text,integer,jsonb) to service_role;

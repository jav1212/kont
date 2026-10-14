-- IVA configuration is additive. It records no new legal rate and leaves historic rules unclassified.
begin;

alter table public.shared_tax_rules add column if not exists tax_category text;
alter table public.shared_tax_rules add column if not exists legacy_rate_slot text;
alter table public.shared_tax_rules add column if not exists legal_component text not null default 'base';
alter table public.shared_tax_rules drop constraint if exists shared_tax_rules_treatment_check;
alter table public.shared_tax_rules add constraint shared_tax_rules_treatment_check check (treatment in ('taxed','zero_rated','exempt','exonerated','not_subject'));
alter table public.shared_tax_rules drop constraint if exists shared_tax_rules_tax_category_check;
alter table public.shared_tax_rules add constraint shared_tax_rules_tax_category_check check (tax_category is null or tax_category in ('general','reduced','zero_rated','luxury_surcharge','payment_surcharge','other'));
alter table public.shared_tax_rules drop constraint if exists shared_tax_rules_legacy_rate_slot_check;
alter table public.shared_tax_rules add constraint shared_tax_rules_legacy_rate_slot_check check (legacy_rate_slot is null or legacy_rate_slot in ('a1','a2','a3','a4','a5'));
alter table public.shared_tax_rules drop constraint if exists shared_tax_rules_legal_component_check;
alter table public.shared_tax_rules add constraint shared_tax_rules_legal_component_check check (legal_component in ('base','luxury','payment'));

alter table public.shared_product_tax_assignments add column if not exists legacy_rate_slot text;
alter table public.shared_product_tax_assignments add column if not exists tax_category text;
alter table public.shared_product_tax_assignments drop constraint if exists shared_product_tax_assignments_treatment_check;
alter table public.shared_product_tax_assignments add constraint shared_product_tax_assignments_treatment_check check (treatment in ('taxed','zero_rated','exempt','exonerated','not_subject'));
alter table public.shared_product_tax_assignments add column if not exists price_mode text;
alter table public.shared_product_tax_assignments drop constraint if exists shared_product_tax_assignments_legacy_rate_slot_check;
alter table public.shared_product_tax_assignments add constraint shared_product_tax_assignments_legacy_rate_slot_check check (legacy_rate_slot is null or legacy_rate_slot in ('a1','a2','a3','a4','a5'));
alter table public.shared_product_tax_assignments drop constraint if exists shared_product_tax_assignments_tax_category_check;
alter table public.shared_product_tax_assignments add constraint shared_product_tax_assignments_tax_category_check check (tax_category is null or tax_category in ('general','reduced','zero_rated','luxury_surcharge','payment_surcharge','other'));
alter table public.shared_product_tax_assignments drop constraint if exists shared_product_tax_assignments_price_mode_check;
alter table public.shared_product_tax_assignments add constraint shared_product_tax_assignments_price_mode_check check (price_mode is null or price_mode in ('tax_exclusive','tax_inclusive'));
alter table public.shared_service_tax_assignments add column if not exists legacy_rate_slot text;
alter table public.shared_service_tax_assignments add column if not exists tax_category text;
alter table public.shared_service_tax_assignments drop constraint if exists shared_service_tax_assignments_treatment_check;
alter table public.shared_service_tax_assignments add constraint shared_service_tax_assignments_treatment_check check (treatment in ('taxed','zero_rated','exempt','exonerated','not_subject'));
alter table public.shared_service_tax_assignments add column if not exists price_mode text;
alter table public.shared_service_tax_assignments drop constraint if exists shared_service_tax_assignments_legacy_rate_slot_check;
alter table public.shared_service_tax_assignments add constraint shared_service_tax_assignments_legacy_rate_slot_check check (legacy_rate_slot is null or legacy_rate_slot in ('a1','a2','a3','a4','a5'));
alter table public.shared_service_tax_assignments drop constraint if exists shared_service_tax_assignments_tax_category_check;
alter table public.shared_service_tax_assignments add constraint shared_service_tax_assignments_tax_category_check check (tax_category is null or tax_category in ('general','reduced','zero_rated','luxury_surcharge','payment_surcharge','other'));
alter table public.shared_service_tax_assignments drop constraint if exists shared_service_tax_assignments_price_mode_check;
alter table public.shared_service_tax_assignments add constraint shared_service_tax_assignments_price_mode_check check (price_mode is null or price_mode in ('tax_exclusive','tax_inclusive'));

create or replace function public.list_native_tax_rules(p_tax_code text,p_jurisdiction text) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'taxCode',tax_code,'jurisdiction',jurisdiction,'treatment',treatment,'rate',rate::text,'calculationMode',calculation_mode,'effectiveFrom',effective_from,'effectiveTo',effective_to,'legalBasis',legal_basis,'version',version,'category',tax_category,'legacyRateSlot',legacy_rate_slot,'component',legal_component) order by effective_from),'[]'::jsonb) from public.shared_tax_rules where tax_code=upper(p_tax_code) and jurisdiction=upper(p_jurisdiction);
$$;
create or replace function public.native_product_tax_profile_json(p_tenant uuid,p_company_id text,p_product_id text) returns jsonb language sql stable set search_path=public as $$
 select jsonb_build_object('id',pr.id,'companyId',pr.company_id,'productId',pr.product_id,'jurisdiction',pr.jurisdiction,'version',pr.version,'assignments',coalesce((select jsonb_agg(jsonb_build_object('taxCode',a.tax_code,'treatment',a.treatment,'effectiveFrom',a.effective_from,'effectiveTo',a.effective_to,'legalBasis',a.legal_basis,'classificationVersion',a.classification_version,'category',a.tax_category,'legacyRateSlot',a.legacy_rate_slot,'priceMode',a.price_mode) order by a.effective_from) from public.shared_product_tax_assignments a where a.tenant_id=pr.tenant_id and a.profile_id=pr.id),'[]'::jsonb)) from public.shared_product_tax_profiles pr where pr.tenant_id=p_tenant and pr.company_id=p_company_id and pr.product_id=p_product_id;
$$;
create or replace function public.native_service_tax_profile_json(p_tenant uuid,p_company_id text,p_service_code text) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('id',p.id,'companyId',p.company_id,'serviceCode',p.service_code,'unitCode',p.fiscal_unit_code,'jurisdiction',p.jurisdiction,'version',p.version,'assignments',coalesce((select jsonb_agg(jsonb_build_object('taxCode',a.tax_code,'treatment',a.treatment,'effectiveFrom',a.effective_from,'effectiveTo',a.effective_to,'legalBasis',a.legal_basis,'classificationVersion',a.classification_version,'category',a.tax_category,'legacyRateSlot',a.legacy_rate_slot,'priceMode',a.price_mode) order by a.effective_from,a.tax_code) from public.shared_service_tax_assignments a where a.tenant_id=p.tenant_id and a.profile_id=p.id),'[]'::jsonb)) from public.shared_service_tax_profiles p where p.tenant_id=p_tenant and p.company_id=p_company_id and p.service_code=p_service_code;
$$;

create table if not exists public.shared_company_tax_rule_catalogs (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id text not null, version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, company_id), foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete cascade
);
create table if not exists public.shared_company_tax_rules (
  tenant_id uuid not null references public.tenants(id) on delete cascade, company_id text not null, id text not null,
  catalog_version integer not null check (catalog_version > 0),
  tax_code varchar(64) not null, jurisdiction varchar(16) not null, treatment text not null,
  rate numeric(12,6) not null, calculation_mode text not null, tax_category text not null,
  legal_component text not null default 'base', legacy_rate_slot text, effective_from date not null, effective_to date,
  legal_basis text not null, version text not null, created_at timestamptz not null default now(),
  primary key (tenant_id, company_id, catalog_version, id), foreign key (tenant_id, company_id) references public.shared_company_tax_rule_catalogs(tenant_id, company_id) on delete cascade,
  check (treatment in ('taxed','zero_rated','exempt','exonerated','not_subject')),
  check ((treatment = 'taxed' and rate > 0) or (treatment <> 'taxed' and rate = 0)),
  check (calculation_mode in ('tax_exclusive','tax_inclusive')), check (tax_category in ('general','reduced','zero_rated','luxury_surcharge','payment_surcharge','other')),
  check (legal_component in ('base','luxury','payment')), check (legacy_rate_slot is null or legacy_rate_slot in ('a1','a2','a3','a4','a5')), check (effective_to is null or effective_to >= effective_from),
  check (length(btrim(legal_basis)) between 1 and 500), check (length(btrim(version)) between 1 and 128)
);
create index if not exists shared_company_tax_rules_resolution_idx on public.shared_company_tax_rules(tenant_id, company_id, catalog_version, tax_code, jurisdiction, tax_category, legal_component, effective_from, effective_to);

create table if not exists public.shared_tax_counterparty_profiles (
  tenant_id uuid not null references public.tenants(id) on delete cascade, company_id text not null, counterparty_id text not null,
  contributor_status text not null, residence_status text not null, effective_from date not null, effective_to date,
  legal_basis text not null, evidence_reference text not null, version integer not null default 0 check(version >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, company_id, counterparty_id, effective_from, version), foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete cascade,
  check(contributor_status in ('ordinary','formal','occasional','unverified')), check(residence_status in ('domestic','import_goods','foreign_service','unverified')),
  check(effective_to is null or effective_to >= effective_from), check(length(btrim(legal_basis)) between 1 and 500), check(length(btrim(evidence_reference)) between 1 and 500)
);
create index if not exists shared_tax_counterparty_profiles_lookup_idx on public.shared_tax_counterparty_profiles(tenant_id, company_id, counterparty_id, effective_from, effective_to, version desc);
create table if not exists public.shared_taxation_configuration_idempotency (
  tenant_id uuid not null references public.tenants(id) on delete cascade, company_id text not null, operation text not null, idempotency_key varchar(128) not null,
  request_snapshot jsonb not null check (jsonb_typeof(request_snapshot) = 'object'),
  response jsonb not null, created_at timestamptz not null default now(), primary key(tenant_id, company_id, operation, idempotency_key)
);

alter table public.shared_company_tax_rule_catalogs enable row level security;
alter table public.shared_company_tax_rules enable row level security;
alter table public.shared_tax_counterparty_profiles enable row level security;
alter table public.shared_taxation_configuration_idempotency enable row level security;
revoke all on public.shared_company_tax_rule_catalogs, public.shared_company_tax_rules, public.shared_tax_counterparty_profiles, public.shared_taxation_configuration_idempotency from anon, authenticated;

create or replace function public.native_company_tax_rule_catalog_json(p_tenant uuid, p_company_id text) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('companyId', c.company_id, 'version', c.version, 'rules', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'taxCode',r.tax_code,'jurisdiction',r.jurisdiction,'treatment',r.treatment,'rate',r.rate::text,'calculationMode',r.calculation_mode,'effectiveFrom',r.effective_from,'effectiveTo',r.effective_to,'legalBasis',r.legal_basis,'version',r.version,'category',r.tax_category,'legacyRateSlot',r.legacy_rate_slot,'component',r.legal_component) order by r.effective_from,r.id) from public.shared_company_tax_rules r where r.tenant_id=c.tenant_id and r.company_id=c.company_id and r.catalog_version=c.version),'[]'::jsonb)) from public.shared_company_tax_rule_catalogs c where c.tenant_id=p_tenant and c.company_id=p_company_id;
$$;
create or replace function public.get_native_company_tax_rule_catalog(p_actor_user_id uuid,p_organization_id uuid,p_company_id text) returns jsonb language plpgsql security definer set search_path=public as $$ declare v_tenant uuid; begin v_tenant:=public.native_service_tax_assert_access(p_actor_user_id,p_organization_id,p_company_id); insert into public.shared_company_tax_rule_catalogs(tenant_id,company_id) values(v_tenant,p_company_id) on conflict do nothing; return public.native_company_tax_rule_catalog_json(v_tenant,p_company_id); end $$;
create or replace function public.get_native_company_tax_rule_catalog_version(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_catalog_version integer) returns jsonb language plpgsql stable security definer set search_path=public as $$ declare v_tenant uuid; begin v_tenant:=public.native_service_tax_assert_access(p_actor_user_id,p_organization_id,p_company_id); if p_catalog_version is null or p_catalog_version < 0 then raise exception 'TAXATION_PROFILE_INVALID'; end if; if not exists(select 1 from public.shared_company_tax_rule_catalogs c where c.tenant_id=v_tenant and c.company_id=p_company_id and c.version>=p_catalog_version) then raise exception 'TAXATION_PROFILE_NOT_FOUND'; end if; return (select jsonb_build_object('companyId',p_company_id,'version',p_catalog_version,'rules',coalesce(jsonb_agg(jsonb_build_object('id',r.id,'taxCode',r.tax_code,'jurisdiction',r.jurisdiction,'treatment',r.treatment,'rate',r.rate::text,'calculationMode',r.calculation_mode,'effectiveFrom',r.effective_from,'effectiveTo',r.effective_to,'legalBasis',r.legal_basis,'version',r.version,'category',r.tax_category,'legacyRateSlot',r.legacy_rate_slot,'component',r.legal_component) order by r.effective_from,r.id),'[]'::jsonb)) from public.shared_company_tax_rules r where r.tenant_id=v_tenant and r.company_id=p_company_id and r.catalog_version=p_catalog_version); end $$;
create or replace function public.save_native_company_tax_rule_catalog(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_expected_version integer,p_idempotency_key text,p_rules jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid;
  v_catalog public.shared_company_tax_rule_catalogs%rowtype;
  v_cached_response jsonb;
  v_cached_request jsonb;
  v_request jsonb;
  v_rule jsonb;
  v_response jsonb;
begin
  v_tenant:=public.native_service_tax_assert_access(p_actor_user_id,p_organization_id,p_company_id);
  if nullif(btrim(p_idempotency_key),'') is null or length(btrim(p_idempotency_key))>128 then
    raise exception 'TAXATION_PROFILE_INVALID';
  end if;
  v_request:=jsonb_build_object('actorUserId',p_actor_user_id,'expectedVersion',p_expected_version,'rules',p_rules);
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||p_company_id||':catalog:'||btrim(p_idempotency_key),0));
  select request_snapshot,response into v_cached_request,v_cached_response
    from public.shared_taxation_configuration_idempotency
    where tenant_id=v_tenant and company_id=p_company_id and operation='catalog' and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_cached_request is distinct from v_request then raise exception 'TAXATION_IDEMPOTENCY_CONFLICT'; end if;
    return v_cached_response;
  end if;
  if p_expected_version is null or p_expected_version<0 or jsonb_typeof(p_rules)<>'array' then
    raise exception 'TAXATION_PROFILE_INVALID';
  end if;
  for v_rule in select value from jsonb_array_elements(p_rules) loop
    if nullif(btrim(v_rule->>'id'),'') is null
      or coalesce(v_rule->>'treatment','') not in ('taxed','zero_rated','exempt','exonerated','not_subject')
      or coalesce(v_rule->>'calculationMode','') not in ('tax_exclusive','tax_inclusive')
      or coalesce(v_rule->>'category','') not in ('general','reduced','zero_rated','luxury_surcharge','payment_surcharge','other')
      or (v_rule ? 'legacyRateSlot' and nullif(v_rule->>'legacyRateSlot','') not in ('a1','a2','a3','a4','a5'))
      or coalesce(v_rule->>'component','base') not in ('base','luxury','payment')
      or nullif(btrim(v_rule->>'legalBasis'),'') is null or nullif(btrim(v_rule->>'version'),'') is null then
      raise exception 'TAXATION_RULE_INVALID';
    end if;
  end loop;
  insert into public.shared_company_tax_rule_catalogs(tenant_id,company_id) values(v_tenant,p_company_id) on conflict do nothing;
  select * into v_catalog from public.shared_company_tax_rule_catalogs where tenant_id=v_tenant and company_id=p_company_id for update;
  if v_catalog.version<>p_expected_version then raise exception 'TAXATION_VERSION_CONFLICT'; end if;
  update public.shared_company_tax_rule_catalogs set version=version+1,updated_at=now() where tenant_id=v_tenant and company_id=p_company_id;
  insert into public.shared_company_tax_rules(tenant_id,company_id,catalog_version,id,tax_code,jurisdiction,treatment,rate,calculation_mode,tax_category,legal_component,legacy_rate_slot,effective_from,effective_to,legal_basis,version)
    select v_tenant,p_company_id,v_catalog.version+1,btrim(value->>'id'),upper(btrim(value->>'taxCode')),upper(btrim(value->>'jurisdiction')),value->>'treatment',(value->>'rate')::numeric,value->>'calculationMode',value->>'category',coalesce(value->>'component','base'),nullif(value->>'legacyRateSlot',''),(value->>'effectiveFrom')::date,nullif(value->>'effectiveTo','')::date,btrim(value->>'legalBasis'),btrim(value->>'version')
    from jsonb_array_elements(p_rules);
  v_response:=public.native_company_tax_rule_catalog_json(v_tenant,p_company_id);
  insert into public.shared_taxation_configuration_idempotency(tenant_id,company_id,operation,idempotency_key,request_snapshot,response)
    values(v_tenant,p_company_id,'catalog',btrim(p_idempotency_key),v_request,v_response);
  return v_response;
exception when invalid_text_representation then raise exception 'TAXATION_RULE_INVALID';
end $$;

create or replace function public.get_native_tax_counterparty_profile(p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_counterparty_id text,p_effective_date date) returns jsonb language plpgsql stable security definer set search_path=public as $$ declare v_tenant uuid; begin v_tenant:=public.native_service_tax_assert_access(p_actor_user_id,p_organization_id,p_company_id); return (select jsonb_build_object('companyId',company_id,'counterpartyId',counterparty_id,'contributorStatus',contributor_status,'residenceStatus',residence_status,'effectiveFrom',effective_from,'effectiveTo',effective_to,'legalBasis',legal_basis,'evidenceReference',evidence_reference,'version',version) from public.shared_tax_counterparty_profiles where tenant_id=v_tenant and company_id=p_company_id and counterparty_id=btrim(p_counterparty_id) and p_effective_date between effective_from and coalesce(effective_to,'infinity'::date) order by effective_from desc,version desc limit 1); end $$;
create or replace function public.save_native_tax_counterparty_profile(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text,p_counterparty_id text,p_contributor_status text,p_residence_status text,
  p_effective_from date,p_effective_to date,p_legal_basis text,p_evidence_reference text,p_expected_version integer,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid;
  v_row public.shared_tax_counterparty_profiles%rowtype;
  v_response jsonb;
  v_cached_response jsonb;
  v_cached_request jsonb;
  v_request jsonb;
begin
  v_tenant:=public.native_service_tax_assert_access(p_actor_user_id,p_organization_id,p_company_id);
  if nullif(btrim(p_idempotency_key),'') is null or length(btrim(p_idempotency_key))>128 then
    raise exception 'TAXATION_COUNTERPARTY_PROFILE_INVALID';
  end if;
  v_request:=jsonb_build_object('actorUserId',p_actor_user_id,'counterpartyId',p_counterparty_id,
    'contributorStatus',p_contributor_status,'residenceStatus',p_residence_status,'effectiveFrom',p_effective_from,
    'effectiveTo',p_effective_to,'legalBasis',p_legal_basis,'evidenceReference',p_evidence_reference,'expectedVersion',p_expected_version);
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||p_company_id||':counterparty:'||btrim(p_idempotency_key),0));
  select request_snapshot,response into v_cached_request,v_cached_response
    from public.shared_taxation_configuration_idempotency
    where tenant_id=v_tenant and company_id=p_company_id and operation='counterparty' and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_cached_request is distinct from v_request then raise exception 'TAXATION_IDEMPOTENCY_CONFLICT'; end if;
    return v_cached_response;
  end if;
  if nullif(btrim(p_counterparty_id),'') is null
    or p_contributor_status not in ('ordinary','formal','occasional','unverified')
    or p_residence_status not in ('domestic','import_goods','foreign_service','unverified')
    or p_effective_from is null or (p_effective_to is not null and p_effective_to<p_effective_from)
    or nullif(btrim(p_legal_basis),'') is null or nullif(btrim(p_evidence_reference),'') is null
    or p_expected_version is null or p_expected_version<0 then
    raise exception 'TAXATION_COUNTERPARTY_PROFILE_INVALID';
  end if;
  select * into v_row from public.shared_tax_counterparty_profiles
    where tenant_id=v_tenant and company_id=p_company_id and counterparty_id=btrim(p_counterparty_id)
      and effective_from=p_effective_from order by version desc limit 1 for update;
  if found and v_row.version<>p_expected_version then raise exception 'TAXATION_VERSION_CONFLICT';
  elsif not found and p_expected_version<>0 then raise exception 'TAXATION_VERSION_CONFLICT'; end if;
  insert into public.shared_tax_counterparty_profiles(tenant_id,company_id,counterparty_id,contributor_status,residence_status,effective_from,effective_to,legal_basis,evidence_reference,version)
    values(v_tenant,p_company_id,btrim(p_counterparty_id),p_contributor_status,p_residence_status,p_effective_from,p_effective_to,btrim(p_legal_basis),btrim(p_evidence_reference),p_expected_version+1);
  select jsonb_build_object('companyId',company_id,'counterpartyId',counterparty_id,'contributorStatus',contributor_status,
    'residenceStatus',residence_status,'effectiveFrom',effective_from,'effectiveTo',effective_to,'legalBasis',legal_basis,
    'evidenceReference',evidence_reference,'version',version) into v_response
    from public.shared_tax_counterparty_profiles where tenant_id=v_tenant and company_id=p_company_id
      and counterparty_id=btrim(p_counterparty_id) and effective_from=p_effective_from and version=p_expected_version+1;
  insert into public.shared_taxation_configuration_idempotency(tenant_id,company_id,operation,idempotency_key,request_snapshot,response)
    values(v_tenant,p_company_id,'counterparty',btrim(p_idempotency_key),v_request,v_response);
  return v_response;
exception when unique_violation then raise exception 'TAXATION_VERSION_CONFLICT';
end $$;

revoke all on function public.native_company_tax_rule_catalog_json(uuid,text), public.get_native_company_tax_rule_catalog(uuid,uuid,text), public.get_native_company_tax_rule_catalog_version(uuid,uuid,text,integer), public.save_native_company_tax_rule_catalog(uuid,uuid,text,integer,text,jsonb), public.get_native_tax_counterparty_profile(uuid,uuid,text,text,date), public.save_native_tax_counterparty_profile(uuid,uuid,text,text,text,text,date,date,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.get_native_company_tax_rule_catalog(uuid,uuid,text), public.get_native_company_tax_rule_catalog_version(uuid,uuid,text,integer), public.save_native_company_tax_rule_catalog(uuid,uuid,text,integer,text,jsonb), public.get_native_tax_counterparty_profile(uuid,uuid,text,text,date), public.save_native_tax_counterparty_profile(uuid,uuid,text,text,text,text,date,date,text,text,integer,text) to service_role;
commit;

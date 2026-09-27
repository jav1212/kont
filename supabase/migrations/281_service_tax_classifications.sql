begin;

-- Service classifications are company scoped and independent of product profiles.
create table if not exists public.shared_service_tax_profiles (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null,
  company_id text not null,
  service_code varchar(128) not null,
  fiscal_unit_code varchar(32) not null,
  jurisdiction varchar(16) not null,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, company_id, service_code),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete cascade,
  check (service_code = btrim(service_code) and length(service_code) between 1 and 128),
  check (jurisdiction = upper(btrim(jurisdiction)) and length(jurisdiction) between 2 and 16)
);

create table if not exists public.shared_service_tax_assignments (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null,
  profile_id text not null,
  tax_code varchar(64) not null,
  treatment text not null check (treatment in ('taxed', 'exempt', 'exonerated', 'not_subject')),
  effective_from date not null,
  effective_to date,
  legal_basis text not null,
  classification_version varchar(128) not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, profile_id) references public.shared_service_tax_profiles(tenant_id, id) on delete cascade,
  check (effective_to is null or effective_to >= effective_from),
  check (length(btrim(legal_basis)) between 1 and 500),
  check (length(btrim(classification_version)) between 1 and 128)
);

create unique index if not exists shared_service_tax_assignment_open_idx
  on public.shared_service_tax_assignments(tenant_id, profile_id, tax_code)
  where effective_to is null;
create index if not exists shared_service_tax_assignment_period_idx
  on public.shared_service_tax_assignments(tenant_id, profile_id, tax_code, effective_from, effective_to);

alter table public.shared_inventory_sales_invoice_items
  add column if not exists service_tax_code varchar(128);
alter table public.organization_delegation_scopes
  drop constraint if exists organization_delegation_scopes_scope_check;
alter table public.organization_delegation_scopes
  add constraint organization_delegation_scopes_scope_check
  check (scope in ('accounting', 'payroll', 'inventory', 'purchases', 'tax', 'documents', 'administration', 'sales'));

alter table public.shared_service_tax_profiles enable row level security;
alter table public.shared_service_tax_assignments enable row level security;
create policy shared_service_tax_profiles_member_read on public.shared_service_tax_profiles
  for select to authenticated using (exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = shared_service_tax_profiles.tenant_id
      and m.member_id = auth.uid() and m.accepted_at is not null and m.revoked_at is null
  ));
create policy shared_service_tax_assignments_member_read on public.shared_service_tax_assignments
  for select to authenticated using (exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = shared_service_tax_assignments.tenant_id
      and m.member_id = auth.uid() and m.accepted_at is not null and m.revoked_at is null
  ));
revoke all on public.shared_service_tax_profiles, public.shared_service_tax_assignments from anon, authenticated;

create or replace function public.native_service_tax_assert_access(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text
) returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_tenant uuid; v_allowed boolean;
begin
  select tenant_id into v_tenant from public.shared_companies
  where organization_id = p_organization_id and id = p_company_id;
  if v_tenant is null then raise exception 'TAXATION_COMPANY_OUTSIDE_ORGANIZATION'; end if;
  select exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = p_actor_user_id and status = 'active'
  ) or exists (
    select 1 from public.organization_delegation_member_assignments a
    join public.organization_delegations d on d.id = a.delegation_id
    join public.organization_delegation_scopes s on s.delegation_id = d.id and s.scope = 'sales'
    where a.user_id = p_actor_user_id and a.status = 'active'
      and d.client_organization_id = p_organization_id and d.status = 'active'
      and d.valid_from <= now() and (d.valid_until is null or d.valid_until > now())
  ) into v_allowed;
  if not coalesce(v_allowed, false) then raise exception 'TAXATION_ACCESS_DENIED'; end if;
  return v_tenant;
end;
$$;

create or replace function public.native_service_tax_profile_json(
  p_tenant uuid, p_company_id text, p_service_code text
) returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'companyId', p.company_id, 'serviceCode', p.service_code, 'unitCode', p.fiscal_unit_code,
    'jurisdiction', p.jurisdiction, 'version', p.version,
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'taxCode', a.tax_code, 'treatment', a.treatment,
        'effectiveFrom', a.effective_from, 'effectiveTo', a.effective_to,
        'legalBasis', a.legal_basis, 'classificationVersion', a.classification_version
      ) order by a.effective_from, a.tax_code)
      from public.shared_service_tax_assignments a
      where a.tenant_id = p.tenant_id and a.profile_id = p.id
    ), '[]'::jsonb)
  )
  from public.shared_service_tax_profiles p
  where p.tenant_id = p_tenant and p.company_id = p_company_id and p.service_code = p_service_code;
$$;

create or replace function public.get_native_service_tax_profile(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_service_code text
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tenant uuid;
begin
  v_tenant := public.native_service_tax_assert_access(p_actor_user_id, p_organization_id, p_company_id);
  return public.native_service_tax_profile_json(v_tenant, p_company_id, btrim(p_service_code));
end;
$$;

create or replace function public.set_native_service_tax_treatment(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_service_code text, p_unit_code text, p_jurisdiction text, p_tax_code text, p_treatment text,
  p_effective_from date, p_legal_basis text, p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_profile public.shared_service_tax_profiles%rowtype;
  v_current public.shared_service_tax_assignments%rowtype; v_next_version integer;
begin
  v_tenant := public.native_service_tax_assert_access(p_actor_user_id, p_organization_id, p_company_id);
  if nullif(btrim(p_service_code), '') is null or length(btrim(p_service_code)) > 128
    or nullif(btrim(p_unit_code), '') is null or length(btrim(p_unit_code)) > 32
    or nullif(btrim(p_jurisdiction), '') is null or length(btrim(p_jurisdiction)) > 16
    or nullif(btrim(p_tax_code), '') is null or length(btrim(p_tax_code)) > 64
    or p_treatment not in ('taxed', 'exempt', 'exonerated', 'not_subject')
    or nullif(btrim(p_legal_basis), '') is null or length(btrim(p_legal_basis)) > 500
    or p_expected_version is null or p_expected_version < 0 or p_effective_from is null then
    raise exception 'TAXATION_PROFILE_INVALID';
  end if;

  insert into public.shared_service_tax_profiles(tenant_id, id, company_id, service_code, fiscal_unit_code, jurisdiction)
  values (v_tenant, gen_random_uuid()::text, p_company_id, btrim(p_service_code), btrim(p_unit_code), upper(btrim(p_jurisdiction)))
  on conflict (tenant_id, company_id, service_code) do nothing;
  select * into v_profile from public.shared_service_tax_profiles
    where tenant_id = v_tenant and company_id = p_company_id and service_code = btrim(p_service_code)
    for update;
  if not found then raise exception 'TAXATION_PROFILE_NOT_FOUND'; end if;
  if v_profile.version <> p_expected_version then raise exception 'TAXATION_VERSION_CONFLICT'; end if;
  if v_profile.jurisdiction <> upper(btrim(p_jurisdiction)) or v_profile.fiscal_unit_code <> btrim(p_unit_code) then
    raise exception 'TAXATION_PROFILE_INVALID';
  end if;

  select * into v_current from public.shared_service_tax_assignments
    where tenant_id = v_tenant and profile_id = v_profile.id
      and tax_code = upper(btrim(p_tax_code)) and effective_to is null
    for update;
  if found and p_effective_from < v_current.effective_from then raise exception 'TAXATION_PROFILE_INVALID'; end if;
  v_next_version := v_profile.version + 1;
  if found and p_effective_from = v_current.effective_from then
    update public.shared_service_tax_assignments set treatment = p_treatment,
      legal_basis = btrim(p_legal_basis), classification_version = 'service:' || v_next_version::text
    where tenant_id = v_tenant and id = v_current.id;
  else
    if found then
      update public.shared_service_tax_assignments set effective_to = p_effective_from - 1
      where tenant_id = v_tenant and id = v_current.id;
    end if;
    insert into public.shared_service_tax_assignments(
      tenant_id, id, profile_id, tax_code, treatment, effective_from,
      effective_to, legal_basis, classification_version
    ) values (
      v_tenant, gen_random_uuid()::text, v_profile.id, upper(btrim(p_tax_code)), p_treatment,
      p_effective_from, null, btrim(p_legal_basis), 'service:' || v_next_version::text
    );
  end if;
  update public.shared_service_tax_profiles set version = v_next_version, updated_at = now()
    where tenant_id = v_tenant and id = v_profile.id;
  return public.native_service_tax_profile_json(v_tenant, p_company_id, btrim(p_service_code));
exception when unique_violation then raise exception 'TAXATION_VERSION_CONFLICT';
end;
$$;

revoke all on function public.native_service_tax_assert_access(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.native_service_tax_profile_json(uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_native_service_tax_profile(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_native_service_tax_treatment(uuid, uuid, text, text, text, text, text, text, date, text, integer) from public, anon, authenticated;
grant execute on function public.get_native_service_tax_profile(uuid, uuid, text, text) to service_role;
grant execute on function public.set_native_service_tax_treatment(uuid, uuid, text, text, text, text, text, text, date, text, integer) to service_role;

-- Preserve the legacy transactional writer while storing the chosen service
-- classification by stable invoice-line ID. Product lines cannot carry one.
alter function public.shared_inventory_sales_invoice_save(uuid, jsonb, jsonb)
  rename to shared_inventory_sales_invoice_save_service_tax_base;
create function public.shared_inventory_sales_invoice_save(
  p_tenant_id uuid, p_invoice jsonb, p_items jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_item jsonb; v_code text;
begin
  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
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
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item
  where i.tenant_id = p_tenant_id and i.invoice_id = v_result->>'id'
    and i.id = item.value->>'id';
  return v_result;
end;
$$;
revoke all on function public.shared_inventory_sales_invoice_save(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.shared_inventory_sales_invoice_save(uuid, jsonb, jsonb) to service_role;

commit;

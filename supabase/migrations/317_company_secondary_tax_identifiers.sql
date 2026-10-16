-- ADM-027: store additional tax identities without overloading the primary RIF.
-- Values are opaque jurisdiction-issued identifiers; this schema does not
-- claim to validate an authority-specific legal format.

create table public.shared_company_secondary_tax_identifiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id text not null,
  jurisdiction text not null check (jurisdiction ~ '^[A-Z]{2}$'),
  scheme text not null check (scheme ~ '^[a-z][a-z0-9._-]{0,63}$'),
  identifier_value text,
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, company_id, jurisdiction, scheme),
  foreign key (tenant_id, company_id)
    references public.shared_companies(tenant_id, id) on delete cascade,
  check (
    (active and identifier_value is not null
      and length(btrim(identifier_value)) between 1 and 128
      and identifier_value !~ '[[:cntrl:]]')
    or (not active and identifier_value is null)
  )
);

create table public.shared_company_secondary_tax_identifier_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id text not null,
  identifier_id uuid not null,
  jurisdiction text not null,
  scheme text not null,
  actor_user_id uuid not null,
  action text not null check (action in ('created', 'updated', 'reactivated', 'retired')),
  previous_version integer,
  version integer not null check (version > 0),
  occurred_at timestamptz not null default now(),
  foreign key (tenant_id, company_id)
    references public.shared_companies(tenant_id, id) on delete cascade
);

create index shared_company_secondary_tax_identifier_events_scope_idx
  on public.shared_company_secondary_tax_identifier_events(tenant_id, company_id, occurred_at desc);

alter table public.shared_company_secondary_tax_identifiers enable row level security;
alter table public.shared_company_secondary_tax_identifier_events enable row level security;
revoke all on public.shared_company_secondary_tax_identifiers,
  public.shared_company_secondary_tax_identifier_events from public, anon, authenticated, service_role;

create or replace function public.get_native_company_secondary_tax_identifiers(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  v_tenant := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'companies.read');
  if not exists (select 1 from public.shared_companies where tenant_id=v_tenant and organization_id=p_organization_id and id=p_company_id) then
    raise exception 'COMPANY_NOT_FOUND';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',id,'organization_id',organization_id,'company_id',company_id,
      'jurisdiction',jurisdiction,'scheme',scheme,'identifier_value',identifier_value,
      'version',version,'created_at',created_at,'updated_at',updated_at
    ) order by jurisdiction,scheme)
    from public.shared_company_secondary_tax_identifiers
    where tenant_id=v_tenant and organization_id=p_organization_id and company_id=p_company_id and active
  ),'[]'::jsonb);
end;
$$;

create or replace function public.set_native_company_secondary_tax_identifier(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_jurisdiction text, p_scheme text, p_identifier_value text, p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_current public.shared_company_secondary_tax_identifiers%rowtype;
  v_saved public.shared_company_secondary_tax_identifiers%rowtype; v_action text;
begin
  v_tenant := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'companies.update');
  if p_expected_version is null or p_expected_version < 0
    or p_jurisdiction is null or p_jurisdiction !~ '^[A-Z]{2}$'
    or p_scheme is null or p_scheme !~ '^[a-z][a-z0-9._-]{0,63}$'
    or p_identifier_value is null or length(btrim(p_identifier_value)) not between 1 and 128
    or p_identifier_value ~ '[[:cntrl:]]'
  then raise exception 'COMPANY_SECONDARY_TAX_IDENTIFIER_INVALID'; end if;
  if not exists (select 1 from public.shared_companies where tenant_id=v_tenant and organization_id=p_organization_id and id=p_company_id and status='active') then
    raise exception 'COMPANY_NOT_FOUND';
  end if;
  select * into v_current from public.shared_company_secondary_tax_identifiers
   where tenant_id=v_tenant and company_id=p_company_id and jurisdiction=p_jurisdiction and scheme=p_scheme for update;
  if not found then
    if p_expected_version <> 0 then raise exception 'COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT'; end if;
    begin
      insert into public.shared_company_secondary_tax_identifiers(
        tenant_id,organization_id,company_id,jurisdiction,scheme,identifier_value
      ) values (v_tenant,p_organization_id,p_company_id,p_jurisdiction,p_scheme,btrim(p_identifier_value))
      returning * into v_saved;
    exception when unique_violation then
      raise exception 'COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT';
    end;
    v_action := 'created';
  else
    if not v_current.active then
      if p_expected_version not in (0,v_current.version) then
        raise exception 'COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT';
      end if;
      v_action := 'reactivated';
      update public.shared_company_secondary_tax_identifiers
         set identifier_value=btrim(p_identifier_value),active=true,version=version+1,updated_at=now()
       where id=v_current.id returning * into v_saved;
    elsif v_current.version <> p_expected_version then
      if v_current.active and v_current.identifier_value = btrim(p_identifier_value) then
        v_saved := v_current;
        return jsonb_build_object(
          'id',v_saved.id,'organization_id',v_saved.organization_id,'company_id',v_saved.company_id,
          'jurisdiction',v_saved.jurisdiction,'scheme',v_saved.scheme,'identifier_value',v_saved.identifier_value,
          'version',v_saved.version,'created_at',v_saved.created_at,'updated_at',v_saved.updated_at
        );
      end if;
      raise exception 'COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT';
    else
      v_action := 'updated';
      update public.shared_company_secondary_tax_identifiers
         set identifier_value=btrim(p_identifier_value),active=true,version=version+1,updated_at=now()
       where id=v_current.id returning * into v_saved;
    end if;
  end if;
  insert into public.shared_company_secondary_tax_identifier_events(
    tenant_id,organization_id,company_id,identifier_id,jurisdiction,scheme,
    actor_user_id,action,previous_version,version
  ) values (
    v_tenant,p_organization_id,p_company_id,v_saved.id,p_jurisdiction,p_scheme,
    p_actor_user_id,v_action,case when v_action='created' then null else v_current.version end,v_saved.version
  );
  return jsonb_build_object(
    'id',v_saved.id,'organization_id',v_saved.organization_id,'company_id',v_saved.company_id,
    'jurisdiction',v_saved.jurisdiction,'scheme',v_saved.scheme,'identifier_value',v_saved.identifier_value,
    'version',v_saved.version,'created_at',v_saved.created_at,'updated_at',v_saved.updated_at
  );
end;
$$;

create or replace function public.remove_native_company_secondary_tax_identifier(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_jurisdiction text, p_scheme text, p_expected_version integer
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_current public.shared_company_secondary_tax_identifiers%rowtype;
  v_saved public.shared_company_secondary_tax_identifiers%rowtype;
begin
  v_tenant := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'companies.update');
  if p_expected_version is null or p_expected_version < 1
    or p_jurisdiction is null or p_jurisdiction !~ '^[A-Z]{2}$'
    or p_scheme is null or p_scheme !~ '^[a-z][a-z0-9._-]{0,63}$'
  then raise exception 'COMPANY_SECONDARY_TAX_IDENTIFIER_INVALID'; end if;
  select * into v_current from public.shared_company_secondary_tax_identifiers
   where tenant_id=v_tenant and organization_id=p_organization_id and company_id=p_company_id
     and jurisdiction=p_jurisdiction and scheme=p_scheme for update;
  if not found then raise exception 'COMPANY_SECONDARY_TAX_IDENTIFIER_NOT_FOUND'; end if;
  if not v_current.active and p_expected_version=v_current.version-1 then return true; end if;
  if v_current.version <> p_expected_version then raise exception 'COMPANY_SECONDARY_TAX_IDENTIFIER_VERSION_CONFLICT'; end if;
  if not v_current.active then return true; end if;
  update public.shared_company_secondary_tax_identifiers
     set identifier_value=null,active=false,version=version+1,updated_at=now()
   where id=v_current.id returning * into v_saved;
  insert into public.shared_company_secondary_tax_identifier_events(
    tenant_id,organization_id,company_id,identifier_id,jurisdiction,scheme,
    actor_user_id,action,previous_version,version
  ) values (
    v_tenant,p_organization_id,p_company_id,v_saved.id,p_jurisdiction,p_scheme,
    p_actor_user_id,'retired',v_current.version,v_saved.version
  );
  return true;
end;
$$;

revoke all on function public.get_native_company_secondary_tax_identifiers(uuid,uuid,text),
  public.set_native_company_secondary_tax_identifier(uuid,uuid,text,text,text,text,integer),
  public.remove_native_company_secondary_tax_identifier(uuid,uuid,text,text,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_native_company_secondary_tax_identifiers(uuid,uuid,text),
  public.set_native_company_secondary_tax_identifier(uuid,uuid,text,text,text,text,integer),
  public.remove_native_company_secondary_tax_identifier(uuid,uuid,text,text,text,integer)
  to service_role;

-- User-scoped operational defaults shared by native clients. Module periods and
-- confirmed transaction rates remain owned by their respective capabilities.
create table if not exists public.shared_user_company_operational_defaults (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_id uuid not null,
  company_id text not null,
  effective_date date not null,
  presentation_currency text not null check (presentation_currency ~ '^[A-Z]{3}$'),
  selected_rate jsonb not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, organization_id, company_id),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete cascade
);

create index if not exists shared_operational_defaults_company_idx
  on public.shared_user_company_operational_defaults(organization_id, company_id);

alter table public.shared_user_company_operational_defaults enable row level security;
revoke all on public.shared_user_company_operational_defaults from anon, authenticated;

create or replace function public.actor_can_access_shared_company(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_company_id text
) returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.shared_companies c
    where c.organization_id=p_organization_id and c.id=p_company_id
      and (
        exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active')
        or exists(
          select 1 from public.organization_delegation_member_assignments a
          join public.organization_delegations d on d.id=a.delegation_id
          where a.user_id=p_actor_user_id and a.status='active'
            and d.client_organization_id=p_organization_id and d.status='active'
            and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now())
        )
      )
  );
$$;

create or replace function public.get_shared_operation_context(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_company_id text
) returns setof public.shared_user_company_operational_defaults
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.actor_can_access_shared_company(p_actor_user_id,p_organization_id,p_company_id) then
    raise exception 'OPERATION_CONTEXT_ACCESS_DENIED';
  end if;
  return query select * from public.shared_user_company_operational_defaults d
    where d.user_id=p_actor_user_id and d.organization_id=p_organization_id and d.company_id=p_company_id;
end $$;

create or replace function public.update_shared_operation_context(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_company_id text,
  p_effective_date date,
  p_presentation_currency text,
  p_selected_rate jsonb,
  p_expected_version integer
) returns public.shared_user_company_operational_defaults
language plpgsql security definer set search_path=public as $$
declare v_tenant_id uuid;v_result public.shared_user_company_operational_defaults;
begin
  if not public.actor_can_access_shared_company(p_actor_user_id,p_organization_id,p_company_id) then raise exception 'OPERATION_CONTEXT_ACCESS_DENIED';end if;
  if p_expected_version<0 or p_presentation_currency!~'^[A-Z]{3}$' or jsonb_typeof(p_selected_rate)<>'object' then raise exception 'OPERATION_CONTEXT_INVALID';end if;
  select tenant_id into v_tenant_id from public.shared_companies where organization_id=p_organization_id and id=p_company_id;
  if p_expected_version=0 then
    insert into public.shared_user_company_operational_defaults(user_id,organization_id,tenant_id,company_id,effective_date,presentation_currency,selected_rate,version)
    values(p_actor_user_id,p_organization_id,v_tenant_id,p_company_id,p_effective_date,p_presentation_currency,p_selected_rate,1)
    on conflict(user_id,organization_id,company_id)do nothing returning * into v_result;
  else
    update public.shared_user_company_operational_defaults set effective_date=p_effective_date,presentation_currency=p_presentation_currency,
      selected_rate=p_selected_rate,version=version+1,updated_at=now()
    where user_id=p_actor_user_id and organization_id=p_organization_id and company_id=p_company_id and version=p_expected_version returning * into v_result;
  end if;
  if v_result.user_id is null then raise exception 'OPERATION_CONTEXT_VERSION_CONFLICT';end if;
  return v_result;
end $$;

create or replace function public.clear_shared_operation_context(
  p_actor_user_id uuid,p_organization_id uuid,p_company_id text
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.actor_can_access_shared_company(p_actor_user_id,p_organization_id,p_company_id) then raise exception 'OPERATION_CONTEXT_ACCESS_DENIED';end if;
  delete from public.shared_user_company_operational_defaults where user_id=p_actor_user_id and organization_id=p_organization_id and company_id=p_company_id;
end $$;

revoke all on function public.actor_can_access_shared_company(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.get_shared_operation_context(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.update_shared_operation_context(uuid,uuid,text,date,text,jsonb,integer) from public,anon,authenticated;
revoke all on function public.clear_shared_operation_context(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.get_shared_operation_context(uuid,uuid,text) to service_role;
grant execute on function public.update_shared_operation_context(uuid,uuid,text,date,text,jsonb,integer) to service_role;
grant execute on function public.clear_shared_operation_context(uuid,uuid,text) to service_role;

begin;

alter table public.shared_companies
  add column if not exists iva_periodicity text check (iva_periodicity in ('monthly','fortnightly'));

create table if not exists public.shared_tax_reporting_periods (
  tenant_id uuid not null,
  organization_id uuid not null,
  company_id text not null,
  period_key text not null,
  periodicity text not null check (periodicity in ('monthly','fortnightly')),
  status text not null check (status in ('open','in_review','prepared','declared','paid','closed')),
  version integer not null check (version >= 0),
  declaration_id text,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id,organization_id,company_id,period_key),
  foreign key (tenant_id,company_id) references public.shared_companies(tenant_id,id),
  check ((periodicity='monthly' and period_key ~ '^\d{4}-(0[1-9]|1[0-2])$') or (periodicity='fortnightly' and period_key ~ '^\d{4}-(0[1-9]|1[0-2])-Q[12]$')),
  check ((status in ('prepared','declared','paid','closed')) = (declaration_id is not null))
);
create table if not exists public.shared_tax_reporting_period_events (
  tenant_id uuid not null,
  organization_id uuid not null,
  company_id text not null,
  period_key text not null,
  version integer not null,
  from_status text,
  to_status text not null,
  actor_id uuid not null,
  occurred_at timestamptz not null,
  reason text,
  declaration_id text,
  idempotency_key text not null,
  primary key (tenant_id,organization_id,company_id,period_key,version),
  unique (tenant_id,idempotency_key),
  foreign key (tenant_id,organization_id,company_id,period_key) references public.shared_tax_reporting_periods(tenant_id,organization_id,company_id,period_key)
);
create table if not exists public.shared_tax_reporting_period_commands (
  tenant_id uuid not null,
  idempotency_key text not null,
  organization_id uuid not null,
  company_id text not null,
  period_key text not null,
  actor_id uuid not null,
  request_snapshot jsonb not null,
  result_snapshot jsonb,
  created_at timestamptz not null default now(),
  primary key (tenant_id,idempotency_key)
);
alter table public.shared_tax_reporting_periods enable row level security;
alter table public.shared_tax_reporting_period_events enable row level security;
alter table public.shared_tax_reporting_period_commands enable row level security;
revoke all on public.shared_tax_reporting_periods,public.shared_tax_reporting_period_events,public.shared_tax_reporting_period_commands from public,anon,authenticated;
grant select,insert,update on public.shared_tax_reporting_periods to service_role;
grant select,insert on public.shared_tax_reporting_period_events,public.shared_tax_reporting_period_commands to service_role;

create or replace function public.shared_tax_reporting_period_read(
  p_tenant_id uuid,p_organization_id uuid,p_company_id text,p_actor_id uuid,p_period_key text
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_period public.shared_tax_reporting_periods%rowtype; v_periodicity text;
begin
  if p_actor_id is null or p_period_key is null or length(p_period_key)>16 then raise exception 'TAX_REPORTING_INVALID'; end if;
  select iva_periodicity into v_periodicity from public.shared_companies where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id;
  if not found then raise exception 'TAX_REPORTING_SCOPE'; end if;
  if not exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_actor_id and status='active')
    and not exists(select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope in ('purchases','sales'))
  then raise exception 'TAX_REPORTING_SCOPE'; end if;
  select * into v_period from public.shared_tax_reporting_periods where tenant_id=p_tenant_id and organization_id=p_organization_id and company_id=p_company_id and period_key=p_period_key;
  if not found then return jsonb_build_object('periodKey',p_period_key,'periodicity',v_periodicity,'status','open','version',0,'declarationId',null,'events','[]'::jsonb,'pending',case when v_periodicity is null then jsonb_build_array('PERIODICITY_UNCONFIGURED') else '[]'::jsonb end); end if;
  return jsonb_build_object('periodKey',v_period.period_key,'periodicity',v_period.periodicity,'status',v_period.status,'version',v_period.version,'declarationId',v_period.declaration_id,
    'events',coalesce((select jsonb_agg(jsonb_build_object('from',e.from_status,'to',e.to_status,'actorId',e.actor_id,'occurredAt',e.occurred_at,'reason',e.reason,'idempotencyKey',e.idempotency_key,'version',e.version,'declarationId',e.declaration_id) order by e.version) from public.shared_tax_reporting_period_events e where e.tenant_id=p_tenant_id and e.organization_id=p_organization_id and e.company_id=p_company_id and e.period_key=p_period_key),'[]'::jsonb),'pending','[]'::jsonb);
end $$;

create or replace function public.shared_tax_reporting_period_transition(
  p_tenant_id uuid,p_organization_id uuid,p_company_id text,p_actor_id uuid,p_period_key text,
  p_target_status text,p_expected_version integer,p_idempotency_key text,p_reason text default null,p_declaration_id text default null,p_occurred_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_period public.shared_tax_reporting_periods%rowtype; v_periodicity text; v_allowed boolean:=false; v_request jsonb; v_saved jsonb; v_existing public.shared_tax_reporting_period_commands%rowtype; v_version integer; v_from_status text; v_declaration_id text;
begin
  if p_actor_id is null or nullif(btrim(p_idempotency_key),'') is null or p_expected_version is null or p_expected_version<0 or p_occurred_at is null then raise exception 'TAX_REPORTING_INVALID'; end if;
  if not exists(select 1 from public.shared_companies where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id) then raise exception 'TAX_REPORTING_SCOPE'; end if;
  if not exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_actor_id and status='active') then raise exception 'TAX_REPORTING_SCOPE'; end if;
  select iva_periodicity into v_periodicity from public.shared_companies where tenant_id=p_tenant_id and id=p_company_id;
  if v_periodicity is null then raise exception 'TAX_REPORTING_PERIODICITY_UNCONFIGURED'; end if;
  if not ((v_periodicity='monthly' and p_period_key ~ '^\d{4}-(0[1-9]|1[0-2])$') or (v_periodicity='fortnightly' and p_period_key ~ '^\d{4}-(0[1-9]|1[0-2])-Q[12]$')) then raise exception 'TAX_REPORTING_INVALID'; end if;
  v_request:=jsonb_build_object('target',p_target_status,'version',p_expected_version,'reason',nullif(btrim(p_reason),''),'declarationId',nullif(btrim(p_declaration_id),''),'occurredAt',p_occurred_at);
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':vat-period:'||btrim(p_idempotency_key),0));
  select * into v_existing from public.shared_tax_reporting_period_commands where tenant_id=p_tenant_id and idempotency_key=btrim(p_idempotency_key) for update;
  if found then
    if v_existing.organization_id=p_organization_id and v_existing.company_id=p_company_id and v_existing.period_key=p_period_key and v_existing.actor_id=p_actor_id and v_existing.request_snapshot=v_request and v_existing.result_snapshot is not null then return jsonb_build_object('period',v_existing.result_snapshot,'replayed',true); end if;
    raise exception 'TAX_REPORTING_IDEMPOTENCY_CONFLICT';
  end if;
  insert into public.shared_tax_reporting_period_commands(tenant_id,idempotency_key,organization_id,company_id,period_key,actor_id,request_snapshot) values(p_tenant_id,btrim(p_idempotency_key),p_organization_id,p_company_id,p_period_key,p_actor_id,v_request);
  insert into public.shared_tax_reporting_periods(tenant_id,organization_id,company_id,period_key,periodicity,status,version,updated_by)
    values(p_tenant_id,p_organization_id,p_company_id,p_period_key,v_periodicity,'open',0,p_actor_id) on conflict do nothing;
  select * into v_period from public.shared_tax_reporting_periods where tenant_id=p_tenant_id and organization_id=p_organization_id and company_id=p_company_id and period_key=p_period_key for update;
  if v_period.version<>p_expected_version then raise exception 'TAX_REPORTING_CONCURRENCY_CONFLICT'; end if;
  v_from_status:=v_period.status;
  v_declaration_id:=v_period.declaration_id;
  v_allowed:=(v_period.status='open' and p_target_status='in_review') or (v_period.status='in_review' and p_target_status='prepared') or (v_period.status='prepared' and p_target_status='declared') or (v_period.status='declared' and p_target_status='paid') or (v_period.status='paid' and p_target_status='closed') or (v_period.status in ('in_review','prepared') and p_target_status='open');
  if not v_allowed then raise exception 'TAX_REPORTING_PERIOD_TRANSITION_INVALID'; end if;
  if p_target_status='open' and nullif(btrim(p_reason),'') is null then raise exception 'TAX_REPORTING_INVALID'; end if;
  if (p_target_status='prepared')<>(nullif(btrim(p_declaration_id),'') is not null) then raise exception 'TAX_REPORTING_INVALID'; end if;
  v_version:=v_period.version+1;
  update public.shared_tax_reporting_periods set status=p_target_status,version=v_version,declaration_id=case when p_target_status='prepared' then btrim(p_declaration_id) when p_target_status='open' then null else v_declaration_id end,updated_by=p_actor_id,updated_at=p_occurred_at
    where tenant_id=p_tenant_id and organization_id=p_organization_id and company_id=p_company_id and period_key=p_period_key and version=p_expected_version returning * into v_period;
  insert into public.shared_tax_reporting_period_events(tenant_id,organization_id,company_id,period_key,version,from_status,to_status,actor_id,occurred_at,reason,declaration_id,idempotency_key)
    values(p_tenant_id,p_organization_id,p_company_id,p_period_key,v_version,v_from_status,p_target_status,p_actor_id,p_occurred_at,nullif(btrim(p_reason),''),case when p_target_status='prepared' then btrim(p_declaration_id) else v_declaration_id end,btrim(p_idempotency_key));
  v_saved:=jsonb_build_object('periodKey',p_period_key,'periodicity',v_periodicity,'status',p_target_status,'version',v_version,'declarationId',case when p_target_status='prepared' then btrim(p_declaration_id) when p_target_status='open' then null else v_declaration_id end);
  update public.shared_tax_reporting_period_commands set result_snapshot=v_saved where tenant_id=p_tenant_id and idempotency_key=btrim(p_idempotency_key);
  return jsonb_build_object('period',v_saved,'replayed',false);
end $$;

create or replace function public.shared_tax_reporting_reject_closed_period_fact()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.shared_tax_reporting_periods p where p.tenant_id=new.tenant_id and p.organization_id=new.organization_id and p.company_id=new.company_id and p.period_key=new.period and p.status='closed') then raise exception 'TAX_REPORTING_PERIOD_CLOSED'; end if;
  return new;
end $$;
create trigger shared_tax_reporting_fact_open_period_only before insert on public.shared_tax_reporting_facts for each row execute function public.shared_tax_reporting_reject_closed_period_fact();

revoke all on function public.shared_tax_reporting_period_read(uuid,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.shared_tax_reporting_period_transition(uuid,uuid,text,uuid,text,text,integer,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.shared_tax_reporting_reject_closed_period_fact() from public,anon,authenticated;
grant execute on function public.shared_tax_reporting_period_read(uuid,uuid,text,uuid,text) to service_role;
grant execute on function public.shared_tax_reporting_period_transition(uuid,uuid,text,uuid,text,text,integer,text,text,text,timestamptz) to service_role;
commit;

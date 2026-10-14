begin;

-- Historical VAT facts are snapshots. They intentionally do not FK legacy sales
-- or purchasing tables because a source can be migrated after those rows evolve.
create table if not exists public.shared_tax_reporting_facts (
  tenant_id uuid not null,
  organization_id uuid not null,
  company_id text not null,
  id text not null,
  source_kind text not null,
  source_id text not null,
  lineage_key text not null,
  recognition_date date not null,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  fact_snapshot jsonb not null check (jsonb_typeof(fact_snapshot) = 'object'),
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, company_id, lineage_key),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id)
);
create index if not exists shared_tax_reporting_facts_scope_page_idx on public.shared_tax_reporting_facts (tenant_id, organization_id, company_id, recognition_date, id);

create table if not exists public.shared_tax_reporting_fact_commands (
  tenant_id uuid not null, idempotency_key text not null,
  fact_id text not null, actor_id uuid not null, request_snapshot jsonb not null,
  recorded_at timestamptz not null default now(), primary key (tenant_id, idempotency_key)
);

create table if not exists public.shared_tax_reporting_declarations (
  tenant_id uuid not null, organization_id uuid not null, company_id text not null,
  id text not null, period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  revision integer not null check (revision > 0), declaration_snapshot jsonb not null check (jsonb_typeof(declaration_snapshot) = 'object'),
  created_by uuid not null, created_at timestamptz not null default now(),
  primary key (tenant_id, id, revision), unique (tenant_id, company_id, period, revision),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id)
);
create table if not exists public.shared_tax_reporting_declaration_commands (
  tenant_id uuid not null, idempotency_key text not null, declaration_id text not null,
  request_snapshot jsonb not null, actor_id uuid not null, recorded_at timestamptz not null default now(), primary key (tenant_id, idempotency_key)
);

alter table public.shared_tax_reporting_facts enable row level security;
alter table public.shared_tax_reporting_fact_commands enable row level security;
alter table public.shared_tax_reporting_declarations enable row level security;
alter table public.shared_tax_reporting_declaration_commands enable row level security;

create or replace function public.shared_tax_reporting_fact_append(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_fact_id text, p_fact_snapshot jsonb,
  p_actor_id uuid, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_existing public.shared_tax_reporting_fact_commands%rowtype; v_fact public.shared_tax_reporting_facts%rowtype;
begin
  if p_fact_snapshot is null or jsonb_typeof(p_fact_snapshot) <> 'object' or nullif(btrim(p_fact_id),'') is null
    or nullif(btrim(p_idempotency_key),'') is null or p_actor_id is null
    or p_fact_snapshot->>'id' is distinct from btrim(p_fact_id) or p_fact_snapshot->'scope'->>'tenantId' is distinct from p_tenant_id::text
    or p_fact_snapshot->'scope'->>'organizationId' is distinct from p_organization_id::text or p_fact_snapshot->'scope'->>'companyId' is distinct from p_company_id
    or p_fact_snapshot->>'direction' is null or p_fact_snapshot->>'direction' not in ('purchase','sale','import')
    or p_fact_snapshot->'source'->>'lineageKey' is null or p_fact_snapshot->>'period' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'TAX_REPORTING_INVALID'; end if;
  if not exists (select 1 from public.shared_companies where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id) then raise exception 'TAX_REPORTING_SCOPE'; end if;
  if not exists (select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_actor_id and status='active')
    and not exists (select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id
      where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now())
        and s.scope=case p_fact_snapshot->>'direction' when 'sale' then 'sales' else 'purchases' end) then raise exception 'TAX_REPORTING_SCOPE'; end if;
  -- There is no command row to lock on the first request. Serialize by tenant
  -- and idempotency key before checking so simultaneous retries replay cleanly.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':tax-reporting-fact:'||btrim(p_idempotency_key),0));
  select * into v_existing from public.shared_tax_reporting_fact_commands where tenant_id=p_tenant_id and idempotency_key=btrim(p_idempotency_key) for update;
  if found then
    if v_existing.fact_id=btrim(p_fact_id) and v_existing.actor_id=p_actor_id and v_existing.request_snapshot=p_fact_snapshot then
      select * into v_fact from public.shared_tax_reporting_facts where tenant_id=p_tenant_id and id=v_existing.fact_id;
      return jsonb_build_object('fact_snapshot',v_fact.fact_snapshot,'replayed',true);
    end if; raise exception 'TAX_REPORTING_IDEMPOTENCY_CONFLICT';
  end if;
  insert into public.shared_tax_reporting_facts(tenant_id,organization_id,company_id,id,source_kind,source_id,lineage_key,recognition_date,period,fact_snapshot,recorded_by)
  values(p_tenant_id,p_organization_id,p_company_id,btrim(p_fact_id),p_fact_snapshot->'source'->>'kind',p_fact_snapshot->'source'->>'id',p_fact_snapshot->'source'->>'lineageKey',(p_fact_snapshot->>'recognitionDate')::date,p_fact_snapshot->>'period',p_fact_snapshot,p_actor_id) returning * into v_fact;
  insert into public.shared_tax_reporting_fact_commands(tenant_id,idempotency_key,fact_id,actor_id,request_snapshot) values(p_tenant_id,btrim(p_idempotency_key),v_fact.id,p_actor_id,p_fact_snapshot);
  return jsonb_build_object('fact_snapshot',v_fact.fact_snapshot,'replayed',false);
exception when unique_violation then raise exception 'TAX_REPORTING_IDEMPOTENCY_CONFLICT';
end $$;

create or replace function public.shared_tax_reporting_fact_list(
  p_tenant_id uuid,p_organization_id uuid,p_company_id text,p_actor_id uuid,p_from date,p_to date,p_limit integer,p_cursor_recognition_date date default null,p_cursor_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if p_actor_id is null or p_from is null or p_to is null or p_from>p_to or p_limit not between 1 and 100 then raise exception 'TAX_REPORTING_INVALID'; end if;
  if not exists(select 1 from public.shared_companies where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id) then raise exception 'TAX_REPORTING_SCOPE'; end if;
  -- A cross-direction reporting page may expose both books. Delegates need both grants;
  -- organization members retain their ordinary company-wide reporting access.
  if not exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_actor_id and status='active') and (
    not exists(select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='purchases')
    or not exists(select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='sales')
  ) then raise exception 'TAX_REPORTING_SCOPE'; end if;
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object('fact_snapshot',q.fact_snapshot) order by q.recognition_date,q.id) filter(where q.ordinality<=p_limit),'[]'::jsonb),
    'nextCursor',case when count(*)>p_limit then jsonb_build_object(
      'recognitionDate',(max(q.recognition_date) filter(where q.ordinality=p_limit))::text,
      'id',(array_agg(q.id order by q.recognition_date,q.id) filter(where q.ordinality=p_limit))[1]
    ) else null end
  ) into v_result from (
    select f.*,row_number() over(order by f.recognition_date,f.id) as ordinality
    from public.shared_tax_reporting_facts f
    where f.tenant_id=p_tenant_id and f.organization_id=p_organization_id and f.company_id=p_company_id
      and f.recognition_date between p_from and p_to
      and (p_cursor_recognition_date is null or (f.recognition_date,f.id)>(p_cursor_recognition_date,p_cursor_id))
    order by f.recognition_date,f.id limit p_limit+1
  ) q;
  return v_result;
end $$;

create or replace function public.shared_tax_reporting_declaration_save(
  p_tenant_id uuid,p_organization_id uuid,p_company_id text,p_declaration_id text,p_declaration_snapshot jsonb,p_actor_id uuid,p_idempotency_key text,p_expected_revision integer default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_existing public.shared_tax_reporting_declaration_commands%rowtype; v_current public.shared_tax_reporting_declarations%rowtype; v_saved public.shared_tax_reporting_declarations%rowtype;
begin
 if p_actor_id is null or nullif(btrim(p_idempotency_key),'') is null or nullif(btrim(p_declaration_id),'') is null
   or p_declaration_snapshot is null or jsonb_typeof(p_declaration_snapshot)<>'object'
   or p_declaration_snapshot->>'id' is distinct from btrim(p_declaration_id)
   or p_declaration_snapshot->'scope'->>'tenantId' is distinct from p_tenant_id::text
   or p_declaration_snapshot->'scope'->>'organizationId' is distinct from p_organization_id::text
   or p_declaration_snapshot->'scope'->>'companyId' is distinct from p_company_id
   or p_declaration_snapshot->>'period' is null or p_declaration_snapshot->>'period' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
   or p_declaration_snapshot->>'revision' is null or p_declaration_snapshot->>'revision' !~ '^[1-9][0-9]*$'
   or p_declaration_snapshot->>'status' is null or p_declaration_snapshot->>'status' not in ('draft','prepared','submitted','paid','void')
   or (p_declaration_snapshot->>'status' in ('submitted','paid') and (p_declaration_snapshot->'submittedEvidence' is null or jsonb_typeof(p_declaration_snapshot->'submittedEvidence')<>'object'))
   or (p_declaration_snapshot->>'status'='paid' and (jsonb_typeof(p_declaration_snapshot->'payments')<>'array' or jsonb_array_length(p_declaration_snapshot->'payments')=0))
   or (p_declaration_snapshot->>'status'='void' and (jsonb_typeof(p_declaration_snapshot->'voidEvidence') is distinct from 'object' or nullif(btrim(p_declaration_snapshot->'voidEvidence'->>'reason'),'') is null or nullif(btrim(p_declaration_snapshot->'voidEvidence'->>'voidedAt'),'') is null or p_declaration_snapshot->'voidEvidence'->>'actorId' is distinct from p_actor_id::text or (p_declaration_snapshot->'submittedEvidence' is not null and p_declaration_snapshot->'submittedEvidence'<>'null'::jsonb) or jsonb_typeof(p_declaration_snapshot->'payments') is distinct from 'array' or case when jsonb_typeof(p_declaration_snapshot->'payments')='array' then jsonb_array_length(p_declaration_snapshot->'payments')>0 else false end))
   or (p_declaration_snapshot->>'status'<>'void' and p_declaration_snapshot->'voidEvidence' is distinct from 'null'::jsonb)
   or (p_declaration_snapshot->>'status' not in ('draft','void') and jsonb_typeof(p_declaration_snapshot->'reconciliationIssueFactIds')='array' and jsonb_array_length(p_declaration_snapshot->'reconciliationIssueFactIds')>0)
 then raise exception 'TAX_REPORTING_INVALID'; end if;
 if not exists(select 1 from public.shared_companies where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id) then raise exception 'TAX_REPORTING_SCOPE'; end if;
 if not exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_actor_id and status='active') and (
   not exists(select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='purchases')
   or not exists(select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='sales')
 ) then raise exception 'TAX_REPORTING_SCOPE'; end if;
 -- Serialize a first-use idempotency key even though no command row exists yet.
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':vat-declaration-command:'||btrim(p_idempotency_key),0));
 select * into v_existing from public.shared_tax_reporting_declaration_commands where tenant_id=p_tenant_id and idempotency_key=btrim(p_idempotency_key) for update;
 if found then if v_existing.declaration_id=btrim(p_declaration_id) and v_existing.request_snapshot=p_declaration_snapshot and v_existing.actor_id=p_actor_id then select * into v_saved from public.shared_tax_reporting_declarations where tenant_id=p_tenant_id and id=v_existing.declaration_id; return jsonb_build_object('declaration_snapshot',v_saved.declaration_snapshot,'replayed',true); end if; raise exception 'TAX_REPORTING_IDEMPOTENCY_CONFLICT'; end if;
 -- Also serialize first revisions, for which SELECT FOR UPDATE sees no row.
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':vat-declaration:'||btrim(p_declaration_id),0));
 select * into v_current from public.shared_tax_reporting_declarations
   where tenant_id=p_tenant_id and id=btrim(p_declaration_id)
   order by revision desc limit 1 for update;
 if found and (p_expected_revision is null or v_current.revision<>p_expected_revision
   or (p_declaration_snapshot->>'revision')::integer<>v_current.revision+1) then raise exception 'TAX_REPORTING_CONCURRENCY_CONFLICT'; end if;
 if not found and (p_expected_revision is not null or (p_declaration_snapshot->>'revision')::integer<>1) then raise exception 'TAX_REPORTING_CONCURRENCY_CONFLICT'; end if;
 insert into public.shared_tax_reporting_declarations(tenant_id,organization_id,company_id,id,period,revision,declaration_snapshot,created_by) values(p_tenant_id,p_organization_id,p_company_id,btrim(p_declaration_id),p_declaration_snapshot->>'period',(p_declaration_snapshot->>'revision')::integer,p_declaration_snapshot,p_actor_id) returning * into v_saved;
 insert into public.shared_tax_reporting_declaration_commands(tenant_id,idempotency_key,declaration_id,request_snapshot,actor_id) values(p_tenant_id,btrim(p_idempotency_key),v_saved.id,p_declaration_snapshot,p_actor_id);
 return jsonb_build_object('declaration_snapshot',v_saved.declaration_snapshot,'replayed',false);
end $$;

create or replace function public.shared_tax_reporting_declaration_list(
  p_tenant_id uuid,p_organization_id uuid,p_company_id text,p_actor_id uuid,
  p_from_period text,p_to_period text,p_limit integer,
  p_cursor_period text default null,p_cursor_id text default null,p_cursor_revision integer default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if p_actor_id is null or p_from_period is null or p_from_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_to_period is null or p_to_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or p_from_period>p_to_period or p_limit is null or p_limit not between 1 and 100
    or not ((p_cursor_period is null and p_cursor_id is null and p_cursor_revision is null)
      or (p_cursor_period is not null and p_cursor_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and nullif(btrim(p_cursor_id),'') is not null and p_cursor_revision is not null and p_cursor_revision>0))
  then raise exception 'TAX_REPORTING_INVALID'; end if;
  if not exists(select 1 from public.shared_companies where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id) then raise exception 'TAX_REPORTING_SCOPE'; end if;
  if not exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_actor_id and status='active') and (
    not exists(select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='purchases')
    or not exists(select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='sales')
  ) then raise exception 'TAX_REPORTING_SCOPE'; end if;
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(q.declaration_snapshot order by q.period,q.id,q.revision) filter(where q.ordinality<=p_limit),'[]'::jsonb),
    'nextCursor',case when count(*)>p_limit then jsonb_build_object(
      'period',max(q.period) filter(where q.ordinality=p_limit),
      'id',(array_agg(q.id order by q.period,q.id,q.revision) filter(where q.ordinality=p_limit))[1],
      'revision',max(q.revision) filter(where q.ordinality=p_limit)
    ) else null end
  ) into v_result from (
    select d.period,d.id,d.revision,d.declaration_snapshot,row_number() over(order by d.period,d.id,d.revision) as ordinality
    from public.shared_tax_reporting_declarations d
    where d.tenant_id=p_tenant_id and d.organization_id=p_organization_id and d.company_id=p_company_id
      and d.period between p_from_period and p_to_period
      and (p_cursor_period is null or (d.period,d.id,d.revision)>(p_cursor_period,p_cursor_id,p_cursor_revision))
    order by d.period,d.id,d.revision limit p_limit+1
  ) q;
  return v_result;
end $$;

revoke all on function public.shared_tax_reporting_fact_append(uuid,uuid,text,text,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.shared_tax_reporting_fact_list(uuid,uuid,text,uuid,date,date,integer,date,text) from public,anon,authenticated;
revoke all on function public.shared_tax_reporting_declaration_save(uuid,uuid,text,text,jsonb,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.shared_tax_reporting_declaration_list(uuid,uuid,text,uuid,text,text,integer,text,text,integer) from public,anon,authenticated;
grant execute on function public.shared_tax_reporting_fact_append(uuid,uuid,text,text,jsonb,uuid,text) to service_role;
grant execute on function public.shared_tax_reporting_fact_list(uuid,uuid,text,uuid,date,date,integer,date,text) to service_role;
grant execute on function public.shared_tax_reporting_declaration_save(uuid,uuid,text,text,jsonb,uuid,text,integer) to service_role;
grant execute on function public.shared_tax_reporting_declaration_list(uuid,uuid,text,uuid,text,text,integer,text,text,integer) to service_role;
commit;

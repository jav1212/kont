-- ADM-017 / ADM-018 / ADM-019: configure reusable document series without
-- allocating a number. Allocation remains owned by a future atomic issuer.

create table public.shared_company_document_series (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  scope_kind text not null check (scope_kind in ('company','branch')),
  branch_id uuid,
  document_type text not null check (document_type in ('sales_invoice','sales_delivery_note','sales_credit_note','sales_debit_note','purchase_invoice','purchase_credit_note','purchase_debit_note')),
  code text not null check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
  prefix text check (prefix is null or (length(btrim(prefix)) between 1 and 32 and prefix !~ '[\r\n]')),
  next_number integer not null check (next_number between 1 and 99999999),
  maximum_number integer not null check (maximum_number between 1 and 99999999 and next_number <= maximum_number),
  active boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete restrict,
  foreign key (branch_id, tenant_id, company_id) references public.shared_company_branches(id, tenant_id, company_id) on delete restrict,
  check ((scope_kind = 'company' and branch_id is null) or (scope_kind = 'branch' and branch_id is not null))
);
create unique index shared_company_document_series_scope_code_uq
  on public.shared_company_document_series(tenant_id, company_id, scope_kind, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), document_type, code);
create unique index shared_company_document_series_scope_identity_uq
  on public.shared_company_document_series(id, tenant_id, organization_id, company_id);
create index shared_company_document_series_organization_idx
  on public.shared_company_document_series(organization_id);
create index shared_company_document_series_branch_scope_fk_idx
  on public.shared_company_document_series(branch_id, tenant_id, company_id);

create table public.shared_company_document_series_selection_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  scope_kind text not null check (scope_kind in ('company','branch')),
  branch_id uuid,
  document_type text not null check (document_type in ('sales_invoice','sales_delivery_note','sales_credit_note','sales_debit_note','purchase_invoice','purchase_credit_note','purchase_debit_note')),
  policy text not null check (policy in ('company_default','branch_default','explicit_series_required')),
  default_series_id uuid,
  version integer not null default 1 check (version >= 1),
  configured_by uuid not null,
  configured_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete restrict,
  foreign key (branch_id, tenant_id, company_id) references public.shared_company_branches(id, tenant_id, company_id) on delete restrict,
  check ((scope_kind = 'company' and branch_id is null) or (scope_kind = 'branch' and branch_id is not null)),
  check ((policy = 'explicit_series_required' and default_series_id is null) or (policy in ('company_default','branch_default') and default_series_id is not null)),
  check (policy <> 'branch_default' or scope_kind = 'branch')
);
-- PostgreSQL unique keys treat NULL as distinct. The expression index makes one company-wide rule durable.
create unique index shared_company_document_series_rule_scope_uq
  on public.shared_company_document_series_selection_rules(tenant_id, company_id, scope_kind, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), document_type);
create index shared_company_document_series_rules_organization_idx
  on public.shared_company_document_series_selection_rules(organization_id);
create index shared_company_document_series_rules_branch_scope_fk_idx
  on public.shared_company_document_series_selection_rules(branch_id, tenant_id, company_id);

create table public.shared_company_document_series_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null,
  operation text not null check (operation in ('create_series','configure_selection_rule')),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 128),
  intent jsonb not null,
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (organization_id, actor_user_id, operation, idempotency_key)
);
create index shared_company_document_series_requests_tenant_idx
  on public.shared_company_document_series_requests(tenant_id);
create table public.shared_company_document_series_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  series_id uuid,
  request_id uuid not null references public.shared_company_document_series_requests(id) on delete restrict,
  actor_user_id uuid not null,
  action text not null check (action in ('created','selection_rule_configured')),
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (series_id, tenant_id, organization_id, company_id)
    references public.shared_company_document_series(id, tenant_id, organization_id, company_id) on delete restrict,
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id) on delete restrict
);
create index shared_company_document_series_events_org_idx
  on public.shared_company_document_series_events(organization_id, occurred_at desc);
create index shared_company_document_series_events_request_idx
  on public.shared_company_document_series_events(request_id);
create index shared_company_document_series_events_tenant_company_idx
  on public.shared_company_document_series_events(tenant_id, company_id);
create index shared_company_document_series_events_series_scope_idx
  on public.shared_company_document_series_events(series_id, tenant_id, organization_id, company_id);

alter table public.shared_company_document_series enable row level security;
alter table public.shared_company_document_series_selection_rules enable row level security;
alter table public.shared_company_document_series_requests enable row level security;
alter table public.shared_company_document_series_events enable row level security;
revoke all on public.shared_company_document_series, public.shared_company_document_series_selection_rules,
  public.shared_company_document_series_requests, public.shared_company_document_series_events
  from public, anon, authenticated, service_role;

create or replace function public.prevent_company_document_series_event_mutation()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'COMPANY_DOCUMENT_SERIES_EVENT_IMMUTABLE'; end;
$$;
create trigger shared_company_document_series_events_immutable
before update or delete or truncate on public.shared_company_document_series_events
for each statement execute function public.prevent_company_document_series_event_mutation();
revoke all on function public.prevent_company_document_series_event_mutation() from public, anon, authenticated, service_role;

create or replace function public.company_document_series_scope_valid(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_scope_kind text, p_branch_id uuid
) returns boolean language sql stable set search_path=public as $$
  select p_scope_kind = 'company' and p_branch_id is null
    or (p_scope_kind = 'branch' and p_branch_id is not null and exists (
      select 1 from public.shared_company_branches b
      where b.id = p_branch_id and b.tenant_id = p_tenant_id and b.organization_id = p_organization_id and b.company_id = p_company_id
    ))
$$;

create or replace function public.company_document_series_snapshot(p_series public.shared_company_document_series)
returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object('id', p_series.id, 'scope', case when p_series.scope_kind = 'branch'
    then jsonb_build_object('kind','branch','organizationId',p_series.organization_id,'companyId',p_series.company_id,'branchId',p_series.branch_id)
    else jsonb_build_object('kind','company','organizationId',p_series.organization_id,'companyId',p_series.company_id) end,
    'documentType',p_series.document_type,'code',p_series.code,'prefix',p_series.prefix,
    'nextNumber',p_series.next_number,'maximumNumber',p_series.maximum_number,'active',p_series.active,'version',p_series.version)
$$;

create or replace function public.company_document_series_rule_snapshot(p_rule public.shared_company_document_series_selection_rules)
returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object('scope', case when p_rule.scope_kind = 'branch'
    then jsonb_build_object('kind','branch','organizationId',p_rule.organization_id,'companyId',p_rule.company_id,'branchId',p_rule.branch_id)
    else jsonb_build_object('kind','company','organizationId',p_rule.organization_id,'companyId',p_rule.company_id) end,
    'documentType',p_rule.document_type,'policy',p_rule.policy,'defaultSeriesId',p_rule.default_series_id,'version',p_rule.version)
$$;

create or replace function public.create_native_company_document_series(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_idempotency_key text,
  p_scope_kind text, p_branch_id uuid, p_document_type text, p_code text, p_prefix text,
  p_next_number integer, p_maximum_number integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_company public.shared_companies%rowtype; v_request public.shared_company_document_series_requests%rowtype;
  v_series public.shared_company_document_series%rowtype; v_intent jsonb; v_hash text; v_result jsonb;
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'companies.update');
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 128
    or p_scope_kind not in ('company','branch') or p_document_type not in ('sales_invoice','sales_delivery_note','sales_credit_note','sales_debit_note','purchase_invoice','purchase_credit_note','purchase_debit_note')
    or p_code is null or upper(btrim(p_code)) !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'
    or p_prefix is not null and (length(btrim(p_prefix)) not between 1 and 32 or p_prefix ~ '[\r\n]')
    or p_next_number is null or p_next_number not between 1 and 99999999 or p_maximum_number is null or p_maximum_number not between p_next_number and 99999999
    or public.company_document_series_scope_valid(v_tenant,p_organization_id,p_company_id,p_scope_kind,p_branch_id) is distinct from true
  then raise exception 'COMPANY_DOCUMENT_SERIES_INVALID'; end if;
  select * into v_company from public.shared_companies where tenant_id=v_tenant and organization_id=p_organization_id and id=p_company_id for share;
  if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
  if v_company.status <> 'active' then raise exception 'COMPANY_NOT_OPERATIONAL'; end if;
  v_intent := jsonb_build_object('companyId',p_company_id,'scopeKind',p_scope_kind,'branchId',p_branch_id,'documentType',p_document_type,
    'code',upper(btrim(p_code)),'prefix',nullif(btrim(p_prefix),''),'nextNumber',p_next_number,'maximumNumber',p_maximum_number);
  v_hash := encode(extensions.digest(v_intent::text,'sha256'),'hex');
  insert into public.shared_company_document_series_requests(tenant_id,organization_id,actor_user_id,operation,idempotency_key,intent,intent_sha256)
    values(v_tenant,p_organization_id,p_actor_user_id,'create_series',btrim(p_idempotency_key),v_intent,v_hash) on conflict do nothing;
  select * into v_request from public.shared_company_document_series_requests
    where organization_id=p_organization_id and actor_user_id=p_actor_user_id and operation='create_series' and idempotency_key=btrim(p_idempotency_key) for update;
  if v_request.intent_sha256 <> v_hash or v_request.intent is distinct from v_intent then raise exception 'COMPANY_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT'; end if;
  if v_request.result is not null then return v_request.result; end if;
  begin
    insert into public.shared_company_document_series(tenant_id,organization_id,company_id,scope_kind,branch_id,document_type,code,prefix,next_number,maximum_number,created_by,updated_by)
      values(v_tenant,p_organization_id,p_company_id,p_scope_kind,p_branch_id,p_document_type,upper(btrim(p_code)),nullif(btrim(p_prefix),''),p_next_number,p_maximum_number,p_actor_user_id,p_actor_user_id)
      returning * into v_series;
  exception when unique_violation then raise exception 'COMPANY_DOCUMENT_SERIES_INVALID'; end;
  v_result := public.company_document_series_snapshot(v_series);
  update public.shared_company_document_series_requests set result=v_result where id=v_request.id;
  insert into public.shared_company_document_series_events(tenant_id,organization_id,company_id,series_id,request_id,actor_user_id,action)
    values(v_tenant,p_organization_id,p_company_id,v_series.id,v_request.id,p_actor_user_id,'created');
  return v_result;
end;
$$;

create or replace function public.list_native_company_document_series(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_scope_kind text, p_branch_id uuid, p_document_type text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_result jsonb;
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'companies.read');
  if p_scope_kind not in ('company','branch') or p_document_type is not null and p_document_type not in ('sales_invoice','sales_delivery_note','sales_credit_note','sales_debit_note','purchase_invoice','purchase_credit_note','purchase_debit_note')
    or public.company_document_series_scope_valid(v_tenant,p_organization_id,p_company_id,p_scope_kind,p_branch_id) is distinct from true
  then raise exception 'COMPANY_DOCUMENT_SERIES_INVALID'; end if;
  select coalesce(jsonb_agg(public.company_document_series_snapshot(s) order by s.document_type,s.code), '[]'::jsonb) into v_result
  from public.shared_company_document_series s where s.tenant_id=v_tenant and s.organization_id=p_organization_id and s.company_id=p_company_id
    and s.scope_kind=p_scope_kind and s.branch_id is not distinct from p_branch_id and (p_document_type is null or s.document_type=p_document_type);
  return v_result;
end;
$$;

create or replace function public.configure_native_company_document_series_selection_rule(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text, p_idempotency_key text,
  p_scope_kind text, p_branch_id uuid, p_document_type text, p_expected_version integer, p_policy text, p_default_series_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_company public.shared_companies%rowtype; v_request public.shared_company_document_series_requests%rowtype;
  v_rule public.shared_company_document_series_selection_rules%rowtype; v_series public.shared_company_document_series%rowtype;
  v_intent jsonb; v_hash text; v_result jsonb;
begin
  v_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,p_company_id,'companies.update');
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 128 or p_scope_kind not in ('company','branch')
    or p_document_type not in ('sales_invoice','sales_delivery_note','sales_credit_note','sales_debit_note','purchase_invoice','purchase_credit_note','purchase_debit_note')
    or p_expected_version is null or p_expected_version < 0 or p_policy not in ('company_default','branch_default','explicit_series_required')
    or (p_policy='explicit_series_required' and p_default_series_id is not null) or (p_policy in ('company_default','branch_default') and p_default_series_id is null)
    or (p_policy='branch_default' and p_scope_kind <> 'branch')
    or public.company_document_series_scope_valid(v_tenant,p_organization_id,p_company_id,p_scope_kind,p_branch_id) is distinct from true
  then raise exception 'COMPANY_DOCUMENT_SERIES_SELECTION_INVALID'; end if;
  select * into v_company from public.shared_companies where tenant_id=v_tenant and organization_id=p_organization_id and id=p_company_id for share;
  if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
  if v_company.status <> 'active' then raise exception 'COMPANY_NOT_OPERATIONAL'; end if;
  if p_default_series_id is not null then
    select * into v_series from public.shared_company_document_series where id=p_default_series_id and tenant_id=v_tenant and organization_id=p_organization_id
      and company_id=p_company_id and document_type=p_document_type and active=true
      and ((p_policy='company_default' and scope_kind='company' and branch_id is null)
        or (p_policy='branch_default' and scope_kind='branch' and branch_id is not distinct from p_branch_id)) for share;
    if not found then raise exception 'COMPANY_DOCUMENT_SERIES_NOT_FOUND'; end if;
  end if;
  v_intent := jsonb_build_object('companyId',p_company_id,'scopeKind',p_scope_kind,'branchId',p_branch_id,'documentType',p_document_type,
    'expectedVersion',p_expected_version,'policy',p_policy,'defaultSeriesId',p_default_series_id);
  v_hash := encode(extensions.digest(v_intent::text,'sha256'),'hex');
  insert into public.shared_company_document_series_requests(tenant_id,organization_id,actor_user_id,operation,idempotency_key,intent,intent_sha256)
    values(v_tenant,p_organization_id,p_actor_user_id,'configure_selection_rule',btrim(p_idempotency_key),v_intent,v_hash) on conflict do nothing;
  select * into v_request from public.shared_company_document_series_requests
    where organization_id=p_organization_id and actor_user_id=p_actor_user_id and operation='configure_selection_rule' and idempotency_key=btrim(p_idempotency_key) for update;
  if v_request.intent_sha256 <> v_hash or v_request.intent is distinct from v_intent then raise exception 'COMPANY_DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT'; end if;
  if v_request.result is not null then return v_request.result; end if;
  select * into v_rule from public.shared_company_document_series_selection_rules
    where tenant_id=v_tenant and company_id=p_company_id and scope_kind=p_scope_kind and branch_id is not distinct from p_branch_id and document_type=p_document_type for update;
  if found and v_rule.version <> p_expected_version then raise exception 'COMPANY_DOCUMENT_SERIES_VERSION_CONFLICT'; end if;
  if not found and p_expected_version <> 0 then raise exception 'COMPANY_DOCUMENT_SERIES_VERSION_CONFLICT'; end if;
  if found then
    update public.shared_company_document_series_selection_rules set policy=p_policy, default_series_id=p_default_series_id,
      version=v_rule.version+1, configured_by=p_actor_user_id, configured_at=clock_timestamp()
      where tenant_id=v_tenant and company_id=p_company_id and scope_kind=p_scope_kind and branch_id is not distinct from p_branch_id and document_type=p_document_type returning * into v_rule;
  else
    begin
      insert into public.shared_company_document_series_selection_rules(tenant_id,organization_id,company_id,scope_kind,branch_id,document_type,policy,default_series_id,configured_by)
        values(v_tenant,p_organization_id,p_company_id,p_scope_kind,p_branch_id,p_document_type,p_policy,p_default_series_id,p_actor_user_id) returning * into v_rule;
    exception when unique_violation then
      raise exception 'COMPANY_DOCUMENT_SERIES_VERSION_CONFLICT';
    end;
  end if;
  v_result := public.company_document_series_rule_snapshot(v_rule);
  update public.shared_company_document_series_requests set result=v_result where id=v_request.id;
  insert into public.shared_company_document_series_events(tenant_id,organization_id,company_id,series_id,request_id,actor_user_id,action)
    values(v_tenant,p_organization_id,p_company_id,p_default_series_id,v_request.id,p_actor_user_id,'selection_rule_configured');
  return v_result;
end;
$$;

revoke all on function public.company_document_series_scope_valid(uuid,uuid,text,text,uuid),
  public.company_document_series_snapshot(public.shared_company_document_series),
  public.company_document_series_rule_snapshot(public.shared_company_document_series_selection_rules)
  from public, anon, authenticated, service_role;
revoke all on function public.create_native_company_document_series(uuid,uuid,text,text,text,uuid,text,text,text,integer,integer),
  public.list_native_company_document_series(uuid,uuid,text,text,uuid,text),
  public.configure_native_company_document_series_selection_rule(uuid,uuid,text,text,text,uuid,text,integer,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.create_native_company_document_series(uuid,uuid,text,text,text,uuid,text,text,text,integer,integer),
  public.list_native_company_document_series(uuid,uuid,text,text,uuid,text),
  public.configure_native_company_document_series_selection_rule(uuid,uuid,text,text,text,uuid,text,integer,text,uuid)
  to service_role;

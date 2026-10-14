begin;

-- A supplier invoice match is durable purchasing evidence. Confirmation and
-- its immutable VAT fact share one transaction and one idempotency command.
create table if not exists public.shared_supplier_invoice_matches (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id text not null,
  id text not null,
  supplier_id text not null,
  fiscal_document_id text not null,
  match_status text not null check (match_status in ('draft', 'confirmed')),
  version integer not null check (version >= 0),
  match_snapshot jsonb not null check (jsonb_typeof(match_snapshot) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  confirmed_by uuid references auth.users(id) on delete restrict,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, company_id, fiscal_document_id),
  foreign key (tenant_id, company_id)
    references public.shared_companies(tenant_id, id) on delete restrict,
  foreign key (tenant_id, fiscal_document_id)
    references public.shared_fiscal_documents(tenant_id, id) on delete restrict,
  foreign key (tenant_id, supplier_id)
    references public.shared_inventory_suppliers(tenant_id, id) on delete restrict,
  check (match_snapshot->>'id' = id),
  check (match_snapshot->>'companyId' = company_id),
  check (match_snapshot->>'supplierId' = supplier_id),
  check (match_snapshot->>'fiscalDocumentId' = fiscal_document_id),
  check (match_snapshot->>'status' = match_status),
  check ((match_status = 'draft' and confirmed_at is null and confirmed_by is null)
      or (match_status = 'confirmed' and confirmed_at is not null and confirmed_by is not null))
);
create index if not exists shared_supplier_invoice_matches_scope_idx
  on public.shared_supplier_invoice_matches(tenant_id, organization_id, company_id, updated_at desc, id);

create table if not exists public.shared_supplier_invoice_match_commands (
  tenant_id uuid not null,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 128),
  match_id text not null,
  fact_id text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  match_snapshot jsonb not null,
  fact_snapshot jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (tenant_id, idempotency_key),
  foreign key (tenant_id, match_id) references public.shared_supplier_invoice_matches(tenant_id, id) on delete restrict,
  foreign key (tenant_id, fact_id) references public.shared_tax_reporting_facts(tenant_id, id) on delete restrict
);

alter table public.shared_supplier_invoice_matches enable row level security;
alter table public.shared_supplier_invoice_match_commands enable row level security;
revoke all on public.shared_supplier_invoice_matches, public.shared_supplier_invoice_match_commands from public, anon, authenticated, service_role;

create or replace function public.shared_supplier_find_for_invoice_match(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_supplier_id text, p_actor_id uuid
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_supplier jsonb;
begin
  if p_actor_id is null or not exists (
    select 1 from public.shared_companies c where c.tenant_id=p_tenant_id and c.organization_id=p_organization_id and c.id=p_company_id
  ) then raise exception 'PURCHASE_INVOICE_MATCH_INVALID'; end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_actor_id and m.status='active')
    and not exists (select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='purchases') then
    raise exception 'PURCHASE_INVOICE_MATCH_INVALID';
  end if;
  select jsonb_build_object('id',s.id,'company_id',s.company_id,'name',s.name,'rif',s.rif,'active',s.active)
    into v_supplier from public.shared_inventory_suppliers s
    where s.tenant_id=p_tenant_id and s.company_id=p_company_id and s.id=p_supplier_id;
  return v_supplier;
end $$;

create or replace function public.shared_supplier_invoice_match_find(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_match_id text, p_actor_id uuid
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_snapshot jsonb;
begin
  if p_actor_id is null or not exists (
    select 1 from public.shared_companies c
    where c.tenant_id=p_tenant_id and c.organization_id=p_organization_id and c.id=p_company_id
  ) then raise exception 'PURCHASE_INVOICE_MATCH_INVALID'; end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_actor_id and m.status='active')
    and not exists (
      select 1 from public.organization_delegation_member_assignments a
      join public.organization_delegations d on d.id=a.delegation_id
      join public.organization_delegation_scopes s on s.delegation_id=d.id
      where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id
        and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='purchases'
    ) then raise exception 'PURCHASE_INVOICE_MATCH_INVALID'; end if;
  select m.match_snapshot into v_snapshot from public.shared_supplier_invoice_matches m
  where m.tenant_id=p_tenant_id and m.organization_id=p_organization_id and m.company_id=p_company_id and m.id=p_match_id;
  return case when v_snapshot is null then null else jsonb_build_object('match_snapshot',v_snapshot) end;
end $$;

create or replace function public.shared_supplier_invoice_match_save_draft(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_match_snapshot jsonb, p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_match_id text; v_supplier_id text; v_document_id text; v_existing public.shared_supplier_invoice_matches%rowtype;
begin
  v_match_id:=p_match_snapshot->>'id'; v_supplier_id:=p_match_snapshot->>'supplierId'; v_document_id:=p_match_snapshot->>'fiscalDocumentId';
  if p_actor_id is null or p_match_snapshot is null or jsonb_typeof(p_match_snapshot)<>'object'
    or p_match_snapshot->>'companyId' is distinct from p_company_id or p_match_snapshot->>'status'<>'draft'
    or coalesce((p_match_snapshot->>'version')::integer,-1)<>0 or p_match_snapshot->>'confirmedAt' is not null
    or nullif(btrim(v_match_id),'') is null or nullif(btrim(v_supplier_id),'') is null or nullif(btrim(v_document_id),'') is null then
    raise exception 'PURCHASE_INVOICE_MATCH_INVALID';
  end if;
  if not exists (select 1 from public.shared_companies c where c.tenant_id=p_tenant_id and c.organization_id=p_organization_id and c.id=p_company_id)
    or not exists (select 1 from public.shared_inventory_suppliers s where s.tenant_id=p_tenant_id and s.company_id=p_company_id and s.id=v_supplier_id and s.active)
    or not exists (select 1 from public.shared_fiscal_documents d where d.tenant_id=p_tenant_id and d.organization_id=p_organization_id and d.company_id=p_company_id and d.id=v_document_id and d.document_status='received' and d.document_snapshot->>'direction'='received' and d.document_snapshot->>'type'='invoice') then
    raise exception 'PURCHASE_INVOICE_MATCH_INVALID';
  end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_actor_id and m.status='active')
    and not exists (select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='purchases') then
    raise exception 'PURCHASE_INVOICE_MATCH_INVALID';
  end if;
  select * into v_existing from public.shared_supplier_invoice_matches where tenant_id=p_tenant_id and id=v_match_id for update;
  if found then
    if v_existing.organization_id=p_organization_id and v_existing.company_id=p_company_id and v_existing.created_by=p_actor_id and v_existing.match_status='draft' and v_existing.match_snapshot=p_match_snapshot then
      return jsonb_build_object('match_snapshot',v_existing.match_snapshot,'replayed',true);
    end if;
    raise exception 'PURCHASE_INVOICE_MATCH_CONFLICT';
  end if;
  insert into public.shared_supplier_invoice_matches(tenant_id,organization_id,company_id,id,supplier_id,fiscal_document_id,match_status,version,match_snapshot,created_by)
  values(p_tenant_id,p_organization_id,p_company_id,v_match_id,v_supplier_id,v_document_id,'draft',0,p_match_snapshot,p_actor_id);
  return jsonb_build_object('match_snapshot',p_match_snapshot,'replayed',false);
exception when unique_violation then raise exception 'PURCHASE_INVOICE_MATCH_CONFLICT';
end $$;

create or replace function public.shared_supplier_invoice_match_confirm_with_tax_fact(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_match_snapshot jsonb,
  p_fact_snapshot jsonb, p_actor_id uuid, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_match_id text; v_fact_id text; v_document_id text; v_existing public.shared_supplier_invoice_match_commands%rowtype;
  v_match public.shared_supplier_invoice_matches%rowtype; v_fact public.shared_tax_reporting_facts%rowtype; v_match_found boolean;
begin
  v_match_id:=p_match_snapshot->>'id'; v_fact_id:=p_fact_snapshot->>'id'; v_document_id:=p_match_snapshot->>'fiscalDocumentId';
  if p_actor_id is null or nullif(btrim(p_idempotency_key),'') is null or length(p_idempotency_key)>128
    or p_match_snapshot is null or jsonb_typeof(p_match_snapshot)<>'object'
    or p_fact_snapshot is null or jsonb_typeof(p_fact_snapshot)<>'object'
    or p_match_snapshot->>'status'<>'confirmed' or p_match_snapshot->>'companyId' is distinct from p_company_id
    or p_fact_snapshot->'scope'->>'tenantId' is distinct from p_tenant_id::text
    or p_fact_snapshot->'scope'->>'organizationId' is distinct from p_organization_id::text
    or p_fact_snapshot->'scope'->>'companyId' is distinct from p_company_id
    or p_fact_snapshot->>'direction'<>'purchase' or p_fact_snapshot->>'id' is distinct from v_fact_id
    or p_fact_snapshot->'source'->>'kind'<>'fiscal_document' or p_fact_snapshot->'source'->>'id' is distinct from v_document_id then
    raise exception 'PURCHASE_INVOICE_MATCH_INVALID';
  end if;
  if nullif(btrim(v_fact_id),'') is null
    or nullif(btrim(p_fact_snapshot->'source'->>'lineageKey'),'') is null
    or p_fact_snapshot->>'recognitionDate' is null
    or p_fact_snapshot->>'recognitionDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_fact_snapshot->>'period' is null
    or p_fact_snapshot->>'period' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or left(p_fact_snapshot->>'recognitionDate',7) is distinct from p_fact_snapshot->>'period' then
    raise exception 'PURCHASE_INVOICE_MATCH_INVALID';
  end if;
  if not exists (select 1 from public.shared_companies c where c.tenant_id=p_tenant_id and c.organization_id=p_organization_id and c.id=p_company_id)
    or not exists (select 1 from public.shared_inventory_suppliers s where s.tenant_id=p_tenant_id and s.company_id=p_company_id and s.id=p_match_snapshot->>'supplierId' and s.active)
    or not exists (select 1 from public.shared_fiscal_documents d where d.tenant_id=p_tenant_id and d.organization_id=p_organization_id and d.company_id=p_company_id and d.id=v_document_id and d.document_status='received' and d.document_snapshot->>'direction'='received' and d.document_snapshot->>'type'='invoice') then
    raise exception 'PURCHASE_INVOICE_MATCH_INVALID';
  end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_actor_id and m.status='active')
    and not exists (select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='purchases') then
    raise exception 'PURCHASE_INVOICE_MATCH_INVALID';
  end if;

  select * into v_existing from public.shared_supplier_invoice_match_commands where tenant_id=p_tenant_id and idempotency_key=btrim(p_idempotency_key) for update;
  if found then
    if v_existing.match_id=v_match_id and v_existing.fact_id=v_fact_id and v_existing.actor_id=p_actor_id and v_existing.match_snapshot=p_match_snapshot and v_existing.fact_snapshot=p_fact_snapshot then
      return jsonb_build_object('match_snapshot',v_existing.match_snapshot,'fact_snapshot',v_existing.fact_snapshot,'replayed',true);
    end if;
    raise exception 'PURCHASE_INVOICE_MATCH_IDEMPOTENCY_CONFLICT';
  end if;

  select * into v_match from public.shared_supplier_invoice_matches where tenant_id=p_tenant_id and organization_id=p_organization_id and company_id=p_company_id and id=v_match_id for update;
  v_match_found:=found;
  -- A concurrent retry can have waited on the match row after its first command
  -- lookup. Re-read the idempotency record after the row lock before CAS checks.
  select * into v_existing from public.shared_supplier_invoice_match_commands where tenant_id=p_tenant_id and idempotency_key=btrim(p_idempotency_key) for update;
  if found then
    if v_existing.match_id=v_match_id and v_existing.fact_id=v_fact_id and v_existing.actor_id=p_actor_id and v_existing.match_snapshot=p_match_snapshot and v_existing.fact_snapshot=p_fact_snapshot then
      return jsonb_build_object('match_snapshot',v_existing.match_snapshot,'fact_snapshot',v_existing.fact_snapshot,'replayed',true);
    end if;
    raise exception 'PURCHASE_INVOICE_MATCH_IDEMPOTENCY_CONFLICT';
  end if;
  if not v_match_found or v_match.match_status<>'draft' or (p_match_snapshot->>'version')::integer<>v_match.version+1
    or p_match_snapshot->>'fiscalDocumentId' is distinct from v_match.fiscal_document_id
    or p_match_snapshot->>'supplierId' is distinct from v_match.supplier_id then raise exception 'PURCHASE_INVOICE_MATCH_CONFLICT'; end if;
  if not exists (select 1 from public.shared_tax_reporting_facts where tenant_id=p_tenant_id and company_id=p_company_id and lineage_key=p_fact_snapshot->'source'->>'lineageKey') then
    insert into public.shared_tax_reporting_facts(tenant_id,organization_id,company_id,id,source_kind,source_id,lineage_key,recognition_date,period,fact_snapshot,recorded_by)
    values(p_tenant_id,p_organization_id,p_company_id,v_fact_id,p_fact_snapshot->'source'->>'kind',p_fact_snapshot->'source'->>'id',p_fact_snapshot->'source'->>'lineageKey',(p_fact_snapshot->>'recognitionDate')::date,p_fact_snapshot->>'period',p_fact_snapshot,p_actor_id)
    returning * into v_fact;
  else raise exception 'PURCHASE_INVOICE_MATCH_CONFLICT'; end if;
  update public.shared_supplier_invoice_matches
  set match_status='confirmed',version=(p_match_snapshot->>'version')::integer,match_snapshot=p_match_snapshot,
      confirmed_by=p_actor_id,confirmed_at=(p_match_snapshot->>'confirmedAt')::timestamptz,updated_at=now()
  where tenant_id=p_tenant_id and id=v_match_id;
  insert into public.shared_supplier_invoice_match_commands(tenant_id,idempotency_key,match_id,fact_id,actor_id,match_snapshot,fact_snapshot)
  values(p_tenant_id,btrim(p_idempotency_key),v_match_id,v_fact_id,p_actor_id,p_match_snapshot,p_fact_snapshot);
  return jsonb_build_object('match_snapshot',p_match_snapshot,'fact_snapshot',v_fact.fact_snapshot,'replayed',false);
exception
  when invalid_datetime_format or datetime_field_overflow then raise exception 'PURCHASE_INVOICE_MATCH_INVALID';
  when unique_violation then raise exception 'PURCHASE_INVOICE_MATCH_CONFLICT';
end $$;

revoke all on function public.shared_supplier_invoice_match_find(uuid,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.shared_supplier_find_for_invoice_match(uuid,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.shared_supplier_invoice_match_save_draft(uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.shared_supplier_invoice_match_confirm_with_tax_fact(uuid,uuid,text,jsonb,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.shared_supplier_invoice_match_find(uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.shared_supplier_find_for_invoice_match(uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.shared_supplier_invoice_match_save_draft(uuid,uuid,text,jsonb,uuid) to service_role;
grant execute on function public.shared_supplier_invoice_match_confirm_with_tax_fact(uuid,uuid,text,jsonb,jsonb,uuid,text) to service_role;

commit;

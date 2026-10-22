-- ADM-015: immutable, once-only paired physical compensation of a posted transfer.
-- This is a new reverse-direction transfer at current source average cost, not
-- retroactive deletion or an exact accounting cancellation of historical cost.

create table public.shared_cross_company_inventory_compensations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null,
  original_transfer_id text not null,
  compensation_transfer_id text not null,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 128),
  intent jsonb not null,
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id,original_transfer_id),
  unique (tenant_id,compensation_transfer_id),
  unique (organization_id,actor_user_id,idempotency_key),
  check (original_transfer_id<>compensation_transfer_id),
  foreign key (tenant_id,original_transfer_id)
    references public.shared_cross_company_inventory_transfers(tenant_id,id) on delete restrict,
  foreign key (tenant_id,compensation_transfer_id)
    references public.shared_cross_company_inventory_transfers(tenant_id,id) on delete restrict
);
create index shared_cross_company_inventory_compensations_org_idx
  on public.shared_cross_company_inventory_compensations(organization_id,created_at desc);
alter table public.shared_cross_company_inventory_compensations enable row level security;
revoke all on public.shared_cross_company_inventory_compensations from public,anon,authenticated,service_role;
create trigger shared_cross_company_inventory_compensations_immutable
before update or delete or truncate on public.shared_cross_company_inventory_compensations
for each statement execute function public.prevent_cross_company_inventory_transfer_mutation();

create function public.native_cross_company_compensation_lines(p_lines jsonb)
returns jsonb language sql immutable set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'sourceProductId',l->>'destinationProductId',
    'destinationProductId',l->>'sourceProductId',
    'quantity',l->>'quantity','unit',l->>'unit')
    order by l->>'destinationProductId',l->>'sourceProductId'),'[]'::jsonb)
  from jsonb_array_elements(p_lines) l
$$;
revoke all on function public.native_cross_company_compensation_lines(jsonb)
  from public,anon,authenticated,service_role;

create function public.preview_native_cross_company_inventory_compensation(
  p_actor_user_id uuid,p_organization_id uuid,p_original_transfer_id text,p_effective_date date
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_original public.shared_cross_company_inventory_transfers%rowtype;
  v_lines jsonb; v_preview jsonb; v_source_tenant uuid; v_destination_tenant uuid;
begin
  if p_original_transfer_id is null or length(btrim(p_original_transfer_id)) not between 1 and 128
    or p_effective_date is null then raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_INVALID'; end if;
  select * into v_original from public.shared_cross_company_inventory_transfers
    where organization_id=p_organization_id and id=btrim(p_original_transfer_id);
  if not found then raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_NOT_FOUND'; end if;
  v_source_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,
    v_original.destination_company_id,'inventory.read');
  perform public.assert_user_security_access(p_actor_user_id,p_organization_id,
    v_original.destination_company_id,'inventory.update');
  v_destination_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,
    v_original.source_company_id,'inventory.update');
  if v_source_tenant is distinct from v_original.tenant_id
    or v_destination_tenant is distinct from v_original.tenant_id
    or p_effective_date<v_original.effective_date
    or exists(select 1 from public.shared_cross_company_inventory_compensations c
      where c.tenant_id=v_original.tenant_id and c.compensation_transfer_id=v_original.id)
    then raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_INVALID'; end if;
  if exists(select 1 from public.shared_cross_company_inventory_compensations c
    where c.tenant_id=v_original.tenant_id and c.original_transfer_id=v_original.id)
    then raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_ALREADY_COMPENSATED'; end if;
  v_lines := public.native_cross_company_compensation_lines(v_original.intent->'lines');
  v_preview := public.preview_native_cross_company_inventory_transfer(p_actor_user_id,p_organization_id,
    v_original.destination_company_id,v_original.source_company_id,p_effective_date,v_lines);
  return jsonb_build_object('originalTransferId',v_original.id,
    'sourceCompanyId',v_original.destination_company_id,'destinationCompanyId',v_original.source_company_id,
    'effectiveDate',p_effective_date,'lines',v_lines,
    'sourceSnapshotToken',v_preview->>'sourceSnapshotToken',
    'destinationSnapshotToken',v_preview->>'destinationSnapshotToken');
end;
$$;
revoke all on function public.preview_native_cross_company_inventory_compensation(uuid,uuid,text,date)
  from public,anon,authenticated,service_role;
grant execute on function public.preview_native_cross_company_inventory_compensation(uuid,uuid,text,date)
  to service_role;

create function public.execute_native_cross_company_inventory_compensation(
  p_actor_user_id uuid,p_organization_id uuid,p_original_transfer_id text,p_effective_date date,
  p_compensation_transfer_id text,p_idempotency_key text,p_reason text,
  p_expected_source_snapshot_token text,p_expected_destination_snapshot_token text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_original public.shared_cross_company_inventory_transfers%rowtype;
  v_existing public.shared_cross_company_inventory_compensations%rowtype;
  v_compensation public.shared_cross_company_inventory_transfers%rowtype;
  v_source_tenant uuid; v_destination_tenant uuid;
  v_lines jsonb; v_intent jsonb; v_hash text; v_result jsonb;
begin
  if p_original_transfer_id is null or length(btrim(p_original_transfer_id)) not between 1 and 128
    or p_compensation_transfer_id is null or length(btrim(p_compensation_transfer_id)) not between 1 and 128
    or btrim(p_compensation_transfer_id)=btrim(p_original_transfer_id)
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 128
    or p_reason is null or length(btrim(p_reason)) not between 1 and 500
    or p_effective_date is null
    or p_expected_source_snapshot_token is null or p_expected_source_snapshot_token !~ '^[0-9a-f]{64}$'
    or p_expected_destination_snapshot_token is null or p_expected_destination_snapshot_token !~ '^[0-9a-f]{64}$'
    then raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_INVALID'; end if;
  select * into v_original from public.shared_cross_company_inventory_transfers
    where organization_id=p_organization_id and id=btrim(p_original_transfer_id) for update;
  if not found then raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_NOT_FOUND'; end if;
  v_source_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,
    v_original.destination_company_id,'inventory.read');
  perform public.assert_user_security_access(p_actor_user_id,p_organization_id,
    v_original.destination_company_id,'inventory.update');
  v_destination_tenant := public.assert_user_security_access(p_actor_user_id,p_organization_id,
    v_original.source_company_id,'inventory.update');
  if v_source_tenant is distinct from v_original.tenant_id
    or v_destination_tenant is distinct from v_original.tenant_id
    or p_effective_date<v_original.effective_date
    or exists(select 1 from public.shared_cross_company_inventory_compensations c
      where c.tenant_id=v_original.tenant_id and c.compensation_transfer_id=v_original.id)
    then raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_INVALID'; end if;
  v_intent := jsonb_build_object('originalTransferId',v_original.id,
    'compensationTransferId',btrim(p_compensation_transfer_id),
    'effectiveDate',p_effective_date,'reason',btrim(p_reason),
    'sourceSnapshotToken',p_expected_source_snapshot_token,
    'destinationSnapshotToken',p_expected_destination_snapshot_token);
  v_hash := encode(extensions.digest(v_intent::text,'sha256'),'hex');
  select * into v_existing from public.shared_cross_company_inventory_compensations
    where tenant_id=v_original.tenant_id and original_transfer_id=v_original.id for update;
  if found then
    if v_existing.organization_id<>p_organization_id or v_existing.actor_user_id<>p_actor_user_id
      or v_existing.idempotency_key<>btrim(p_idempotency_key)
      or v_existing.intent_sha256<>v_hash or v_existing.intent is distinct from v_intent
      then raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_ALREADY_COMPENSATED'; end if;
    select * into v_compensation from public.shared_cross_company_inventory_transfers
      where tenant_id=v_original.tenant_id and id=v_existing.compensation_transfer_id;
    if not found then raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_NOT_FOUND'; end if;
    return jsonb_build_object('originalTransferId',v_original.id,
      'compensationTransferId',v_compensation.id,
      'sourceCompanyId',v_compensation.source_company_id,
      'destinationCompanyId',v_compensation.destination_company_id,
      'sourceOperationId',v_compensation.source_operation_id,
      'destinationOperationId',v_compensation.destination_operation_id,'replayed',true);
  end if;
  if exists(select 1 from public.shared_cross_company_inventory_compensations c
    where c.organization_id=p_organization_id and c.actor_user_id=p_actor_user_id
      and c.idempotency_key=btrim(p_idempotency_key))
    then raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_IDEMPOTENCY_CONFLICT'; end if;
  v_lines := public.native_cross_company_compensation_lines(v_original.intent->'lines');
  v_result := public.execute_native_cross_company_inventory_transfer(p_actor_user_id,p_organization_id,
    v_original.destination_company_id,v_original.source_company_id,p_effective_date,v_lines,
    btrim(p_compensation_transfer_id),v_original.correlation_id,btrim(p_idempotency_key),
    'Compensación de '||v_original.id,btrim(p_reason),
    p_expected_source_snapshot_token,p_expected_destination_snapshot_token);
  if v_result->>'replayed'<>'false' then
    raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_IDEMPOTENCY_CONFLICT';
  end if;
  begin
    insert into public.shared_cross_company_inventory_compensations(tenant_id,organization_id,
      actor_user_id,original_transfer_id,compensation_transfer_id,idempotency_key,intent,intent_sha256,reason)
    values(v_original.tenant_id,p_organization_id,p_actor_user_id,v_original.id,btrim(p_compensation_transfer_id),
      btrim(p_idempotency_key),v_intent,v_hash,btrim(p_reason));
  exception when unique_violation then
    raise exception 'INVENTORY_CROSS_COMPANY_COMPENSATION_IDEMPOTENCY_CONFLICT';
  end;
  return jsonb_build_object('originalTransferId',v_original.id,
    'compensationTransferId',v_result->>'transferId',
    'sourceCompanyId',v_result->>'sourceCompanyId','destinationCompanyId',v_result->>'destinationCompanyId',
    'sourceOperationId',v_result->>'sourceOperationId','destinationOperationId',v_result->>'destinationOperationId',
    'replayed',false);
end;
$$;
revoke all on function public.execute_native_cross_company_inventory_compensation(uuid,uuid,text,date,text,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.execute_native_cross_company_inventory_compensation(uuid,uuid,text,date,text,text,text,text,text)
  to service_role;

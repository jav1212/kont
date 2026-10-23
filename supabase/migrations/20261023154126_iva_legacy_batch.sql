create table if not exists public.shared_tax_reporting_batch_commands (
  tenant_id uuid not null,
  idempotency_key text not null,
  organization_id uuid not null,
  company_id text not null,
  actor_id uuid not null,
  request_snapshot jsonb not null,
  result_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, idempotency_key)
);

alter table public.shared_tax_reporting_batch_commands enable row level security;
revoke all on public.shared_tax_reporting_batch_commands from public, anon, authenticated;
grant select, insert, update, delete on public.shared_tax_reporting_batch_commands to service_role;

create or replace function public.shared_tax_reporting_fact_append_batch(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_actor_id uuid,
  p_batch_idempotency_key text, p_facts jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing public.shared_tax_reporting_batch_commands%rowtype;
  v_item jsonb;
  v_result jsonb := '[]'::jsonb;
  v_saved jsonb;
begin
  if p_tenant_id is null or p_organization_id is null or nullif(btrim(p_company_id),'') is null
    or p_actor_id is null or nullif(btrim(p_batch_idempotency_key),'') is null
    or length(p_batch_idempotency_key)>100 or p_facts is null or jsonb_typeof(p_facts)<>'array' then raise exception 'TAX_REPORTING_INVALID'; end if;
  if jsonb_array_length(p_facts) not between 1 and 100 then raise exception 'TAX_REPORTING_INVALID'; end if;
  if not exists(select 1 from public.shared_companies where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id) then raise exception 'TAX_REPORTING_SCOPE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':vat-fact-batch:'||btrim(p_batch_idempotency_key),0));
  select * into v_existing from public.shared_tax_reporting_batch_commands where tenant_id=p_tenant_id and idempotency_key=btrim(p_batch_idempotency_key) for update;
  if found then
    if v_existing.organization_id=p_organization_id and v_existing.company_id=p_company_id and v_existing.actor_id=p_actor_id and v_existing.request_snapshot=p_facts then
      return jsonb_build_object('facts',v_existing.result_snapshot,'replayed',true);
    end if;
    raise exception 'TAX_REPORTING_IDEMPOTENCY_CONFLICT';
  end if;
  for v_item in select value from jsonb_array_elements(p_facts) loop
    if jsonb_typeof(v_item)<>'object' or nullif(btrim(v_item->>'factId'),'') is null
      or nullif(btrim(v_item->>'idempotencyKey'),'') is null
      or length(v_item->>'idempotencyKey')>128 or jsonb_typeof(v_item->'factSnapshot')<>'object' then raise exception 'TAX_REPORTING_INVALID'; end if;
    v_saved := public.shared_tax_reporting_fact_append(p_tenant_id,p_organization_id,p_company_id,v_item->>'factId',v_item->'factSnapshot',p_actor_id,v_item->>'idempotencyKey');
    v_result := v_result || jsonb_build_array(v_saved->'fact_snapshot');
  end loop;
  insert into public.shared_tax_reporting_batch_commands(tenant_id,idempotency_key,organization_id,company_id,actor_id,request_snapshot,result_snapshot)
  values(p_tenant_id,btrim(p_batch_idempotency_key),p_organization_id,p_company_id,p_actor_id,p_facts,v_result);
  return jsonb_build_object('facts',v_result,'replayed',false);
end $$;

revoke all on function public.shared_tax_reporting_fact_append_batch(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.shared_tax_reporting_fact_append_batch(uuid,uuid,text,uuid,text,jsonb) to service_role;

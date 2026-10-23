-- Explicit company IVA periodicity administration and read-only product tax
-- assignment counts for the fiscal configuration screen. Periodicity is never
-- inferred: it starts NULL and changes only through this audited command.
begin;

create table if not exists public.shared_tax_reporting_periodicity_events (
  tenant_id uuid not null,
  idempotency_key text not null,
  organization_id uuid not null,
  company_id text not null,
  actor_id uuid not null,
  from_periodicity text check (from_periodicity in ('monthly','fortnightly')),
  to_periodicity text not null check (to_periodicity in ('monthly','fortnightly')),
  reason text,
  request_snapshot jsonb not null,
  occurred_at timestamptz not null default now(),
  primary key (tenant_id, idempotency_key),
  foreign key (tenant_id, company_id) references public.shared_companies(tenant_id, id)
);
create index if not exists shared_tax_reporting_periodicity_events_company_idx
  on public.shared_tax_reporting_periodicity_events(tenant_id, company_id, occurred_at desc);
alter table public.shared_tax_reporting_periodicity_events enable row level security;
revoke all on public.shared_tax_reporting_periodicity_events from public, anon, authenticated;
grant select, insert on public.shared_tax_reporting_periodicity_events to service_role;

create or replace function public.shared_tax_reporting_periodicity_read(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_actor_id uuid
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_periodicity text;
begin
  if p_actor_id is null or nullif(btrim(p_company_id),'') is null then raise exception 'TAX_REPORTING_INVALID'; end if;
  perform public.assert_user_security_read_access(p_actor_id, p_organization_id, p_company_id, 'companies.read');
  select iva_periodicity into v_periodicity from public.shared_companies
  where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id;
  if not found then raise exception 'TAX_REPORTING_SCOPE'; end if;
  return jsonb_build_object(
    'periodicity', v_periodicity,
    'persistedPeriods', (select count(*) from public.shared_tax_reporting_periods p where p.tenant_id=p_tenant_id and p.organization_id=p_organization_id and p.company_id=p_company_id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('from',e.from_periodicity,'to',e.to_periodicity,'actorId',e.actor_id,'reason',e.reason,'occurredAt',e.occurred_at) order by e.occurred_at desc)
      from (select * from public.shared_tax_reporting_periodicity_events x where x.tenant_id=p_tenant_id and x.organization_id=p_organization_id and x.company_id=p_company_id order by x.occurred_at desc limit 20) e), '[]'::jsonb)
  );
end $$;

-- A change is allowed while no fiscal period has persisted state; afterwards the
-- period keys already stored would no longer match the configured frequency.
create or replace function public.shared_tax_reporting_periodicity_set(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_actor_id uuid,
  p_periodicity text, p_expected_periodicity text, p_reason text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_current text; v_request jsonb; v_existing public.shared_tax_reporting_periodicity_events%rowtype; v_key text := btrim(p_idempotency_key);
begin
  if p_actor_id is null or nullif(btrim(p_company_id),'') is null or p_periodicity is null or p_periodicity not in ('monthly','fortnightly')
    or (p_expected_periodicity is not null and p_expected_periodicity not in ('monthly','fortnightly'))
    or nullif(v_key,'') is null or length(v_key) > 128 or length(coalesce(p_reason,'')) > 500 then raise exception 'TAX_REPORTING_INVALID'; end if;
  perform public.assert_user_security_access(p_actor_id, p_organization_id, p_company_id, 'companies.update');
  v_request := jsonb_build_object('periodicity',p_periodicity,'expected',p_expected_periodicity,'reason',nullif(btrim(p_reason),''));
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':vat-periodicity:'||v_key,0));
  select * into v_existing from public.shared_tax_reporting_periodicity_events where tenant_id=p_tenant_id and idempotency_key=v_key;
  if found then
    if v_existing.organization_id=p_organization_id and v_existing.company_id=p_company_id and v_existing.actor_id=p_actor_id and v_existing.request_snapshot=v_request then
      return jsonb_build_object('periodicity',v_existing.to_periodicity,'replayed',true);
    end if;
    raise exception 'TAX_REPORTING_IDEMPOTENCY_CONFLICT';
  end if;
  select iva_periodicity into v_current from public.shared_companies
  where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id for update;
  if not found then raise exception 'TAX_REPORTING_SCOPE'; end if;
  if v_current is distinct from p_expected_periodicity then raise exception 'TAX_REPORTING_CONCURRENCY_CONFLICT'; end if;
  if v_current = p_periodicity then raise exception 'TAX_REPORTING_INVALID'; end if;
  if v_current is not null and nullif(btrim(p_reason),'') is null then raise exception 'TAX_REPORTING_INVALID'; end if;
  if v_current is not null and exists(select 1 from public.shared_tax_reporting_periods p where p.tenant_id=p_tenant_id and p.organization_id=p_organization_id and p.company_id=p_company_id) then
    raise exception 'TAX_REPORTING_PERIODICITY_LOCKED';
  end if;
  update public.shared_companies set iva_periodicity=p_periodicity where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id;
  insert into public.shared_tax_reporting_periodicity_events(tenant_id,idempotency_key,organization_id,company_id,actor_id,from_periodicity,to_periodicity,reason,request_snapshot)
  values(p_tenant_id,v_key,p_organization_id,p_company_id,p_actor_id,v_current,p_periodicity,nullif(btrim(p_reason),''),v_request);
  return jsonb_build_object('periodicity',p_periodicity,'replayed',false);
end $$;

-- Counts active products by their IVA assignment effective on a date. Products
-- without an effective assignment, and those whose legacy catalogue type
-- disagrees with the assignment, are reported instead of being classified.
create or replace function public.shared_product_tax_assignment_summary(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_actor_id uuid, p_on date
) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_actor_id is null or p_on is null or nullif(btrim(p_company_id),'') is null then raise exception 'TAXATION_PROFILE_INVALID'; end if;
  perform public.assert_user_security_read_access(p_actor_id, p_organization_id, p_company_id, 'companies.read');
  if not exists(select 1 from public.shared_companies where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id) then
    raise exception 'TAXATION_COMPANY_OUTSIDE_ORGANIZATION';
  end if;
  return (
    with products as (
      select p.id, p.vat_type from public.shared_inventory_products p
      where p.tenant_id=p_tenant_id and p.company_id=p_company_id and p.active
    ), effective as (
      select pr.product_id, a.treatment, a.tax_category
      from public.shared_product_tax_profiles pr
      join public.shared_product_tax_assignments a on a.tenant_id=pr.tenant_id and a.profile_id=pr.id
      where pr.tenant_id=p_tenant_id and pr.company_id=p_company_id and a.tax_code='IVA'
        and a.effective_from<=p_on and (a.effective_to is null or a.effective_to>=p_on)
    ), joined as (
      select p.id, p.vat_type, e.treatment, e.tax_category from products p left join effective e on e.product_id=p.id
    )
    select jsonb_build_object(
      'on', p_on,
      'activeProducts', (select count(*) from products),
      'unassigned', (select count(*) from joined where treatment is null),
      'legacyMismatch', (select count(*) from joined where (treatment='exempt' and vat_type is distinct from 'exento') or (treatment='taxed' and vat_type='exento')),
      'groups', coalesce((select jsonb_agg(jsonb_build_object('treatment',g.treatment,'category',g.tax_category,'products',g.n) order by g.n desc, g.treatment)
        from (select treatment, tax_category, count(*) n from joined where treatment is not null group by treatment, tax_category) g), '[]'::jsonb)
    )
  );
end $$;

revoke all on function public.shared_tax_reporting_periodicity_read(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.shared_tax_reporting_periodicity_set(uuid,uuid,text,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.shared_product_tax_assignment_summary(uuid,uuid,text,uuid,date) from public, anon, authenticated;
grant execute on function public.shared_tax_reporting_periodicity_read(uuid,uuid,text,uuid) to service_role;
grant execute on function public.shared_tax_reporting_periodicity_set(uuid,uuid,text,uuid,text,text,text,text) to service_role;
grant execute on function public.shared_product_tax_assignment_summary(uuid,uuid,text,uuid,date) to service_role;
commit;

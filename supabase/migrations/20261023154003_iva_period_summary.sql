begin;

alter table public.shared_companies
  add column if not exists iva_periodicity text check (iva_periodicity in ('monthly','fortnightly'));

create or replace function public.shared_tax_reporting_period_summary(
  p_tenant_id uuid,
  p_organization_id uuid,
  p_company_id text,
  p_actor_id uuid,
  p_period text,
  p_include_purchases boolean default true,
  p_include_sales boolean default true
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
  v_purchase_sources bigint := 0;
  v_sales_sources bigint := 0;
  v_periodicity text;
begin
  if p_actor_id is null or p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$'
    or (not p_include_purchases and not p_include_sales) then
    raise exception 'TAX_REPORTING_INVALID';
  end if;
  if not exists(select 1 from public.shared_companies where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id) then
    raise exception 'TAX_REPORTING_SCOPE';
  end if;
  select iva_periodicity into v_periodicity from public.shared_companies where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id;
  if not exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_actor_id and status='active') then
    if p_include_purchases and not exists(
      select 1 from public.organization_delegation_member_assignments a
      join public.organization_delegations d on d.id=a.delegation_id
      join public.organization_delegation_scopes s on s.delegation_id=d.id
      where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id
        and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='purchases'
    ) then raise exception 'TAX_REPORTING_SCOPE'; end if;
    if p_include_sales and not exists(
      select 1 from public.organization_delegation_member_assignments a
      join public.organization_delegations d on d.id=a.delegation_id
      join public.organization_delegation_scopes s on s.delegation_id=d.id
      where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id
        and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='sales'
    ) then raise exception 'TAX_REPORTING_SCOPE'; end if;
  end if;

  if p_include_purchases then
    select count(*) into v_purchase_sources from public.shared_inventory_purchase_invoices f
    where f.tenant_id=p_tenant_id and f.company_id=p_company_id and f.status='confirmada'
      and coalesce(f.period,to_char(f.invoice_date,'YYYY-MM'))=p_period
      and f.document_type in ('factura','nota_credito','nota_debito')
      and not exists(select 1 from public.shared_tax_reporting_facts r where r.tenant_id=f.tenant_id and r.company_id=f.company_id and r.source_id=f.id and r.source_kind in ('legacy_purchase_invoice','legacy_purchase_credit_note','legacy_purchase_debit_note'));
  end if;
  if p_include_sales then
    select count(*) into v_sales_sources from public.shared_inventory_sales_invoices f
    where f.tenant_id=p_tenant_id and f.company_id=p_company_id and f.status='confirmada'
      and coalesce(f.period,to_char(f.invoice_date,'YYYY-MM'))=p_period
      and f.document_type in ('venta','nota_credito')
      and not exists(select 1 from public.shared_tax_reporting_facts r where r.tenant_id=f.tenant_id and r.company_id=f.company_id and r.source_id=f.id and r.source_kind in ('legacy_sales_invoice','legacy_sales_credit_note','legacy_delivery_note'));
  end if;

  with selected as (
    select f.fact_snapshot s from public.shared_tax_reporting_facts f
    where f.tenant_id=p_tenant_id and f.organization_id=p_organization_id and f.company_id=p_company_id and f.period=p_period
      and ((p_include_purchases and f.fact_snapshot->>'direction' in ('purchase','import')) or (p_include_sales and f.fact_snapshot->>'direction'='sale'))
  ), money_rows as (
    select case when s->>'direction'='import' then 'purchase' else s->>'direction' end direction, x.key, x.amount::numeric amount,
      x.currency->>'code' code, (x.currency->>'minorUnit')::integer minor_unit
    from selected q cross join lateral jsonb_to_recordset(jsonb_build_array(
      jsonb_build_object('key','tax','amount',q.s->'signed'->'taxAmount'->>'minorAmount','currency',q.s->'currency'),
      jsonb_build_object('key','credit','amount',case when q.s->'deductible'->>'state'='eligible' then q.s->'deductible'->'amount'->>'minorAmount' else '0' end,'currency',q.s->'currency'),
      jsonb_build_object('key','credit_pending','amount',case when q.s->'deductible'->>'state'='pending_review' then q.s->'deductible'->'amount'->>'minorAmount' else '0' end,'currency',q.s->'currency'),
      jsonb_build_object('key','withholding_'||coalesce(q.s->'withholding'->>'kind','none'),'amount',coalesce(q.s->'withholding'->'amount'->>'minorAmount','0'),'currency',coalesce(q.s->'withholding'->'amount'->'currency',q.s->'currency'))
    )) x(key text, amount text, currency jsonb)
  ), totals as (
    select direction,key,code,minor_unit,sum(amount) minor_amount from money_rows group by direction,key,code,minor_unit
  ), rate_rows as (
    select case when q.s->>'direction'='import' then 'purchase' else q.s->>'direction' end direction, r->>'component' component, r->>'category' category, r->>'rate' rate,
      r->'taxableBase'->'currency'->>'code' code, (r->'taxableBase'->'currency'->>'minorUnit')::integer minor_unit,
      sum((r->'taxableBase'->>'minorAmount')::numeric) base_minor, sum((r->'taxAmount'->>'minorAmount')::numeric) tax_minor
    from selected q cross join lateral jsonb_array_elements(coalesce(q.s->'rateBreakdowns','[]'::jsonb)) r
    group by q.s->>'direction',r->>'component',r->>'category',r->>'rate',r->'taxableBase'->'currency'->>'code',(r->'taxableBase'->'currency'->>'minorUnit')::integer
  ), counts as (
    select count(*) filter(where q.s->'reconciliation'->>'state'='reconciled') reconciled,
      count(*) filter(where q.s->'reconciliation'->>'state'='issue') issues from selected q
  ), direction_counts as (
    select q.s->>'direction' direction,count(*) total from selected q group by q.s->>'direction'
  )
  select jsonb_build_object(
    'period',p_period,
    'periodicity',v_periodicity,
    'totals',coalesce((select jsonb_agg(jsonb_build_object('direction',direction,'kind',key,'amount',jsonb_build_object('minorAmount',minor_amount::text,'currency',jsonb_build_object('code',code,'minorUnit',minor_unit)))) from totals),'[]'::jsonb),
    'rateTotals',coalesce((select jsonb_agg(jsonb_build_object('direction',direction,'component',component,'category',category,'rate',rate,'taxableBase',jsonb_build_object('minorAmount',base_minor::text,'currency',jsonb_build_object('code',code,'minorUnit',minor_unit)),'taxAmount',jsonb_build_object('minorAmount',tax_minor::text,'currency',jsonb_build_object('code',code,'minorUnit',minor_unit)))) from rate_rows),'[]'::jsonb),
    'reconciliationCounts',jsonb_build_object('reconciled',(select reconciled from counts),'issue',(select issues from counts)),
    'factCounts',jsonb_build_object('purchase',coalesce((select total from direction_counts where direction='purchase'),0),'sale',coalesce((select total from direction_counts where direction='sale'),0),'import',coalesce((select total from direction_counts where direction='import'),0)),
    'legacyUnincorporated',jsonb_build_object('purchases',v_purchase_sources,'sales',v_sales_sources)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.shared_tax_reporting_period_summary(uuid,uuid,text,uuid,text,boolean,boolean) from public, anon, authenticated;
grant execute on function public.shared_tax_reporting_period_summary(uuid,uuid,text,uuid,text,boolean,boolean) to service_role;
comment on function public.shared_tax_reporting_period_summary(uuid,uuid,text,uuid,text,boolean,boolean)
  is 'Company-scoped IVA period totals from immutable reporting facts and period-keyed legacy source counts; no tax classification is inferred.';
commit;

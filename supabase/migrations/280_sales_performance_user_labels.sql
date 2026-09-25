-- Show profile names in user reports while retaining the immutable user ID as
-- the grouping key and as a fallback when a profile has no display name.
create or replace function public.get_native_sales_performance_report(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_company_id text,
  p_from date,
  p_to date,
  p_dimension text,
  p_currency text default 'VES'
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_tenant uuid;
  v_allowed boolean;
  v_rows jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365
    or p_dimension not in ('user', 'role', 'device') or p_currency <> 'VES' then
    raise exception 'SALES_REPORT_INVALID';
  end if;

  select tenant_id into v_tenant from public.shared_companies
  where organization_id=p_organization_id and id=p_company_id;
  if v_tenant is null then raise exception 'SALES_REPORT_ACCESS_DENIED'; end if;

  select exists (
    select 1 from public.organization_memberships m
    join public.organization_role_permissions rp on rp.role_id=m.role_id
    where m.organization_id=p_organization_id and m.user_id=p_actor_user_id
      and m.status='active' and rp.permission_code='sales.read.reporting'
  ) into v_allowed;
  if not coalesce(v_allowed, false) then raise exception 'SALES_REPORT_ACCESS_DENIED'; end if;

  with grouped as (
    select
      case p_dimension
        when 'user' then coalesce(a.actor_user_id::text, 'unattributed')
        when 'role' then coalesce(a.role_id::text, 'unattributed')
        else coalesce(a.register_id, 'unattributed')
      end as group_key,
      case p_dimension
        when 'user' then coalesce(nullif(profile.name, ''), a.actor_user_id::text, 'Sin atribución histórica')
        when 'role' then coalesce(a.role_name, 'Sin atribución histórica')
        else coalesce(a.register_name, 'Sin atribución histórica')
      end as group_label,
      (coalesce(a.attributed, false) and case p_dimension when 'user' then a.actor_user_id is not null
        when 'role' then a.role_id is not null else a.register_id is not null end) as is_attributed,
      count(*)::integer as invoice_count,
      sum(f.total) as amount
    from public.shared_inventory_sales_invoices f
    left join public.shared_inventory_sales_invoice_attributions a
      on a.tenant_id=f.tenant_id and a.invoice_id=f.id
    left join public.profiles profile on profile.id=a.actor_user_id
    where f.tenant_id=v_tenant and f.company_id=p_company_id
      and f.document_type='venta' and f.status='confirmada'
      and f.invoice_date between p_from and p_to
    group by 1, 2, 3
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', group_key, 'label', group_label, 'attributed', is_attributed,
    'invoiceCount', invoice_count,
    'grossAmount', jsonb_build_object('amount', round(coalesce(amount, 0), 2)::text, 'currency', 'VES')
  ) order by amount desc nulls last, group_label), '[]'::jsonb)
  into v_rows from grouped;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from::text, 'to', p_to::text),
    'dimension', p_dimension, 'currency', 'VES', 'rows', v_rows, 'generatedAt', now()::text
  );
end $$;

revoke all on function public.get_native_sales_performance_report(uuid,uuid,text,date,date,text,text)
  from public, anon, authenticated;
grant execute on function public.get_native_sales_performance_report(uuid,uuid,text,date,date,text,text)
  to service_role;

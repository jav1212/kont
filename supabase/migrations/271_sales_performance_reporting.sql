-- Capture attribution when a shared sales invoice is first confirmed. Existing
-- invoices remain unattributed because their original operator cannot be proven.
alter table public.shared_inventory_sales_invoices
  add column if not exists sales_register_id text,
  add column if not exists sales_register_name text,
  add column if not exists sales_register_kind text;

alter table public.shared_inventory_sales_invoices
  drop constraint if exists shared_sales_invoice_register_kind_check;
alter table public.shared_inventory_sales_invoices
  add constraint shared_sales_invoice_register_kind_check
  check (sales_register_kind is null or sales_register_kind in ('desktop', 'mobile', 'browser', 'other'));

create table if not exists public.shared_inventory_sales_invoice_attributions (
  tenant_id uuid not null,
  invoice_id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id text not null,
  confirmed_at timestamptz not null,
  actor_user_id uuid,
  role_id uuid,
  role_code text,
  role_name text,
  register_id text,
  register_name text,
  register_kind text,
  attributed boolean not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, invoice_id),
  foreign key (tenant_id, invoice_id)
    references public.shared_inventory_sales_invoices(tenant_id, id) on delete cascade,
  check ((actor_user_id is null) = (role_id is null)),
  check (register_kind is null or register_kind in ('desktop', 'mobile', 'browser', 'other')),
  check (attributed = (actor_user_id is not null))
);

create index if not exists shared_sales_attribution_company_period_idx
  on public.shared_inventory_sales_invoice_attributions
    (tenant_id, company_id, confirmed_at desc, actor_user_id, role_id, register_id);

alter table public.shared_inventory_sales_invoice_attributions enable row level security;
revoke all on public.shared_inventory_sales_invoice_attributions from public, anon, authenticated;
grant select, insert on public.shared_inventory_sales_invoice_attributions to service_role;

create or replace function public.capture_shared_sales_invoice_attribution()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_organization_id uuid;
  v_actor uuid := auth.uid();
  v_role_id uuid;
  v_role_code text;
  v_role_name text;
begin
  if new.status <> 'confirmada' or old.status = 'confirmada' then return new; end if;

  select c.organization_id into v_organization_id
  from public.shared_companies c
  where c.tenant_id = new.tenant_id and c.id = new.company_id;
  if v_organization_id is null then return new; end if;

  if v_actor is not null then
    select r.id, r.code, r.name into v_role_id, v_role_code, v_role_name
    from public.organization_memberships m
    join public.organization_roles r on r.id = m.role_id and r.organization_id = m.organization_id
    where m.organization_id = v_organization_id
      and m.user_id = v_actor and m.status = 'active' and r.status = 'active';
    if v_role_id is null then v_actor := null; end if;
  end if;

  insert into public.shared_inventory_sales_invoice_attributions (
    tenant_id, invoice_id, organization_id, company_id, confirmed_at,
    actor_user_id, role_id, role_code, role_name,
    register_id, register_name, register_kind, attributed
  ) values (
    new.tenant_id, new.id, v_organization_id, new.company_id,
    coalesce(new.confirmed_at, now()), v_actor, v_role_id, v_role_code, v_role_name,
    new.sales_register_id, new.sales_register_name, new.sales_register_kind, v_actor is not null
  ) on conflict (tenant_id, invoice_id) do nothing;
  return new;
end $$;

drop trigger if exists shared_sales_invoice_capture_attribution on public.shared_inventory_sales_invoices;
create trigger shared_sales_invoice_capture_attribution
  after update of status on public.shared_inventory_sales_invoices
  for each row execute function public.capture_shared_sales_invoice_attribution();
revoke all on function public.capture_shared_sales_invoice_attribution() from public, anon, authenticated;

insert into public.access_control_permissions (code, resource, action, description)
values ('sales.read.reporting', 'sales.reporting', 'read', 'Ver reportes de rendimiento de ventas')
on conflict (code) do update set resource=excluded.resource, action=excluded.action, description=excluded.description;

insert into public.organization_role_permissions (role_id, permission_code)
select role.id, 'sales.read.reporting'
from public.organization_roles role
join public.organization_role_permissions sales_read
  on sales_read.role_id=role.id and sales_read.permission_code='sales.read'
where role.status='active' and role.code<>'cashier'
on conflict (role_id, permission_code) do nothing;

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
        when 'user' then coalesce(a.actor_user_id::text, 'Sin atribución histórica')
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

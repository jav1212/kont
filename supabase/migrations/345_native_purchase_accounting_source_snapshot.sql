-- ADM-035: a confirmed purchase invoice may be imputed or reconfirmed under
-- the same ID. Track every generation before it can be used as a journal source.
create table public.shared_purchase_accounting_source_revisions (
  tenant_id uuid not null,
  invoice_id text not null,
  version bigint not null check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, invoice_id),
  foreign key (tenant_id, invoice_id)
    references public.shared_inventory_purchase_invoices (tenant_id, id)
    on delete cascade
);
alter table public.shared_purchase_accounting_source_revisions enable row level security;
revoke all on public.shared_purchase_accounting_source_revisions
  from public, anon, authenticated, service_role;

create function public.bump_native_purchase_accounting_source_revision(
  p_tenant_id uuid, p_invoice_id text
) returns void
language plpgsql security definer set search_path=public as $$
declare v_status text;
begin
  if p_invoice_id is null then return; end if;
  -- The lock serializes the revision with snapshot reads and movement writes.
  select i.status into v_status
  from public.shared_inventory_purchase_invoices i
  where i.tenant_id=p_tenant_id and i.id=p_invoice_id
  for update;
  if not found or v_status<>'confirmada' then return; end if;
  insert into public.shared_purchase_accounting_source_revisions
    (tenant_id,invoice_id,version)
  values (p_tenant_id,p_invoice_id,2)
  on conflict (tenant_id,invoice_id) do update
    set version=public.shared_purchase_accounting_source_revisions.version+1,
        updated_at=now();
end;
$$;
revoke all on function public.bump_native_purchase_accounting_source_revision(uuid,text)
  from public, anon, authenticated, service_role;

create function public.track_native_purchase_invoice_accounting_source()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.status='confirmada' then
      insert into public.shared_purchase_accounting_source_revisions
        (tenant_id,invoice_id,version) values (new.tenant_id,new.id,1)
      on conflict (tenant_id,invoice_id) do update
        set version=public.shared_purchase_accounting_source_revisions.version+1,
            updated_at=now();
    end if;
    return new;
  end if;
  if (old.status='confirmada' or new.status='confirmada')
    and (to_jsonb(old)-'updated_at') is distinct from (to_jsonb(new)-'updated_at') then
    insert into public.shared_purchase_accounting_source_revisions
      (tenant_id,invoice_id,version)
    values (new.tenant_id,new.id,
      case when old.status='confirmada' then 2 else 1 end)
    on conflict (tenant_id,invoice_id) do update
      set version=public.shared_purchase_accounting_source_revisions.version+1,
          updated_at=now();
  end if;
  return new;
end;
$$;
create trigger track_native_purchase_invoice_accounting_source
after insert or update on public.shared_inventory_purchase_invoices
for each row execute function public.track_native_purchase_invoice_accounting_source();

create function public.track_native_purchase_child_accounting_source()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_old_invoice_id text; v_new_invoice_id text;
  v_old_tenant_id uuid; v_new_tenant_id uuid;
begin
  if tg_table_name='shared_inventory_purchase_invoice_items' then
    if tg_op<>'INSERT' then
      v_old_invoice_id:=old.invoice_id; v_old_tenant_id:=old.tenant_id;
    end if;
    if tg_op<>'DELETE' then
      v_new_invoice_id:=new.invoice_id; v_new_tenant_id:=new.tenant_id;
    end if;
  else
    if tg_op<>'INSERT' then
      v_old_invoice_id:=old.purchase_invoice_id; v_old_tenant_id:=old.tenant_id;
    end if;
    if tg_op<>'DELETE' then
      v_new_invoice_id:=new.purchase_invoice_id; v_new_tenant_id:=new.tenant_id;
    end if;
  end if;
  if tg_op='UPDATE' and to_jsonb(old) is not distinct from to_jsonb(new) then
    return new;
  end if;
  if v_old_invoice_id is not null then
    perform public.bump_native_purchase_accounting_source_revision(
      v_old_tenant_id,v_old_invoice_id);
  end if;
  if v_new_invoice_id is not null and
    (v_new_invoice_id,v_new_tenant_id) is distinct from
    (v_old_invoice_id,v_old_tenant_id) then
    perform public.bump_native_purchase_accounting_source_revision(
      v_new_tenant_id,v_new_invoice_id);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.track_native_purchase_invoice_accounting_source()
  from public, anon, authenticated, service_role;
revoke all on function public.track_native_purchase_child_accounting_source()
  from public, anon, authenticated, service_role;
create trigger track_native_purchase_item_accounting_source
after insert or update or delete on public.shared_inventory_purchase_invoice_items
for each row execute function public.track_native_purchase_child_accounting_source();
create trigger track_native_purchase_movement_accounting_source
after insert or update or delete on public.shared_inventory_movements
for each row execute function public.track_native_purchase_child_accounting_source();

create function public.get_native_purchase_accounting_snapshot(
  p_actor_id uuid, p_organization_id uuid, p_company_id text, p_invoice_id text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_tenant uuid; v_accounting_tenant uuid;
  v_invoice public.shared_inventory_purchase_invoices%rowtype;
  v_count integer; v_cost numeric; v_bad integer; v_version bigint;
begin
  if p_actor_id is null or p_organization_id is null
    or p_company_id is null or length(trim(p_company_id)) not between 1 and 128
    or p_invoice_id is null or length(trim(p_invoice_id)) not between 1 and 128
  then raise exception 'PURCHASE_ACCOUNTING_SNAPSHOT_INVALID'; end if;
  v_tenant:=public.assert_user_security_access(
    p_actor_id,p_organization_id,trim(p_company_id),'purchases.read');
  v_accounting_tenant:=public.assert_user_security_access(
    p_actor_id,p_organization_id,trim(p_company_id),'accounting.read');
  if v_tenant is distinct from v_accounting_tenant or not exists (
    select 1 from public.shared_companies c
    where c.tenant_id=v_tenant and c.organization_id=p_organization_id
      and c.id=trim(p_company_id) and c.status='active'
  ) then raise exception 'PURCHASE_ACCOUNTING_SNAPSHOT_ACCESS_DENIED'; end if;

  select * into v_invoice from public.shared_inventory_purchase_invoices i
  where i.tenant_id=v_tenant and i.company_id=trim(p_company_id)
    and i.id=trim(p_invoice_id) for update;
  if not found or v_invoice.status<>'confirmada'
    or v_invoice.confirmed_at is null then
    raise exception 'PURCHASE_ACCOUNTING_SNAPSHOT_NOT_CONFIRMED';
  end if;
  if v_invoice.document_type<>'factura'
    or v_invoice.inventory_effect<>'additional_purchase'
    or v_invoice.currency_code not in ('VES','USD') then
    raise exception 'PURCHASE_ACCOUNTING_SNAPSHOT_UNSUPPORTED';
  end if;

  perform 1 from public.shared_inventory_purchase_invoice_items x
  where x.tenant_id=v_tenant and x.invoice_id=v_invoice.id for share;
  if not found then raise exception 'PURCHASE_ACCOUNTING_SNAPSHOT_EMPTY'; end if;
  perform 1 from public.shared_inventory_movements m
  where m.tenant_id=v_tenant and m.purchase_invoice_id=v_invoice.id for share;
  select count(*)::integer,coalesce(sum(m.total_cost),0),
    count(*) filter (where m.company_id is distinct from v_invoice.company_id
      or m.type<>'entrada' or m.date is distinct from v_invoice.invoice_date
      or m.total_cost<0)::integer
  into v_count,v_cost,v_bad
  from public.shared_inventory_movements m
  where m.tenant_id=v_tenant and m.purchase_invoice_id=v_invoice.id;
  if v_count=0 or v_cost<=0 then
    raise exception 'PURCHASE_ACCOUNTING_SNAPSHOT_EMPTY';
  end if;
  if v_bad>0 then raise exception 'PURCHASE_ACCOUNTING_SNAPSHOT_INVALID'; end if;
  if v_cost<>round(v_cost,2) then
    raise exception 'PURCHASE_ACCOUNTING_SNAPSHOT_FRACTIONAL_CENT';
  end if;
  select r.version into v_version
  from public.shared_purchase_accounting_source_revisions r
  where r.tenant_id=v_tenant and r.invoice_id=v_invoice.id;
  return jsonb_build_object(
    'tenantId',v_tenant,'organizationId',p_organization_id,
    'companyId',v_invoice.company_id,'invoiceId',v_invoice.id,
    'sourceVersion',coalesce(v_version,1),
    'effectiveDate',to_char(v_invoice.invoice_date,'YYYY-MM-DD'),
    'confirmedAt',to_char(v_invoice.confirmed_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'movementCount',v_count,
    'recognizedInventoryCost',to_char(v_cost,'FM999999999999999990.00'),
    'documentCurrency',v_invoice.currency_code
  );
end;
$$;
revoke all on function public.get_native_purchase_accounting_snapshot(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_native_purchase_accounting_snapshot(uuid,uuid,text,text)
  to service_role;

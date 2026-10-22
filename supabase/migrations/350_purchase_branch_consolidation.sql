-- ADM-012: forward-only purchase branch attribution and authorized consolidation.
-- Historic invoices retain NULL branch_id; functional amounts are stored in VES.
alter table public.shared_inventory_purchase_invoices
  add column branch_id uuid;

alter table public.shared_inventory_purchase_invoices
  add constraint shared_inventory_purchase_invoices_branch_scope_fk
  foreign key (branch_id, tenant_id, company_id)
  references public.shared_company_branches(id, tenant_id, company_id)
  on delete restrict;

create index shared_inventory_purchase_invoices_branch_scope_idx
  on public.shared_inventory_purchase_invoices(branch_id, tenant_id, company_id);

create index shared_inventory_purchase_invoices_confirmed_branch_date_idx
  on public.shared_inventory_purchase_invoices(tenant_id, company_id, branch_id, invoice_date)
  where status = 'confirmada';

create or replace function public.assert_native_purchase_branch_access(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_tenant_id uuid, p_branch_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  if p_branch_id is null or not exists (
    select 1 from public.shared_company_branches b
    where b.id = p_branch_id and b.tenant_id = p_tenant_id
      and b.organization_id = p_organization_id and b.company_id = p_company_id
  ) then raise exception 'PURCHASE_BRANCH_NOT_FOUND'; end if;

  perform 1 from public.organization_memberships m
    join public.organization_roles r on r.id = m.role_id and r.organization_id = m.organization_id and r.status = 'active'
    join public.organization_role_permissions rp on rp.role_id = r.id and rp.permission_code = 'branches.select'
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id and m.status = 'active'
    for share of m, r, rp;
  if not found then raise exception 'PURCHASE_BRANCH_ACCESS_DENIED'; end if;

  if not public.company_branch_user_can_select_any(p_actor_user_id, p_organization_id) then
    perform 1 from public.shared_company_branch_memberships m
      where m.tenant_id = p_tenant_id and m.organization_id = p_organization_id
        and m.company_id = p_company_id and m.branch_id = p_branch_id
        and m.user_id = p_actor_user_id and m.status = 'active' for share;
    if not found then raise exception 'PURCHASE_BRANCH_ACCESS_DENIED'; end if;
  end if;
  return p_branch_id;
end $$;
revoke all on function public.assert_native_purchase_branch_access(uuid,uuid,text,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.guard_purchase_invoice_branch_attribution()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid; v_org uuid;
begin
  if tg_op = 'INSERT' and new.branch_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.branch_id is not distinct from old.branch_id then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'borrador' then
    raise exception 'PURCHASE_BRANCH_IMMUTABLE';
  end if;
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception 'PURCHASE_BRANCH_ASSIGNMENT_RPC_REQUIRED';
  end if;
  v_actor := nullif(current_setting('kontave.purchase.branch_actor_user_id', true), '')::uuid;
  if new.branch_id is null or v_actor is null or
     current_setting('kontave.purchase.branch_id', true) is distinct from new.branch_id::text then
    raise exception 'PURCHASE_BRANCH_ASSIGNMENT_RPC_REQUIRED';
  end if;
  select c.organization_id into v_org from public.shared_companies c
    where c.tenant_id = new.tenant_id and c.id = new.company_id;
  if v_org is null then raise exception 'PURCHASE_BRANCH_NOT_FOUND'; end if;
  perform public.assert_native_purchase_branch_access(v_actor, v_org, new.company_id, new.tenant_id, new.branch_id);
  return new;
end $$;
revoke all on function public.guard_purchase_invoice_branch_attribution() from public,anon,authenticated,service_role;
create trigger shared_purchase_invoice_branch_attribution_guard
before insert or update of branch_id on public.shared_inventory_purchase_invoices
for each row execute function public.guard_purchase_invoice_branch_attribution();

create or replace function public.confirm_native_purchase_invoice_branch_secure(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_invoice_id text, p_company_branch_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_invoice public.shared_inventory_purchase_invoices%rowtype; v_result jsonb;
begin
  begin
    v_tenant := public.assert_user_security_access(p_actor_user_id, p_organization_id, p_company_id, 'purchases.confirm');
  exception when others then
    if sqlerrm in ('ORGANIZATIONAL_USER_ACCESS_DENIED', 'ORGANIZATIONAL_USER_COMPANY_INVALID') then
      raise exception 'PURCHASE_BRANCH_ACCESS_DENIED';
    end if;
    raise;
  end;
  if v_tenant is null then raise exception 'PURCHASE_BRANCH_ACCESS_DENIED'; end if;
  perform public.assert_native_purchase_branch_access(
    p_actor_user_id, p_organization_id, p_company_id, v_tenant, p_company_branch_id);

  select * into v_invoice from public.shared_inventory_purchase_invoices
    where tenant_id = v_tenant and company_id = p_company_id and id = p_invoice_id for update;
  if not found then raise exception 'PURCHASE_NOT_FOUND'; end if;
  if v_invoice.status <> 'borrador' then raise exception 'PURCHASE_BRANCH_TRANSITION_INVALID'; end if;
  perform set_config('kontave.purchase.branch_actor_user_id', p_actor_user_id::text, true);
  perform set_config('kontave.purchase.branch_id', p_company_branch_id::text, true);
  update public.shared_inventory_purchase_invoices set branch_id = p_company_branch_id
    where tenant_id = v_tenant and company_id = p_company_id and id = p_invoice_id;
  v_result := public.shared_inventory_purchase_invoice_confirm(v_tenant, p_invoice_id);
  return v_result;
end $$;
revoke all on function public.confirm_native_purchase_invoice_branch_secure(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.confirm_native_purchase_invoice_branch_secure(uuid,uuid,text,text,uuid) to service_role;

create or replace function public.get_native_purchase_branch_consolidation(
  p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
  p_from date, p_to date, p_branch_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_branch_tenant uuid; v_select_any boolean;
  v_rows jsonb; v_attributed_count bigint; v_unattributed_count bigint;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365
    or coalesce(cardinality(p_branch_ids), 0) > 100
    or (p_branch_ids is not null and (
      exists(select 1 from unnest(p_branch_ids) ids(branch_id) where branch_id is null)
      or cardinality(p_branch_ids) <> (select count(distinct ids.branch_id) from unnest(p_branch_ids) ids(branch_id))
    )) then raise exception 'PURCHASE_BRANCH_CONSOLIDATION_INVALID'; end if;

  begin
    v_tenant := public.assert_user_security_access(p_actor_user_id, p_organization_id, p_company_id, 'purchases.read');
  exception when others then
    if sqlerrm in ('ORGANIZATIONAL_USER_ACCESS_DENIED', 'ORGANIZATIONAL_USER_COMPANY_INVALID') then
      raise exception 'PURCHASE_BRANCH_CONSOLIDATION_ACCESS_DENIED';
    end if;
    raise;
  end;
  begin
    v_branch_tenant := public.assert_company_administration_access(p_organization_id, p_actor_user_id, 'branches.consolidate');
  exception when others then
    if sqlerrm in ('COMPANY_ACCESS_DENIED', 'COMPANY_ORGANIZATION_NOT_READY') then
      raise exception 'PURCHASE_BRANCH_CONSOLIDATION_ACCESS_DENIED';
    end if;
    raise;
  end;
  if v_tenant is null or v_tenant is distinct from v_branch_tenant then
    raise exception 'PURCHASE_BRANCH_CONSOLIDATION_ACCESS_DENIED';
  end if;
  v_select_any := public.company_branch_user_can_select_any(p_actor_user_id, p_organization_id);

  if p_branch_ids is not null and exists (
    select 1 from unnest(p_branch_ids) requested(branch_id)
    where not exists (
      select 1 from public.shared_company_branches b
      where b.id = requested.branch_id and b.tenant_id = v_tenant
        and b.organization_id = p_organization_id and b.company_id = p_company_id
        and (v_select_any or exists (
          select 1 from public.shared_company_branch_memberships m
          where m.tenant_id = b.tenant_id and m.organization_id = b.organization_id
            and m.company_id = b.company_id and m.branch_id = b.id
            and m.user_id = p_actor_user_id and m.status = 'active'
        ))
    )
  ) then raise exception 'PURCHASE_BRANCH_CONSOLIDATION_ACCESS_DENIED'; end if;

  with accessible_branches as (
    select b.id, b.code, b.name from public.shared_company_branches b
    where b.tenant_id = v_tenant and b.organization_id = p_organization_id
      and b.company_id = p_company_id and (p_branch_ids is null or b.id = any(p_branch_ids))
      and (v_select_any or exists (
        select 1 from public.shared_company_branch_memberships m
        where m.tenant_id = b.tenant_id and m.organization_id = b.organization_id
          and m.company_id = b.company_id and m.branch_id = b.id
          and m.user_id = p_actor_user_id and m.status = 'active'
      ))
  ), grouped as (
    select b.id branch_id, b.code branch_code, b.name branch_name,
      i.document_type, i.currency_code, count(*)::bigint document_count,
      sum(i.subtotal)::text functional_subtotal,
      sum(i.vat_amount)::text functional_vat_amount,
      sum(i.total)::text functional_total
    from public.shared_inventory_purchase_invoices i
    join accessible_branches b on b.id = i.branch_id
    where i.tenant_id = v_tenant and i.company_id = p_company_id
      and i.status = 'confirmada' and i.invoice_date between p_from and p_to
    group by b.id, b.code, b.name, i.document_type, i.currency_code
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'branchId', branch_id, 'branchCode', branch_code, 'branchName', branch_name,
    'documentType', document_type, 'transactionCurrencyCode', currency_code,
    'documentCount', document_count, 'functionalCurrency', 'VES',
    'functionalSubtotal', functional_subtotal,
    'functionalVatAmount', functional_vat_amount, 'functionalTotal', functional_total
  ) order by branch_code, document_type, currency_code), '[]'::jsonb)
  into v_rows from grouped;

  select count(*) into v_attributed_count
  from public.shared_inventory_purchase_invoices i
  join public.shared_company_branches b on b.id = i.branch_id
    and b.tenant_id = i.tenant_id and b.organization_id = p_organization_id
    and b.company_id = i.company_id
  where i.tenant_id = v_tenant and i.company_id = p_company_id
    and i.status = 'confirmada' and i.invoice_date between p_from and p_to
    and (p_branch_ids is null or i.branch_id = any(p_branch_ids))
    and (v_select_any or exists (
      select 1 from public.shared_company_branch_memberships m
      where m.tenant_id = b.tenant_id and m.organization_id = b.organization_id
        and m.company_id = b.company_id and m.branch_id = b.id
        and m.user_id = p_actor_user_id and m.status = 'active'
    ));
  if v_select_any then
    select count(*) into v_unattributed_count from public.shared_inventory_purchase_invoices i
    where i.tenant_id = v_tenant and i.company_id = p_company_id
      and i.status = 'confirmada' and i.invoice_date between p_from and p_to
      and i.branch_id is null;
  end if;
  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to), 'rows', v_rows,
    'coverage', jsonb_build_object(
      'attributedConfirmedDocumentCount', v_attributed_count,
      'unattributedConfirmedDocumentCount', case when v_select_any then v_unattributed_count else null end,
      'includesUnattributed', v_select_any
    ), 'generatedAt', clock_timestamp()
  );
end $$;
revoke all on function public.get_native_purchase_branch_consolidation(uuid,uuid,text,date,date,uuid[]) from public,anon,authenticated;
grant execute on function public.get_native_purchase_branch_consolidation(uuid,uuid,text,date,date,uuid[]) to service_role;

-- The legacy server adapter uses the service-role key, so auth.uid() is NULL.
-- Carry the identity already authorized by the API request into the same
-- transaction as the invoice confirmation and its attribution trigger.
create or replace function public.capture_shared_sales_invoice_attribution()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_organization_id uuid;
  v_actor uuid := coalesce(
    nullif(current_setting('kontave.sales.actor_user_id', true), '')::uuid,
    auth.uid()
  );
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

create or replace function public.shared_inventory_sales_invoice_confirm_attributed(
  p_tenant_id uuid,
  p_invoice_id text,
  p_actor_user_id uuid,
  p_allow_negative_stock boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if p_actor_user_id is null then raise exception 'SALES_CONFIRM_ACTOR_REQUIRED'; end if;
  perform set_config('kontave.sales.actor_user_id', p_actor_user_id::text, true);
  return public.shared_inventory_sales_invoice_confirm(
    p_tenant_id, p_invoice_id, coalesce(p_allow_negative_stock, false)
  );
end $$;

revoke all on function public.capture_shared_sales_invoice_attribution() from public, anon, authenticated;
revoke all on function public.shared_inventory_sales_invoice_confirm_attributed(uuid,text,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.shared_inventory_sales_invoice_confirm_attributed(uuid,text,uuid,boolean)
  to service_role;

-- Server-only read models for the production Web administration screens.
create or replace function public.list_payment_orders(
  p_actor_id uuid, p_organization_id uuid, p_company_id text,
  p_offset integer default 0, p_limit integer default 50
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_orders jsonb; v_total bigint;
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'PAYMENT_ORDER_INVALID';
  end if;
  v_tenant := public.assert_user_security_access(p_actor_id,p_organization_id,p_company_id,'payment_orders.read');
  select count(*) into v_total from public.shared_payment_orders where tenant_id=v_tenant and company_id=p_company_id;
  select coalesce(jsonb_agg(public.payment_order_json(v_tenant,p_organization_id,p_company_id,p.id)
    order by p.created_at desc,p.id desc),'[]'::jsonb) into v_orders
  from (select id,created_at from public.shared_payment_orders where tenant_id=v_tenant and company_id=p_company_id
    order by created_at desc,id desc offset p_offset limit p_limit) p;
  return jsonb_build_object('orders',v_orders,'total',v_total,'offset',p_offset,'limit',p_limit);
end $$;

create or replace function public.list_organization_scoped_grants(
  p_organization_id uuid,p_actor_user_id uuid,p_membership_id uuid
) returns setof jsonb language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_user_security_access(p_actor_user_id,p_organization_id,null,'roles.manage');
  if not exists(select 1 from public.organization_memberships where id=p_membership_id and organization_id=p_organization_id) then
    raise exception 'ORGANIZATIONAL_USER_NOT_FOUND';
  end if;
  return query select jsonb_build_object('membershipId',g.membership_id,'permissionCode',g.permission_code,
    'targetKind',g.target_kind,'targetId',g.target_id,'companyId',nullif(g.company_id,''))
    from public.organization_membership_scoped_grants g where g.organization_id=p_organization_id and g.membership_id=p_membership_id
    order by g.permission_code,g.target_kind,g.target_id,g.company_id;
end $$;
revoke all on function public.list_payment_orders(uuid,uuid,text,integer,integer),
  public.list_organization_scoped_grants(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_payment_orders(uuid,uuid,text,integer,integer),
  public.list_organization_scoped_grants(uuid,uuid,uuid) to service_role;

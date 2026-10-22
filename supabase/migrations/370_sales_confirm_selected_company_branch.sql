-- Resolve a user's selected branch at the trusted sales-confirmation boundary.
-- Ordinary sales operators need not receive branch administration permissions.
create or replace function public.get_native_sales_confirmation_branch(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_company_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_selection public.shared_user_company_branch_selections%rowtype;
begin
  v_tenant_id := public.assert_user_security_access(
    p_actor_user_id, p_organization_id, p_company_id, 'sales.confirm'
  );
  select * into v_selection
  from public.shared_user_company_branch_selections
  where user_id = p_actor_user_id
    and organization_id = p_organization_id
    and company_id = p_company_id;

  if not found then
    return public.company_branch_selection_snapshot(p_actor_user_id, p_organization_id, p_company_id, null, 0, null);
  end if;
  if v_selection.branch_id is not null then
    perform public.assert_native_sales_branch_access(
      p_actor_user_id, p_organization_id, p_company_id, v_tenant_id, v_selection.branch_id
    );
  end if;
  return public.company_branch_selection_snapshot(
    v_selection.user_id, v_selection.organization_id, v_selection.company_id,
    v_selection.branch_id, v_selection.version, v_selection.updated_at
  );
end;
$$;

revoke all on function public.get_native_sales_confirmation_branch(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_native_sales_confirmation_branch(uuid, uuid, text)
  to service_role;

create or replace function public.accounting_require_scope(p_scope jsonb,p_permission text) returns uuid
language plpgsql security definer set search_path=public as $$
declare
 v_tenant uuid;
 v_organization uuid;
 v_company text;
 v_actor uuid;
begin
 if p_scope is null or jsonb_typeof(p_scope)<>'object'
   or p_scope->>'tenantId' is null or p_scope->>'organizationId' is null
   or p_scope->>'companyId' is null or p_scope->>'actorId' is null then
   raise exception 'ACCOUNTING_INVALID';
 end if;
 v_organization:=(p_scope->>'organizationId')::uuid;
 v_company:=p_scope->>'companyId';
 v_actor:=(p_scope->>'actorId')::uuid;
 if p_scope->>'authorizationMode'='delegated' then
   -- Only the server's service-role composition can assert this path; Web
   -- authorization has already checked the scoped delegated permission.
   if coalesce(auth.role(),'')<>'service_role' then raise exception 'ACCOUNTING_FORBIDDEN'; end if;
   select o.legacy_tenant_id into v_tenant
   from public.organizations o
   join public.shared_companies c on c.organization_id=o.id and c.id=v_company
   where o.id=v_organization and o.status='active';
   if not found then raise exception 'ACCOUNTING_FORBIDDEN'; end if;
 else
   v_tenant:=public.assert_user_security_access(v_actor,v_organization,v_company,p_permission);
 end if;
 if v_tenant::text is distinct from p_scope->>'tenantId' then raise exception 'ACCOUNTING_FORBIDDEN'; end if;
 return v_tenant;
end;
$$;
revoke all on function public.accounting_require_scope(jsonb,text) from public,anon,authenticated;
grant execute on function public.accounting_require_scope(jsonb,text) to service_role;

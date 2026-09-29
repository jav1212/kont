-- Attach server-verified Web identities to existing operational mutations.
create or replace function public.append_operational_audit_trigger() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_old jsonb:=case when tg_op='INSERT' then null else public.operational_audit_snapshot(to_jsonb(old)) end;
declare v_new jsonb:=case when tg_op='DELETE' then null else public.operational_audit_snapshot(to_jsonb(new)) end;
declare v_source jsonb:=coalesce(v_new,v_old); declare v_tenant uuid; declare v_company text; declare v_org uuid;
declare v_action text:=case when tg_op='INSERT' then 'create' when tg_op='DELETE' then 'delete' when coalesce(v_new->>'status','') in ('cancelled','anulado','anulada','annulled') and coalesce(v_old->>'status','') not in ('cancelled','anulado','anulada','annulled') then 'cancel' else 'update' end;
declare v_actor uuid:=auth.uid(); declare v_branch text; declare v_device text;
begin
  if tg_op='UPDATE' and v_old=v_new then return new; end if;
  v_tenant:=nullif(v_source->>'tenant_id','')::uuid; v_company:=nullif(v_source->>'company_id','');
  if tg_argv[1]='payment_reversal' then
    select r.company_id into v_company from public.shared_sales_payment_reversals x join public.shared_sales_receivable_payments p on p.tenant_id=x.tenant_id and p.id=x.payment_id join public.shared_sales_receivables r on r.tenant_id=p.tenant_id and r.id=p.receivable_id where x.tenant_id=v_tenant and x.id=v_source->>'id';
  end if;
  if v_tenant is null or v_company is null or nullif(v_source->>'id','') is null then
    raise exception 'OPERATIONAL_AUDIT_SCOPE_MISSING' using errcode='23514';
  end if;
  select c.organization_id into v_org from public.shared_companies c where c.tenant_id=v_tenant and c.id=v_company;
  if v_org is null then raise exception 'OPERATIONAL_AUDIT_ORGANIZATION_MISSING' using errcode='23514'; end if;
  -- Only the service-role wrapper may supply an actor context; direct clients
  -- always use auth.uid().  The membership check prevents arbitrary GUC spoofing.
  if v_actor is null and current_setting('role',true)='service_role' and nullif(current_setting('kontave.operation.actor_user_id',true),'') is not null then
    v_actor:=current_setting('kontave.operation.actor_user_id',true)::uuid;
    if not exists(select 1 from public.organization_memberships m where m.organization_id=v_org and m.user_id=v_actor and m.status='active') then raise exception 'OPERATIONAL_AUDIT_ACTOR_INVALID' using errcode='42501'; end if;
    if current_setting('kontave.operation.organization_id',true) is distinct from v_org::text or current_setting('kontave.operation.company_id',true) is distinct from v_company or current_setting('kontave.operation.tenant_id',true) is distinct from v_tenant::text then raise exception 'OPERATIONAL_AUDIT_CONTEXT_SCOPE_INVALID' using errcode='42501'; end if;
    v_branch:=nullif(current_setting('kontave.operation.branch_id',true),''); v_device:=nullif(current_setting('kontave.operation.device_id',true),'');
  end if;
  -- Header metadata is accepted only from the service role used by the Web server.
  -- A browser's authenticated/anon token cannot impersonate this server boundary.
  if v_actor is null and current_setting('role',true)='service_role'
    and nullif((nullif(current_setting('request.headers',true),'')::jsonb)->>'x-kontave-audit-actor','') is not null then
    v_actor:=((current_setting('request.headers',true)::jsonb)->>'x-kontave-audit-actor')::uuid;
    if (current_setting('request.headers',true)::jsonb)->>'x-kontave-audit-tenant' is distinct from v_tenant::text then
      raise exception 'OPERATIONAL_AUDIT_CONTEXT_SCOPE_INVALID' using errcode='42501';
    end if;
    if public.assert_user_security_access(v_actor,v_org,v_company,
      coalesce(nullif((current_setting('request.headers',true)::jsonb)->>'x-kontave-audit-permission',''),'companies.read')) is distinct from v_tenant then
      raise exception 'OPERATIONAL_AUDIT_CONTEXT_SCOPE_INVALID' using errcode='42501';
    end if;
    v_device:=nullif((current_setting('request.headers',true)::jsonb)->>'x-kontave-audit-device','');
    if length(v_device)>128 then raise exception 'OPERATIONAL_AUDIT_CONTEXT_INVALID'; end if;
  end if;
  insert into public.shared_operational_audit_trail(tenant_id,organization_id,company_id,entity_type,entity_id,action,actor_id,occurred_at,branch_id,device_id,before_snapshot,after_snapshot,changes)
  values(v_tenant,v_org,v_company,tg_argv[0],v_source->>'id',v_action,v_actor,clock_timestamp(),v_branch,v_device,v_old,v_new,public.operational_audit_changes(v_old,v_new));
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.append_operational_audit_trigger() from public,anon,authenticated,service_role;


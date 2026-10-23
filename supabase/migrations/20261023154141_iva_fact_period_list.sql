create or replace function public.shared_tax_reporting_fact_list_period(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_actor_id uuid,
  p_period text, p_limit integer, p_cursor_recognition_date date default null, p_cursor_id text default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if p_actor_id is null or p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or p_limit is null or p_limit not between 1 and 100
    or ((p_cursor_recognition_date is null) is distinct from (p_cursor_id is null)) then raise exception 'TAX_REPORTING_INVALID'; end if;
  if not exists(select 1 from public.shared_companies where tenant_id=p_tenant_id and organization_id=p_organization_id and id=p_company_id) then raise exception 'TAX_REPORTING_SCOPE'; end if;
  if not exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_actor_id and status='active') and (
    not exists(select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='purchases')
    or not exists(select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()) and s.scope='sales')
  ) then raise exception 'TAX_REPORTING_SCOPE'; end if;
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object('fact_snapshot',q.fact_snapshot) order by q.recognition_date,q.id) filter(where q.ordinality<=p_limit),'[]'::jsonb),
    'nextCursor',case when count(*)>p_limit then jsonb_build_object(
      'recognitionDate',(max(q.recognition_date) filter(where q.ordinality=p_limit))::text,
      'id',(array_agg(q.id order by q.recognition_date,q.id) filter(where q.ordinality=p_limit))[1]
    ) else null end
  ) into v_result from (
    select f.*,row_number() over(order by f.recognition_date,f.id) as ordinality
    from public.shared_tax_reporting_facts f
    where f.tenant_id=p_tenant_id and f.organization_id=p_organization_id and f.company_id=p_company_id
      and f.period=p_period
      and (p_cursor_recognition_date is null or (f.recognition_date,f.id)>(p_cursor_recognition_date,p_cursor_id))
    order by f.recognition_date,f.id limit p_limit+1
  ) q;
  return v_result;
end $$;

revoke all on function public.shared_tax_reporting_fact_list_period(uuid,uuid,text,uuid,text,integer,date,text) from public,anon,authenticated;
grant execute on function public.shared_tax_reporting_fact_list_period(uuid,uuid,text,uuid,text,integer,date,text) to service_role;

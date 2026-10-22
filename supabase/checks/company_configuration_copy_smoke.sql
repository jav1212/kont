-- ADM-004/ADM-006 runtime smoke. The deliberate sentinel rolls every write back.
do $smoke$
declare v_org uuid; v_actor uuid; v_source jsonb; v_destination jsonb; v_created jsonb; v_result jsonb; v_replay jsonb; v_key text:=gen_random_uuid()::text;
begin
  begin
    select o.id,m.user_id into v_org,v_actor from public.organizations o join public.organization_memberships m on m.organization_id=o.id and m.status='active' join public.organization_roles r on r.id=m.role_id and r.status='active' join public.organization_role_permissions rp on rp.role_id=r.id and rp.permission_code in ('companies.read','companies.create','companies.update')
    where o.status='active' and o.legacy_tenant_id is not null and not exists(select 1 from public.organization_user_security s where s.organization_id=o.id and s.user_id=m.user_id)
    group by o.id,m.user_id having count(distinct rp.permission_code)=3 limit 1;
    if not found then raise exception 'SMOKE_NO_UNRESTRICTED_AUTHORIZED_ACTOR'; end if;
    v_source:=public.create_native_company_with_person_nature(v_actor,v_org,'copy-source-'||v_key,'ADM004 source '||v_key,null,null,'VE','kiosk','juridical');
    v_destination:=public.create_native_company_with_person_nature(v_actor,v_org,'copy-destination-'||v_key,'ADM006 destination '||v_key,null,null,'VE','standard','juridical');
    perform public.configure_native_company_date_format(v_actor,v_org,v_source->>'id',0,'copy-date-'||v_key,'Smoke source date','year_first');
    perform public.configure_native_company_monetary_policy(v_actor,v_org,v_source->>'id',0,'copy-policy-'||v_key,'Smoke source policy',jsonb_build_object('operatingCurrency',jsonb_build_object('code','VES','minorUnit',2),'referenceCurrencyCodes',jsonb_build_array('USD'),'rateSource','bcv','roundingProfile','commercial_v1','allowPreviousAvailableDate',false,'maxPreviousDays',0));
    begin
      perform public.copy_native_company_configuration(v_actor,v_org,v_destination->>'id',(v_destination->>'version')::integer,v_source->>'id',(v_source->>'version')::integer,1,null,1,null,'copy-absent-'||v_key,jsonb_build_array('date_format'));
      raise exception 'SMOKE_EXPECTED_SOURCE_SETTINGS_ABSENT';
    exception when raise_exception then if sqlerrm<>'COMPANY_CONFIGURATION_SOURCE_SETTINGS_ABSENT' then raise; end if; end;
    v_result:=public.copy_native_company_configuration(v_actor,v_org,v_source->>'id',(v_source->>'version')::integer,v_destination->>'id',(v_destination->>'version')::integer,1,1,0,0,'copy-existing-'||v_key,jsonb_build_array('operating_profile','date_format','monetary_policy'));
    v_replay:=public.copy_native_company_configuration(v_actor,v_org,v_source->>'id',(v_source->>'version')::integer,v_destination->>'id',(v_destination->>'version')::integer,1,1,0,0,'copy-existing-'||v_key,jsonb_build_array('operating_profile','date_format','monetary_policy'));
    if v_result is distinct from v_replay or v_result->'company'->>'operating_profile'<>'kiosk' or (public.get_native_company_date_format(v_actor,v_org,v_destination->>'id',null)->>'date_order')<>'year_first' or (public.get_native_company_monetary_policy(v_actor,v_org,v_destination->>'id',null)->>'policy_version')::integer<>1 then raise exception 'SMOKE_COPY_FAILED'; end if;
    begin
      perform public.copy_native_company_configuration(v_actor,v_org,v_source->>'id',(v_source->>'version')::integer,v_destination->>'id',(v_destination->>'version')::integer,null,null,null,null,'copy-existing-'||v_key,jsonb_build_array('operating_profile'));
      raise exception 'SMOKE_EXPECTED_IDEMPOTENCY_CONFLICT';
    exception when raise_exception then if sqlerrm<>'COMPANY_CONFIGURATION_COPY_IDEMPOTENCY_CONFLICT' then raise; end if; end;
    begin
      perform public.copy_native_company_configuration(v_actor,v_org,v_source->>'id',(v_source->>'version')::integer,v_destination->>'id',(v_destination->>'version')::integer,null,null,null,null,'copy-stale-'||v_key,jsonb_build_array('operating_profile'));
      raise exception 'SMOKE_EXPECTED_VERSION_CONFLICT';
    exception when raise_exception then if sqlerrm<>'COMPANY_CONFIGURATION_COPY_VERSION_CONFLICT' then raise; end if; end;
    begin
      perform public.copy_native_company_configuration(gen_random_uuid(),v_org,v_source->>'id',(v_source->>'version')::integer,v_destination->>'id',(v_destination->>'version')::integer,null,null,null,null,'copy-denied-'||v_key,jsonb_build_array('operating_profile'));
      raise exception 'SMOKE_EXPECTED_ACCESS_DENIED';
    exception when raise_exception then if sqlerrm<>'ORGANIZATIONAL_USER_ACCESS_DENIED' then raise; end if; end;
    v_created:=public.create_native_company_from_existing(v_actor,v_org,v_source->>'id',(v_source->>'version')::integer,1,1,'create-existing-'||v_key,jsonb_build_array('operating_profile','date_format','monetary_policy'),jsonb_build_object('legalName','ADM004 created '||v_key,'tradeName',null,'taxId',null,'country','VE','personNature','juridical'));
    if v_created->'company'->>'operating_profile'<>'kiosk' or (public.get_native_company_date_format(v_actor,v_org,v_created->'company'->>'id',null)->>'date_order')<>'year_first' or (public.get_native_company_monetary_policy(v_actor,v_org,v_created->'company'->>'id',null)->>'policy_version')::integer<>1 then raise exception 'SMOKE_CREATE_FAILED'; end if;
    v_replay:=public.create_native_company_from_existing(v_actor,v_org,v_source->>'id',(v_source->>'version')::integer,1,1,'create-existing-'||v_key,jsonb_build_array('operating_profile','date_format','monetary_policy'),jsonb_build_object('legalName','ADM004 created '||v_key,'tradeName',null,'taxId',null,'country','VE','personNature','juridical'));
    if v_created is distinct from v_replay then raise exception 'SMOKE_CREATE_REPLAY_FAILED'; end if;
    if (select count(*) from public.shared_company_configuration_copy_events where request_id in(select id from public.shared_company_configuration_copy_requests where idempotency_key='copy-existing-'||v_key))<>1 then raise exception 'SMOKE_AUDIT_FAILED'; end if;
    raise exception 'SMOKE_ROLLBACK';
  exception when raise_exception then if sqlerrm='SMOKE_ROLLBACK' then null; else raise; end if; end;
  if exists(select 1 from public.shared_company_configuration_copy_requests where idempotency_key in ('copy-existing-'||v_key,'create-existing-'||v_key))
    or exists(select 1 from public.shared_companies where name in ('ADM004 source '||v_key,'ADM006 destination '||v_key,'ADM004 created '||v_key)) then
    raise exception 'SMOKE_ROLLBACK_LEFT_FIXTURES';
  end if;
end $smoke$;

-- Reversible ADM-004/006 fiscal-section smoke. Run only after migration 363.
-- The inner exception deliberately rolls all fixtures back.
do $smoke$
declare
  v_org uuid; v_actor uuid; v_source jsonb; v_destination jsonb; v_mixed jsonb;
  v_created jsonb; v_result jsonb; v_replay jsonb; v_mixed_result jsonb;
  v_source_version integer; v_destination_version integer;
  v_key text:=gen_random_uuid()::text;
begin
  begin
    select o.id,m.user_id into v_org,v_actor
    from public.organizations o
    join public.organization_memberships m on m.organization_id=o.id and m.status='active'
    join public.organization_roles r on r.id=m.role_id and r.status='active'
    join public.organization_role_permissions rp on rp.role_id=r.id
      and rp.permission_code in ('companies.read','companies.create','companies.update')
    where o.status='active' and o.legacy_tenant_id is not null
      and not exists(select 1 from public.organization_user_security s
        where s.organization_id=o.id and s.user_id=m.user_id)
    group by o.id,m.user_id having count(distinct rp.permission_code)=3 limit 1;
    if not found then raise exception 'SMOKE_NO_UNRESTRICTED_AUTHORIZED_ACTOR'; end if;

    v_source:=public.create_native_company_with_person_nature(v_actor,v_org,
      'copy-fiscal-source-'||v_key,'Fiscal source '||v_key,null,null,'VE','kiosk','juridical');
    v_destination:=public.create_native_company_with_person_nature(v_actor,v_org,
      'copy-fiscal-dest-'||v_key,'Fiscal destination '||v_key,null,null,'VE','standard','natural');
    perform public.configure_native_company_fiscal_profile(v_actor,v_org,v_source->>'id',
      (v_source->>'version')::integer,'copy-fiscal-config-'||v_key,'Smoke source profile',
      'Caracas, Venezuela','especial');
    select version into v_source_version from public.shared_companies where id=v_source->>'id';
    v_destination_version:=(v_destination->>'version')::integer;

    v_result:=public.copy_native_company_configuration(v_actor,v_org,v_source->>'id',v_source_version,
      v_destination->>'id',v_destination_version,null,null,null,null,
      'copy-fiscal-existing-'||v_key,jsonb_build_array('fiscal_profile'));
    v_replay:=public.copy_native_company_configuration(v_actor,v_org,v_source->>'id',v_source_version,
      v_destination->>'id',v_destination_version,null,null,null,null,
      'copy-fiscal-existing-'||v_key,jsonb_build_array('fiscal_profile'));
    if v_result is distinct from v_replay
      or (select address from public.shared_companies where id=v_destination->>'id')<>'Caracas, Venezuela'
      or (select taxpayer_type from public.shared_companies where id=v_destination->>'id')<>'especial'
      or (select person_nature from public.shared_companies where id=v_destination->>'id')<>'natural'
      or (select name from public.shared_companies where id=v_destination->>'id')<>('Fiscal destination '||v_key)
      or (v_result->'copied_sections')<>jsonb_build_array('fiscal_profile')
    then raise exception 'SMOKE_FISCAL_COPY_FAILED'; end if;
    if (select count(*) from public.shared_company_fiscal_profile_events
      where company_id=v_destination->>'id')<>1 then raise exception 'SMOKE_FISCAL_COPY_EVENT_MISSING'; end if;

    v_mixed:=public.create_native_company_with_person_nature(v_actor,v_org,
      'copy-fiscal-mixed-'||v_key,'Fiscal mixed '||v_key,null,null,'VE','standard','natural');
    v_mixed_result:=public.copy_native_company_configuration(v_actor,v_org,v_source->>'id',v_source_version,
      v_mixed->>'id',(v_mixed->>'version')::integer,null,null,null,null,
      'copy-fiscal-mixed-'||v_key,jsonb_build_array('operating_profile','fiscal_profile'));
    if (select operating_profile from public.shared_companies where id=v_mixed->>'id')<>'kiosk'
      or (select address from public.shared_companies where id=v_mixed->>'id')<>'Caracas, Venezuela'
      or (v_mixed_result->'company'->>'version')::integer<>3
    then raise exception 'SMOKE_MIXED_COPY_FAILED'; end if;
    v_mixed_result:=public.copy_native_company_configuration(v_actor,v_org,v_source->>'id',v_source_version,
      v_mixed->>'id',3,null,null,null,null,
      'copy-fiscal-unchanged-'||v_key,jsonb_build_array('fiscal_profile'));
    if (v_mixed_result->'company'->>'version')::integer<>3
      or (select count(*) from public.shared_company_fiscal_profile_events where company_id=v_mixed->>'id')<>1
    then raise exception 'SMOKE_UNCHANGED_FISCAL_COPY_FAILED'; end if;

    begin
      perform public.copy_native_company_configuration(v_actor,v_org,v_source->>'id',v_source_version,
        v_destination->>'id',v_destination_version,null,null,null,null,
        'copy-fiscal-existing-'||v_key,jsonb_build_array('operating_profile'));
      raise exception 'SMOKE_EXPECTED_IDEMPOTENCY_CONFLICT';
    exception when raise_exception then
      if sqlerrm<>'COMPANY_CONFIGURATION_COPY_IDEMPOTENCY_CONFLICT' then raise; end if;
    end;

    v_created:=public.create_native_company_from_existing(v_actor,v_org,v_source->>'id',v_source_version,
      null,null,'copy-fiscal-created-'||v_key,jsonb_build_array('fiscal_profile'),
      jsonb_build_object('legalName','Fiscal created '||v_key,'tradeName',null,'taxId',null,
        'country','VE','personNature','natural'));
    if (select address from public.shared_companies where id=v_created->'company'->>'id')<>'Caracas, Venezuela'
      or (select taxpayer_type from public.shared_companies where id=v_created->'company'->>'id')<>'especial'
      or (select person_nature from public.shared_companies where id=v_created->'company'->>'id')<>'natural'
      or (v_created->'company'->>'version')::integer<>2
    then raise exception 'SMOKE_FISCAL_CREATE_FAILED'; end if;
    v_replay:=public.create_native_company_from_existing(v_actor,v_org,v_source->>'id',v_source_version,
      null,null,'copy-fiscal-created-'||v_key,jsonb_build_array('fiscal_profile'),
      jsonb_build_object('legalName','Fiscal created '||v_key,'tradeName',null,'taxId',null,
        'country','VE','personNature','natural'));
    if v_created is distinct from v_replay then raise exception 'SMOKE_FISCAL_CREATE_REPLAY_FAILED'; end if;
    if (select count(*) from public.shared_company_configuration_copy_events e
      where e.destination_company_id in (v_destination->>'id',v_created->'company'->>'id')
        and e.copied_sections=jsonb_build_array('fiscal_profile'))<>2
    then raise exception 'SMOKE_COPY_EVENT_MISSING'; end if;

    raise exception 'SMOKE_ROLLBACK';
  exception when raise_exception then
    if sqlerrm='SMOKE_ROLLBACK' then null; else raise; end if;
  end;
  if exists(select 1 from public.shared_companies
    where name in ('Fiscal source '||v_key,'Fiscal destination '||v_key,
      'Fiscal mixed '||v_key,'Fiscal created '||v_key))
    or exists(select 1 from public.shared_company_configuration_copy_requests
      where idempotency_key in ('copy-fiscal-existing-'||v_key,'copy-fiscal-created-'||v_key,
        'copy-fiscal-mixed-'||v_key,'copy-fiscal-unchanged-'||v_key))
  then raise exception 'SMOKE_ROLLBACK_LEFT_FIXTURES'; end if;
end $smoke$;

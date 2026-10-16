-- ADM-024 RPC/security smoke. A deliberate subtransaction rollback leaves no
-- company or logo metadata fixture in the development database.
do $smoke$
declare
    v_org uuid;
    v_actor uuid;
    v_tenant uuid;
    v_company_id text;
    v_company_name text;
    v_create jsonb;
    v_saved jsonb;
    v_replay jsonb;
    v_removed jsonb;
    v_logo_url text;
    v_admin_events integer;
    v_logo_events integer;
    v_anonymous_write_policy boolean;
    v_authenticated_write_policy boolean;
begin
    begin
        select o.id,m.user_id,o.legacy_tenant_id
        into v_org,v_actor,v_tenant
        from public.organizations o
        join public.organization_memberships m on m.organization_id=o.id and m.status='active'
        join public.organization_roles r on r.id=m.role_id and r.organization_id=o.id and r.status='active'
        join public.organization_role_permissions rp on rp.role_id=r.id
            and rp.permission_code in ('companies.create','companies.read','companies.update')
        where o.status='active' and o.legacy_tenant_id is not null
        group by o.id,m.user_id,o.legacy_tenant_id
        having count(distinct rp.permission_code)=3
        order by o.id,m.user_id limit 1;
        if not found then raise exception 'SMOKE_NO_AUTHORIZED_ACTOR'; end if;

        v_company_name := 'ADM024 rollback smoke '||gen_random_uuid()::text;
        v_create := public.create_native_company(v_actor,v_org,'adm024-smoke-'||gen_random_uuid()::text,
            v_company_name,null,null,'VE','standard');
        v_company_id := v_create->>'id';
        v_logo_url := 'https://example.supabase.co/storage/v1/object/public/company-logos/'
            ||v_org::text||'/'||encode(convert_to(v_company_id,'UTF8'),'hex')||'/'
            ||gen_random_uuid()::text||'.png';
        if v_create->>'logo_url' is not null then raise exception 'SMOKE_NEW_COMPANY_LOGO_NOT_EMPTY'; end if;

        v_saved := public.update_native_company_logo(v_actor,v_org,v_company_id,1,v_logo_url);
        if v_saved->>'logo_url' is distinct from v_logo_url
            or (v_saved->>'version')::integer<>2 then raise exception 'SMOKE_LOGO_UPDATE_FAILED'; end if;
        v_replay := public.update_native_company_logo(v_actor,v_org,v_company_id,2,v_logo_url);
        if v_replay is distinct from v_saved then raise exception 'SMOKE_SAME_LOGO_REPLAY_FAILED'; end if;
        select count(*) into v_admin_events from public.shared_company_administration_events
        where organization_id=v_org and company_id=v_company_id and action='logo_updated';
        select count(*) into v_logo_events from public.shared_company_logo_events
        where organization_id=v_org and company_id=v_company_id
            and actor_user_id=v_actor and company_version=2 and logo_url=v_logo_url;
        if v_admin_events<>1 or v_logo_events<>1 then raise exception 'SMOKE_LOGO_AUDIT_FAILED'; end if;
        begin
            update public.shared_company_logo_events set logo_url=null
            where organization_id=v_org and company_id=v_company_id;
            raise exception 'SMOKE_EXPECTED_IMMUTABLE_EVENT_NOT_RAISED';
        exception when others then
            if sqlerrm<>'COMPANY_LOGO_EVENT_IMMUTABLE' then raise; end if;
        end;

        begin
            perform public.update_native_company_logo(v_actor,v_org,v_company_id,2,
                'https://example.supabase.co/storage/v1/object/public/company-logos/'
                ||v_org::text||'/wrong-company/'||gen_random_uuid()::text||'.png');
            raise exception 'SMOKE_EXPECTED_INVALID_LOGO_NOT_RAISED';
        exception when others then
            if sqlerrm<>'COMPANY_LOGO_INVALID' then raise; end if;
        end;
        begin
            perform public.update_native_company_logo(v_actor,v_org,v_company_id,1,null);
            raise exception 'SMOKE_EXPECTED_VERSION_CONFLICT_NOT_RAISED';
        exception when others then
            if sqlerrm<>'COMPANY_VERSION_CONFLICT' then raise; end if;
        end;
        begin
            perform public.update_native_company_logo(gen_random_uuid(),v_org,v_company_id,2,null);
            raise exception 'SMOKE_EXPECTED_ACCESS_DENIED_NOT_RAISED';
        exception when others then
            if sqlerrm<>'COMPANY_ACCESS_DENIED' then raise; end if;
        end;

        v_removed := public.update_native_company_logo(v_actor,v_org,v_company_id,2,null);
        if v_removed->>'logo_url' is not null or (v_removed->>'version')::integer<>3 then
            raise exception 'SMOKE_LOGO_REMOVAL_FAILED'; end if;
        select count(*) into v_admin_events from public.shared_company_administration_events
        where organization_id=v_org and company_id=v_company_id and action='logo_updated';
        select count(*) into v_logo_events from public.shared_company_logo_events
        where organization_id=v_org and company_id=v_company_id and company_version=3
            and previous_logo_url=v_logo_url and logo_url is null;
        if v_admin_events<>2 or v_logo_events<>1 then raise exception 'SMOKE_LOGO_REMOVAL_AUDIT_FAILED'; end if;

        if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
            and policyname='company_logos_public_read' and cmd='SELECT'
            and roles @> array['public']::name[] and qual like '%company-logos%')
        then raise exception 'SMOKE_PUBLIC_READ_POLICY_MISSING'; end if;
        select exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
            and cmd in ('INSERT','ALL') and (roles @> array['anon']::name[] or roles @> array['public']::name[])
            and coalesce(with_check,'') like '%company-logos%'),
            exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
            and cmd in ('INSERT','ALL') and roles @> array['authenticated']::name[]
            and coalesce(with_check,'') like '%company-logos%')
        into v_anonymous_write_policy,v_authenticated_write_policy;
        if v_anonymous_write_policy or v_authenticated_write_policy then
            raise exception 'SMOKE_CLIENT_UPLOAD_POLICY_PRESENT'; end if;
        if has_table_privilege('anon','public.shared_company_logo_events','SELECT')
            or has_table_privilege('authenticated','public.shared_company_logo_events','SELECT')
            or has_function_privilege('authenticated',
                'public.update_native_company_logo(uuid,uuid,text,integer,text)','EXECUTE')
        then raise exception 'SMOKE_PRIVATE_LOGO_ACCESS_LEAK'; end if;
        if not (select relrowsecurity from pg_class where oid='public.shared_company_logo_events'::regclass)
        then raise exception 'SMOKE_LOGO_EVENTS_RLS_MISSING'; end if;
        if not exists(select 1 from storage.buckets where id='company-logos' and public
            and file_size_limit=5242880 and allowed_mime_types @> array['image/png','image/jpeg','image/webp'])
        then raise exception 'SMOKE_LOGO_BUCKET_CONFIGURATION_INVALID'; end if;

        raise exception using errcode='ZX002',message='ADM024_SMOKE_ROLLBACK';
    exception when sqlstate 'ZX002' then
        null;
    end;

    if exists(select 1 from public.shared_companies where id=v_company_id)
        or exists(select 1 from public.shared_company_logo_events where company_id=v_company_id)
        or exists(select 1 from public.shared_company_administration_events
            where company_id=v_company_id and action='logo_updated')
    then raise exception 'SMOKE_ROLLBACK_LEFT_LOGO_FIXTURE'; end if;
    raise notice 'ADM024 smoke passed; logo metadata and company fixtures rolled back';
end;
$smoke$;

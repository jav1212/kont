-- Regression assertions for the document organization compatibility trigger.
-- Uses existing production identities only and rolls every fixture change back.
begin;

do $$
declare
    v_tenant uuid;
    v_organization uuid;
    v_company text;
    v_user uuid;
    v_other_tenant uuid;
    v_other_organization uuid;
    v_root_id text := gen_random_uuid()::text;
    v_child_id text := gen_random_uuid()::text;
    v_document_id text := gen_random_uuid()::text;
    v_native_folder_id text := gen_random_uuid()::text;
    v_native_document_id text := gen_random_uuid()::text;
    v_replicated_root_id text := gen_random_uuid()::text;
    v_folder_count integer;
begin
    select company.tenant_id, company.organization_id, company.id, company.tenant_id
      into v_tenant, v_organization, v_company, v_user
      from public.shared_companies company
      join public.organizations organization
        on organization.id = company.organization_id
       and organization.legacy_tenant_id = company.tenant_id
     limit 1;

    if v_tenant is null then
        raise exception 'Fixture requires a company with a mapped organization';
    end if;

    select organization.legacy_tenant_id, organization.id
      into v_other_tenant, v_other_organization
      from public.organizations organization
     where organization.legacy_tenant_id is not null
       and organization.legacy_tenant_id <> v_tenant
     limit 1;

    if v_other_tenant is null then
        raise exception 'Fixture requires a second mapped tenant';
    end if;

    -- Legacy Web inserts omit organization_id. Root folders, children, and
    -- file metadata must derive it from tenant_id without changing ownership.
    insert into public.shared_document_folders
        (tenant_id, id, parent_id, name, company_id, created_by)
    values
        (v_tenant, v_root_id, null, 'Organization compatibility root', v_company, v_user::text);

    insert into public.shared_document_folders
        (tenant_id, id, parent_id, name, company_id, created_by)
    values
        (v_tenant, v_child_id, v_root_id, 'Organization compatibility child', v_company, v_user::text);

    insert into public.shared_documents
        (tenant_id, id, folder_id, company_id, name, storage_path, uploaded_by)
    values
        (v_tenant, v_document_id, v_child_id, v_company, 'Organization compatibility file',
         'compatibility/' || gen_random_uuid()::text, v_user::text);

    select count(*)
      into v_folder_count
      from public.shared_document_folders
     where tenant_id = v_tenant
       and id in (v_root_id, v_child_id)
       and organization_id = v_organization;

    if v_folder_count <> 2
       or not exists (
           select 1 from public.shared_document_folders
            where tenant_id = v_tenant and id = v_root_id
              and parent_id is null and company_id = v_company
              and created_by = v_user::text and organization_id = v_organization
       )
       or not exists (
           select 1 from public.shared_document_folders
            where tenant_id = v_tenant and id = v_child_id and parent_id = v_root_id
              and company_id = v_company and created_by = v_user::text
              and organization_id = v_organization
       )
       or not exists (
        select 1 from public.shared_documents
         where tenant_id = v_tenant and id = v_document_id
           and folder_id = v_child_id and company_id = v_company
           and uploaded_by = v_user::text and organization_id = v_organization
       ) then
        raise exception 'Legacy document writes did not preserve identity while assigning organization';
    end if;

    -- Native writes supply the mapped organization explicitly and remain valid.
    insert into public.shared_document_folders
        (tenant_id, id, organization_id, parent_id, name, company_id, created_by)
    values
        (v_tenant, v_native_folder_id, v_organization, null,
         'Organization compatibility native folder', v_company, v_user::text);

    insert into public.shared_documents
        (tenant_id, id, organization_id, folder_id, company_id, name, storage_path, uploaded_by)
    values
        (v_tenant, v_native_document_id, v_organization, v_native_folder_id, v_company,
         'Organization compatibility native file', 'compatibility/' || gen_random_uuid()::text, v_user::text);

    -- Updating organization_id to NULL follows the same legacy compatibility
    -- rule; a valid mapped native identity remains unchanged.
    update public.shared_document_folders
       set organization_id = null
     where tenant_id = v_tenant and id = v_native_folder_id;
    update public.shared_documents
       set organization_id = null
     where tenant_id = v_tenant and id = v_native_document_id;

    if not exists (
        select 1 from public.shared_document_folders
         where tenant_id = v_tenant and id = v_native_folder_id
           and organization_id = v_organization
    ) or not exists (
        select 1 from public.shared_documents
         where tenant_id = v_tenant and id = v_native_document_id
           and organization_id = v_organization
    ) then
        raise exception 'Null organization update did not restore the mapped organization';
    end if;

    -- Folder replication may keep the actor while moving to another tenant.
    -- Its organization must come from the destination tenant, not the actor.
    insert into public.shared_document_folders
        (tenant_id, id, parent_id, name, created_by)
    values
        (v_other_tenant, v_replicated_root_id, null,
         'Organization compatibility replicated root', v_user::text);

    if not exists (
        select 1 from public.shared_document_folders
         where tenant_id = v_other_tenant and id = v_replicated_root_id
           and organization_id = v_other_organization and created_by = v_user::text
    ) then
        raise exception 'Replicated folder did not use the destination organization';
    end if;

    -- A parent folder from another tenant cannot be replicated across tenants.
    begin
        insert into public.shared_document_folders
            (tenant_id, id, parent_id, name, created_by)
        values
            (v_other_tenant, gen_random_uuid()::text, v_root_id,
             'Organization compatibility cross-tenant child', v_other_tenant::text);
        raise exception 'Cross-tenant folder parent unexpectedly succeeded';
    exception when foreign_key_violation then
        null;
    end;

    -- An explicit organization may never be used with another tenant, for
    -- folders or document metadata, on either insert or update.
    begin
        insert into public.shared_document_folders
            (tenant_id, id, organization_id, parent_id, name, created_by)
        values
            (v_tenant, gen_random_uuid()::text, v_other_organization, null,
             'Organization compatibility mismatched folder', v_user::text);
        raise exception 'Mismatched organization and tenant unexpectedly succeeded';
    exception when check_violation then
        if sqlerrm <> 'DOCUMENT_ORGANIZATION_TENANT_MISMATCH' then
            raise;
        end if;
    end;

    begin
        update public.shared_document_folders
           set organization_id = v_other_organization
         where tenant_id = v_tenant and id = v_native_folder_id;
        raise exception 'Mismatched folder organization update unexpectedly succeeded';
    exception when check_violation then
        if sqlerrm <> 'DOCUMENT_ORGANIZATION_TENANT_MISMATCH' then
            raise;
        end if;
    end;

    begin
        update public.shared_documents
           set organization_id = v_other_organization
         where tenant_id = v_tenant and id = v_native_document_id;
        raise exception 'Mismatched document organization update unexpectedly succeeded';
    exception when check_violation then
        if sqlerrm <> 'DOCUMENT_ORGANIZATION_TENANT_MISMATCH' then
            raise;
        end if;
    end;

    -- A tenant without an organization mapping must fail explicitly instead of
    -- relying on the later NOT NULL violation. The enclosing transaction
    -- restores this temporary mapping removal.
    update public.organizations
       set legacy_tenant_id = null
     where id = v_other_organization;

    begin
        insert into public.shared_document_folders
            (tenant_id, id, parent_id, name, created_by)
        values
            (v_other_tenant, gen_random_uuid()::text, null,
             'Organization compatibility unmapped folder', v_other_tenant::text);
        raise exception 'Unmapped tenant unexpectedly accepted a folder';
    exception when check_violation then
        if sqlerrm <> 'DOCUMENT_ORGANIZATION_MAPPING_MISSING' then
            raise;
        end if;
    end;
end;
$$;

-- The SECURITY DEFINER trigger may resolve the mapping, but it must not grant
-- an unauthenticated authenticated-role session permission to write documents.
select set_config('document_compatibility.test_tenant_id', company.tenant_id::text, true)
  from public.shared_companies company
  join public.organizations organization
    on organization.id = company.organization_id
   and organization.legacy_tenant_id = company.tenant_id
 limit 1;

set local role authenticated;
set local request.jwt.claims = '{}';

do $$
declare
    v_tenant uuid := current_setting('document_compatibility.test_tenant_id')::uuid;
begin
    begin
        insert into public.shared_document_folders
            (tenant_id, id, parent_id, name, created_by)
        values
            (v_tenant, md5(clock_timestamp()::text), null,
             'Organization compatibility RLS denial', v_tenant::text);
        raise exception 'Unauthenticated authenticated role unexpectedly created a folder';
    exception when insufficient_privilege then
        if position('row-level security' in sqlerrm) = 0 then
            raise;
        end if;
    end;
end;
$$;

reset role;
rollback;

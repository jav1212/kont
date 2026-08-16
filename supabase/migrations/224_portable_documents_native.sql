-- Portable Documents capability over the shared production model.
-- Existing Web tables/routes remain valid; native clients use organization-scoped RPCs.

alter table public.shared_document_folders add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.shared_document_folders add column if not exists version integer not null default 1 check(version>0);
alter table public.shared_documents add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.shared_documents add column if not exists version integer not null default 1 check(version>0);
update public.shared_document_folders f set organization_id=o.id from public.organizations o where o.legacy_tenant_id=f.tenant_id and f.organization_id is null;
update public.shared_documents d set organization_id=o.id from public.organizations o where o.legacy_tenant_id=d.tenant_id and d.organization_id is null;
alter table public.shared_document_folders alter column organization_id set not null;
alter table public.shared_documents alter column organization_id set not null;
create index if not exists shared_document_folders_organization_idx on public.shared_document_folders(organization_id,company_id,parent_id);
create index if not exists shared_documents_organization_idx on public.shared_documents(organization_id,company_id,folder_id);

alter table public.module_catalog drop constraint if exists module_catalog_code_check;
alter table public.module_catalog add constraint module_catalog_code_check check(code in('payroll','inventory','accounting','purchases','sales','tools','companies','documents'));
insert into public.module_catalog(code,name,status,supported_platforms) values('documents','Documentos','active',array['web','desktop','mobile']) on conflict(code)do update set supported_platforms=excluded.supported_platforms;
insert into public.module_capabilities(module_id,capability_code) select id,'documents.files' from public.module_catalog where code='documents' on conflict do nothing;
insert into public.organization_module_entitlements(organization_id,module_id,module_code,source_type,source_id,status,valid_from)
select o.id,m.id,m.code,'platform_default','documents','active',now() from public.organizations o cross join public.module_catalog m where m.code='documents' on conflict do nothing;
insert into public.organization_module_installations(organization_id,module_id,status,installed_at,activated_at)
select o.id,m.id,'active',now(),now() from public.organizations o cross join public.module_catalog m where m.code='documents' on conflict do nothing;

create or replace function public.list_document_folders_native(p_organization_id uuid,p_company_id text,p_filter_company boolean)
returns setof public.shared_document_folders language sql stable security definer set search_path=public as $$
 select * from public.shared_document_folders where organization_id=p_organization_id
 and(not p_filter_company or company_id is not distinct from p_company_id) order by name,id
$$;
create or replace function public.list_documents_native(p_organization_id uuid,p_company_id text,p_filter_company boolean,p_folder_id text,p_filter_folder boolean)
returns setof public.shared_documents language sql stable security definer set search_path=public as $$
 select * from public.shared_documents where organization_id=p_organization_id
 and(not p_filter_company or company_id is not distinct from p_company_id)
 and(not p_filter_folder or folder_id is not distinct from p_folder_id) order by created_at desc,id
$$;
create or replace function public.create_document_folder_native(p_organization_id uuid,p_company_id text,p_parent_id text,p_name text,p_created_by uuid)
returns public.shared_document_folders language plpgsql security definer set search_path=public as $$
declare v_tenant uuid;v_parent_company text;v_row public.shared_document_folders%rowtype;
begin
 select legacy_tenant_id into v_tenant from public.organizations where id=p_organization_id and status='active';if v_tenant is null then raise exception 'DOCUMENT_INVALID';end if;
 if p_company_id is not null and not exists(select 1 from public.shared_companies where tenant_id=v_tenant and organization_id=p_organization_id and id=p_company_id)then raise exception 'DOCUMENT_OUTSIDE_COMPANY';end if;
 if p_parent_id is not null then select company_id into v_parent_company from public.shared_document_folders where tenant_id=v_tenant and id=p_parent_id;if not found then raise exception 'DOCUMENT_FOLDER_NOT_FOUND';end if;if v_parent_company is distinct from p_company_id then raise exception 'DOCUMENT_OUTSIDE_COMPANY';end if;end if;
 insert into public.shared_document_folders(tenant_id,id,organization_id,parent_id,name,company_id,created_by)values(v_tenant,gen_random_uuid()::text,p_organization_id,p_parent_id,trim(p_name),p_company_id,p_created_by::text)returning * into v_row;return v_row;
end $$;
create or replace function public.rename_document_folder_native(p_organization_id uuid,p_folder_id text,p_name text,p_expected_version integer)
returns public.shared_document_folders language plpgsql security definer set search_path=public as $$
declare v_row public.shared_document_folders%rowtype;begin update public.shared_document_folders set name=trim(p_name),version=version+1,updated_at=now()where organization_id=p_organization_id and id=p_folder_id and version=p_expected_version returning * into v_row;if not found then raise exception 'DOCUMENT_FOLDER_VERSION_CONFLICT';end if;return v_row;end $$;
create or replace function public.delete_document_folder_native(p_organization_id uuid,p_folder_id text,p_expected_version integer)
returns void language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.shared_document_folders where organization_id=p_organization_id and parent_id=p_folder_id)or exists(select 1 from public.shared_documents where organization_id=p_organization_id and folder_id=p_folder_id)then raise exception 'DOCUMENT_FOLDER_NOT_EMPTY';end if;
 delete from public.shared_document_folders where organization_id=p_organization_id and id=p_folder_id and version=p_expected_version;if not found then raise exception 'DOCUMENT_FOLDER_VERSION_CONFLICT';end if;
end $$;
create or replace function public.register_document_native(p_organization_id uuid,p_company_id text,p_folder_id text,p_name text,p_storage_path text,p_mime_type text,p_size_bytes bigint,p_uploaded_by uuid)
returns public.shared_documents language plpgsql security definer set search_path=public as $$
declare v_tenant uuid;v_folder_company text;v_row public.shared_documents%rowtype;
begin
 select legacy_tenant_id into v_tenant from public.organizations where id=p_organization_id and status='active';if v_tenant is null then raise exception 'DOCUMENT_INVALID';end if;
 if p_company_id is not null and not exists(select 1 from public.shared_companies where tenant_id=v_tenant and organization_id=p_organization_id and id=p_company_id)then raise exception 'DOCUMENT_OUTSIDE_COMPANY';end if;
 if p_folder_id is not null then select company_id into v_folder_company from public.shared_document_folders where tenant_id=v_tenant and id=p_folder_id;if not found then raise exception 'DOCUMENT_FOLDER_NOT_FOUND';end if;if v_folder_company is distinct from p_company_id then raise exception 'DOCUMENT_OUTSIDE_COMPANY';end if;end if;
 if p_size_bytes is not null and(p_size_bytes<0 or p_size_bytes>52428800)then raise exception 'DOCUMENT_INVALID';end if;
 insert into public.shared_documents(tenant_id,id,organization_id,folder_id,company_id,name,storage_path,mime_type,size_bytes,uploaded_by)values(v_tenant,gen_random_uuid()::text,p_organization_id,p_folder_id,p_company_id,trim(p_name),p_storage_path,p_mime_type,p_size_bytes,p_uploaded_by::text)returning * into v_row;return v_row;
end $$;
create or replace function public.move_document_native(p_organization_id uuid,p_document_id text,p_folder_id text,p_expected_version integer)
returns public.shared_documents language plpgsql security definer set search_path=public as $$
declare v_company text;v_target_company text;v_row public.shared_documents%rowtype;
begin select company_id into v_company from public.shared_documents where organization_id=p_organization_id and id=p_document_id;if not found then raise exception 'DOCUMENT_NOT_FOUND';end if;
if p_folder_id is not null then select company_id into v_target_company from public.shared_document_folders where organization_id=p_organization_id and id=p_folder_id;if not found then raise exception 'DOCUMENT_FOLDER_NOT_FOUND';end if;if v_target_company is distinct from v_company then raise exception 'DOCUMENT_OUTSIDE_COMPANY';end if;end if;
update public.shared_documents set folder_id=p_folder_id,version=version+1,updated_at=now()where organization_id=p_organization_id and id=p_document_id and version=p_expected_version returning * into v_row;if not found then raise exception 'DOCUMENT_VERSION_CONFLICT';end if;return v_row;end $$;
create or replace function public.delete_document_native(p_organization_id uuid,p_document_id text,p_expected_version integer)
returns void language plpgsql security definer set search_path=public as $$ begin delete from public.shared_documents where organization_id=p_organization_id and id=p_document_id and version=p_expected_version;if not found then raise exception 'DOCUMENT_VERSION_CONFLICT';end if;end $$;

revoke all on function public.list_document_folders_native(uuid,text,boolean),public.list_documents_native(uuid,text,boolean,text,boolean),public.create_document_folder_native(uuid,text,text,text,uuid),public.rename_document_folder_native(uuid,text,text,integer),public.delete_document_folder_native(uuid,text,integer),public.register_document_native(uuid,text,text,text,text,text,bigint,uuid),public.move_document_native(uuid,text,text,integer),public.delete_document_native(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.list_document_folders_native(uuid,text,boolean),public.list_documents_native(uuid,text,boolean,text,boolean),public.create_document_folder_native(uuid,text,text,text,uuid),public.rename_document_folder_native(uuid,text,text,integer),public.delete_document_folder_native(uuid,text,integer),public.register_document_native(uuid,text,text,text,text,text,bigint,uuid),public.move_document_native(uuid,text,text,integer),public.delete_document_native(uuid,text,integer) to service_role;

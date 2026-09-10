-- Keep the legacy Web document routes compatible with the organization-owned
-- document schema introduced by 224. Native callers already supply an
-- organization_id; legacy callers still supply only tenant_id.
create or replace function public.assign_shared_document_organization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_organization_id uuid;
begin
    select organization.id
      into v_organization_id
      from public.organizations organization
     where organization.legacy_tenant_id = new.tenant_id;

    if v_organization_id is null then
        raise exception using
            errcode = '23514',
            message = 'DOCUMENT_ORGANIZATION_MAPPING_MISSING',
            detail = format('No organization is mapped to tenant %s.', new.tenant_id);
    end if;

    if new.organization_id is null then
        new.organization_id := v_organization_id;
    elsif new.organization_id is distinct from v_organization_id then
        raise exception using
            errcode = '23514',
            message = 'DOCUMENT_ORGANIZATION_TENANT_MISMATCH',
            detail = format(
                'Organization %s does not belong to tenant %s.',
                new.organization_id,
                new.tenant_id
            );
    end if;

    return new;
end;
$$;

-- The function reads organization mappings under fixed, definer-controlled
-- privileges so RLS cannot make a valid legacy write fail. This migration adds
-- no direct execution permission and revokes it from ordinary application roles.
revoke all on function public.assign_shared_document_organization() from public, anon, authenticated;

drop trigger if exists shared_document_folders_assign_organization on public.shared_document_folders;
create trigger shared_document_folders_assign_organization
before insert or update of tenant_id, organization_id on public.shared_document_folders
for each row execute function public.assign_shared_document_organization();

drop trigger if exists shared_documents_assign_organization on public.shared_documents;
create trigger shared_documents_assign_organization
before insert or update of tenant_id, organization_id on public.shared_documents
for each row execute function public.assign_shared_document_organization();

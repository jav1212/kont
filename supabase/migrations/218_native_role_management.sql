create table if not exists public.access_control_role_commands (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  idempotency_key text not null,
  role_id uuid not null references public.organization_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, idempotency_key)
);
alter table public.access_control_role_commands enable row level security;

create or replace function public.access_control_role_json(p_role_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',r.id,'organization_id',r.organization_id,'code',r.code,'name',r.name,'description',r.description,'kind',r.kind,'status',r.status,'version',r.version,'organization_role_permissions',coalesce((select jsonb_agg(jsonb_build_object('permission_code',p.permission_code)) from public.organization_role_permissions p where p.role_id=r.id),'[]'::jsonb)) from public.organization_roles r where r.id=p_role_id
$$;

create or replace function public.access_control_create_role(p_organization_id uuid,p_name text,p_description text,p_permissions text[],p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_role_id uuid;v_code text;
begin
 select role_id into v_role_id from public.access_control_role_commands where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
 if v_role_id is not null then return public.access_control_role_json(v_role_id); end if;
 if trim(p_name)='' or trim(p_idempotency_key)='' then raise exception 'ROLE_INVALID'; end if;
 if exists(select 1 from unnest(p_permissions) code left join public.access_control_permissions p on p.code=code where p.code is null) then raise exception 'ROLE_INVALID'; end if;
 v_code:='custom-'||replace(gen_random_uuid()::text,'-','');
 insert into public.organization_roles(organization_id,code,name,description,kind,status) values(p_organization_id,v_code,trim(p_name),trim(p_description),'custom','active') returning id into v_role_id;
 insert into public.organization_role_permissions(role_id,permission_code) select v_role_id,code from unnest(p_permissions) code on conflict do nothing;
 insert into public.access_control_role_commands values(p_organization_id,p_idempotency_key,v_role_id,now());
 return public.access_control_role_json(v_role_id);
end $$;

create or replace function public.access_control_update_role(p_role_id uuid,p_expected_version integer,p_name text,p_description text,p_permissions text[],p_update_name boolean,p_update_description boolean,p_update_permissions boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_current integer;
begin
 select version into v_current from public.organization_roles where id=p_role_id and kind='custom' and status='active' for update;
 if v_current is null then raise exception 'ROLE_NOT_FOUND'; end if;
 if v_current<>p_expected_version then raise exception 'ROLE_VERSION_CONFLICT'; end if;
 if p_update_permissions and exists(select 1 from unnest(p_permissions) code left join public.access_control_permissions p on p.code=code where p.code is null) then raise exception 'ROLE_INVALID'; end if;
 update public.organization_roles set name=case when p_update_name then trim(p_name) else name end,description=case when p_update_description then trim(p_description) else description end,version=version+1,updated_at=now() where id=p_role_id;
 if p_update_permissions then delete from public.organization_role_permissions where role_id=p_role_id;insert into public.organization_role_permissions(role_id,permission_code)select p_role_id,code from unnest(p_permissions)code on conflict do nothing;end if;
 return public.access_control_role_json(p_role_id);
end $$;

create or replace function public.access_control_archive_role(p_role_id uuid,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
 if exists(select 1 from public.organization_memberships where role_id=p_role_id and status='active') then raise exception 'ROLE_IN_USE'; end if;
 update public.organization_roles set status='archived',version=version+1,updated_at=now() where id=p_role_id and kind='custom' and status='active' and version=p_expected_version;
 if not found then raise exception 'ROLE_VERSION_CONFLICT'; end if;
 v_result:=public.access_control_role_json(p_role_id);return v_result;
end $$;
revoke all on function public.access_control_role_json(uuid),public.access_control_create_role(uuid,text,text,text[],text),public.access_control_update_role(uuid,integer,text,text,text[],boolean,boolean,boolean),public.access_control_archive_role(uuid,integer) from public,anon,authenticated;
grant execute on function public.access_control_create_role(uuid,text,text,text[],text),public.access_control_update_role(uuid,integer,text,text,text[],boolean,boolean,boolean),public.access_control_archive_role(uuid,integer) to service_role;

alter table public.organization_memberships add column if not exists version integer not null default 1 check(version>0);
create table if not exists public.organization_invitations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 email text not null,role_id uuid not null,invited_by uuid not null references auth.users(id),token_hash text not null unique,
 status text not null default 'pending' check(status in('pending','accepted','expired','revoked')),expires_at timestamptz not null,
 version integer not null default 1 check(version>0),idempotency_key text not null,legacy_invitation_id uuid unique,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),accepted_at timestamptz,
 foreign key(organization_id,role_id)references public.organization_roles(organization_id,id)on delete restrict,
 unique(organization_id,idempotency_key)
);
create unique index if not exists organization_invitations_pending_email_idx on public.organization_invitations(organization_id,lower(email))where status='pending';
alter table public.organization_invitations enable row level security;revoke all on public.organization_invitations from anon,authenticated;

create or replace function public.organization_actor_has_permission(
 p_organization_id uuid,p_actor_user_id uuid,p_permission text
)returns boolean language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.organization_memberships m
  join public.organization_role_permissions rp on rp.role_id=m.role_id
  where m.organization_id=p_organization_id and m.user_id=p_actor_user_id
    and m.status='active' and rp.permission_code=p_permission
 )
$$;

create or replace function public.assert_organization_role_assignable(
 p_organization_id uuid,p_actor_user_id uuid,p_role_id uuid
)returns void language plpgsql stable security definer set search_path=public as $$
declare v_target_code text;v_actor_code text;
begin
 select code into v_target_code from public.organization_roles
 where id=p_role_id and organization_id=p_organization_id and status='active';
 if v_target_code is null then raise exception 'INVITATION_INVALID';end if;
 select r.code into v_actor_code from public.organization_memberships m
 join public.organization_roles r on r.id=m.role_id
 where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active';
 if v_actor_code is null or (v_target_code='owner' and v_actor_code<>'owner') then
  raise exception 'ORGANIZATION_ACCESS_DENIED';
 end if;
 if exists(
  select permission_code from public.organization_role_permissions where role_id=p_role_id
  except
  select rp.permission_code from public.organization_memberships m
  join public.organization_role_permissions rp on rp.role_id=m.role_id
  where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active'
 )then raise exception 'ORGANIZATION_ACCESS_DENIED';end if;
end $$;

create or replace function public.organization_member_json(p_membership_id uuid)returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',m.id,'kind','membership','organization_id',m.organization_id,'user_id',m.user_id,'email',coalesce(u.email::text,m.user_id::text),'display_name',p.name,'avatar_url',p.avatar_url,'role_id',r.id,'role_name',r.name,'status',m.status,'version',m.version,'joined_at',m.joined_at,'invited_at',null,'expires_at',null)
 from public.organization_memberships m join public.organization_roles r on r.id=m.role_id left join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id where m.id=p_membership_id
$$;
create or replace function public.organization_invitation_json(p_invitation_id uuid)returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',i.id,'kind','invitation','organization_id',i.organization_id,'user_id',null,'email',i.email,'display_name',null,'avatar_url',null,'role_id',r.id,'role_name',r.name,'status','invited','version',i.version,'joined_at',null,'invited_at',i.created_at,'expires_at',i.expires_at)
 from public.organization_invitations i join public.organization_roles r on r.id=i.role_id where i.id=p_invitation_id
$$;
create or replace function public.list_organization_members_native(p_organization_id uuid)returns setof jsonb language sql stable security definer set search_path=public as $$
 select public.organization_member_json(id)from public.organization_memberships where organization_id=p_organization_id and status in('active','suspended')
 union all select public.organization_invitation_json(id)from public.organization_invitations where organization_id=p_organization_id and status='pending' and expires_at>now()
$$;
create or replace function public.invite_organization_member_native(p_organization_id uuid,p_actor_user_id uuid,p_email text,p_role_id uuid,p_raw_token text,p_token_hash text,p_idempotency_key text,p_expires_at timestamptz)returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_legacy_tenant uuid;v_legacy_id uuid;v_role text;
begin select id into v_id from public.organization_invitations where organization_id=p_organization_id and idempotency_key=p_idempotency_key;if v_id is not null then return public.organization_invitation_json(v_id);end if;
if not public.organization_actor_has_permission(p_organization_id,p_actor_user_id,'members.invite')then raise exception 'ORGANIZATION_ACCESS_DENIED';end if;
if exists(select 1 from public.organization_memberships m join auth.users u on u.id=m.user_id where m.organization_id=p_organization_id and m.status='active' and lower(u.email::text)=lower(p_email))then raise exception 'INVITATION_INVALID';end if;
perform public.assert_organization_role_assignable(p_organization_id,p_actor_user_id,p_role_id);
select code into v_role from public.organization_roles where id=p_role_id;
select legacy_tenant_id into v_legacy_tenant from public.organizations where id=p_organization_id;
if v_legacy_tenant is not null then insert into public.tenant_invitations(tenant_id,invited_by,email,role,token,expires_at)values(v_legacy_tenant,p_actor_user_id,lower(p_email),case v_role when 'accountant'then'contador'when 'seller'then'vendedor'when 'cashier'then'cajero'else v_role end,p_raw_token::uuid,p_expires_at)returning id into v_legacy_id;end if;
insert into public.organization_invitations(organization_id,email,role_id,invited_by,token_hash,expires_at,idempotency_key,legacy_invitation_id)values(p_organization_id,lower(p_email),p_role_id,p_actor_user_id,p_token_hash,p_expires_at,p_idempotency_key,v_legacy_id)returning id into v_id;
return public.organization_invitation_json(v_id);exception when unique_violation then raise exception 'INVITATION_ALREADY_PENDING';end $$;
create or replace function public.update_organization_membership_native(p_organization_id uuid,p_actor_user_id uuid,p_membership_id uuid,p_role_id uuid,p_status text,p_expected_version integer,p_update_role boolean,p_update_status boolean)returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text;v_user uuid;v_legacy uuid;v_result_status text;
begin if not public.organization_actor_has_permission(p_organization_id,p_actor_user_id,'members.update')then raise exception 'ORGANIZATION_ACCESS_DENIED';end if;
if p_update_status and p_status not in('active','suspended')then raise exception 'INVITATION_INVALID';end if;
if p_update_role then perform public.assert_organization_role_assignable(p_organization_id,p_actor_user_id,p_role_id);select code into v_role from public.organization_roles where id=p_role_id;end if;
update public.organization_memberships set role_id=case when p_update_role then p_role_id else role_id end,role=case when p_update_role then v_role else role end,status=case when p_update_status then p_status else status end,version=version+1,authorization_version=authorization_version+1,updated_at=now()where id=p_membership_id and organization_id=p_organization_id and version=p_expected_version returning user_id,role into v_user,v_role;
if v_user is null then raise exception 'MEMBERSHIP_VERSION_CONFLICT';end if;select status into v_result_status from public.organization_memberships where id=p_membership_id;select legacy_tenant_id into v_legacy from public.organizations where id=p_organization_id;
if v_legacy is not null then update public.tenant_memberships set role=case v_role when'accountant'then'contador'when'seller'then'vendedor'when'cashier'then'cajero'else v_role end,revoked_at=case when v_result_status='suspended'then coalesce(revoked_at,now())else null end where tenant_id=v_legacy and member_id=v_user;end if;
return public.organization_member_json(p_membership_id);end $$;
create or replace function public.revoke_organization_membership_native(p_organization_id uuid,p_actor_user_id uuid,p_membership_id uuid,p_expected_version integer)returns void language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_legacy uuid;begin if not public.organization_actor_has_permission(p_organization_id,p_actor_user_id,'members.revoke')then raise exception 'ORGANIZATION_ACCESS_DENIED';end if;update public.organization_memberships set status='suspended',version=version+1,authorization_version=authorization_version+1,updated_at=now()where id=p_membership_id and organization_id=p_organization_id and version=p_expected_version returning user_id into v_user;if v_user is null then raise exception 'MEMBERSHIP_VERSION_CONFLICT';end if;select legacy_tenant_id into v_legacy from public.organizations where id=p_organization_id;if v_legacy is not null then update public.tenant_memberships set revoked_at=now()where tenant_id=v_legacy and member_id=v_user;end if;end $$;
revoke all on function public.organization_actor_has_permission(uuid,uuid,text),public.assert_organization_role_assignable(uuid,uuid,uuid),public.organization_member_json(uuid),public.organization_invitation_json(uuid),public.list_organization_members_native(uuid),public.invite_organization_member_native(uuid,uuid,text,uuid,text,text,text,timestamptz),public.update_organization_membership_native(uuid,uuid,uuid,uuid,text,integer,boolean,boolean),public.revoke_organization_membership_native(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_organization_members_native(uuid),public.invite_organization_member_native(uuid,uuid,text,uuid,text,text,text,timestamptz),public.update_organization_membership_native(uuid,uuid,uuid,uuid,text,integer,boolean,boolean),public.revoke_organization_membership_native(uuid,uuid,uuid,integer) to service_role;

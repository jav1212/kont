-- Makes invitation creation safely idempotent for external delivery.
-- The raw token is never persisted; callers send mail only when `created` is true.

create or replace function public.invite_organization_member_native(
 p_organization_id uuid,p_actor_user_id uuid,p_email text,p_role_id uuid,
 p_raw_token text,p_token_hash text,p_idempotency_key text,p_expires_at timestamptz
)returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_legacy_tenant uuid;v_legacy_id uuid;v_role text;
begin
 select id into v_id from public.organization_invitations
 where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
 if v_id is not null then
  return jsonb_build_object('member',public.organization_invitation_json(v_id),'created',false);
 end if;
 if not public.organization_actor_has_permission(p_organization_id,p_actor_user_id,'members.invite')then
  raise exception 'ORGANIZATION_ACCESS_DENIED';
 end if;
 if exists(select 1 from public.organization_memberships m join auth.users u on u.id=m.user_id where m.organization_id=p_organization_id and m.status='active' and lower(u.email::text)=lower(p_email))then
  raise exception 'INVITATION_INVALID';
 end if;
 perform public.assert_organization_role_assignable(p_organization_id,p_actor_user_id,p_role_id);
 select code into v_role from public.organization_roles where id=p_role_id;
 select legacy_tenant_id into v_legacy_tenant from public.organizations where id=p_organization_id;
 if v_legacy_tenant is not null then
  insert into public.tenant_invitations(tenant_id,invited_by,email,role,token,expires_at)
  values(v_legacy_tenant,p_actor_user_id,lower(p_email),case v_role when 'accountant' then 'contador' when 'seller' then 'vendedor' when 'cashier' then 'cajero' else v_role end,p_raw_token::uuid,p_expires_at)
  returning id into v_legacy_id;
 end if;
 insert into public.organization_invitations(organization_id,email,role_id,invited_by,token_hash,expires_at,idempotency_key,legacy_invitation_id)
 values(p_organization_id,lower(p_email),p_role_id,p_actor_user_id,p_token_hash,p_expires_at,p_idempotency_key,v_legacy_id)
 returning id into v_id;
 return jsonb_build_object('member',public.organization_invitation_json(v_id),'created',true);
exception when unique_violation then raise exception 'INVITATION_ALREADY_PENDING';
end $$;

revoke all on function public.invite_organization_member_native(uuid,uuid,text,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.invite_organization_member_native(uuid,uuid,text,uuid,text,text,text,timestamptz) to service_role;

create or replace function public.resend_organization_invitation_native(
 p_organization_id uuid,p_actor_user_id uuid,p_invitation_id uuid,p_raw_token text,
 p_token_hash text,p_expires_at timestamptz,p_expected_version integer
)returns jsonb language plpgsql security definer set search_path=public as $$
declare v_legacy_id uuid;
begin
 if not public.organization_actor_has_permission(p_organization_id,p_actor_user_id,'members.invite')then raise exception 'ORGANIZATION_ACCESS_DENIED';end if;
 update public.organization_invitations set token_hash=p_token_hash,expires_at=p_expires_at,version=version+1,updated_at=now()
 where id=p_invitation_id and organization_id=p_organization_id and status='pending' and version=p_expected_version
 returning legacy_invitation_id into v_legacy_id;
 if not found then raise exception 'INVITATION_VERSION_CONFLICT';end if;
 if v_legacy_id is not null then
  update public.tenant_invitations set token=p_raw_token::uuid,expires_at=p_expires_at where id=v_legacy_id and accepted_at is null;
 end if;
 return public.organization_invitation_json(p_invitation_id);
end $$;

create or replace function public.revoke_organization_invitation_native(
 p_organization_id uuid,p_actor_user_id uuid,p_invitation_id uuid,p_expected_version integer
)returns void language plpgsql security definer set search_path=public as $$
declare v_legacy_id uuid;
begin
 if not public.organization_actor_has_permission(p_organization_id,p_actor_user_id,'members.revoke')then raise exception 'ORGANIZATION_ACCESS_DENIED';end if;
 update public.organization_invitations set status='revoked',version=version+1,updated_at=now()
 where id=p_invitation_id and organization_id=p_organization_id and status='pending' and version=p_expected_version
 returning legacy_invitation_id into v_legacy_id;
 if not found then raise exception 'INVITATION_VERSION_CONFLICT';end if;
 if v_legacy_id is not null then delete from public.tenant_invitations where id=v_legacy_id and accepted_at is null;end if;
end $$;

revoke all on function public.resend_organization_invitation_native(uuid,uuid,uuid,text,text,timestamptz,integer),public.revoke_organization_invitation_native(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.resend_organization_invitation_native(uuid,uuid,uuid,text,text,timestamptz,integer),public.revoke_organization_invitation_native(uuid,uuid,uuid,integer) to service_role;

-- The frozen Web still accepts the compatible tenant invitation. Reflect that
-- acceptance into the canonical organization invitation without changing Web.
create or replace function public.sync_accepted_legacy_organization_invitation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.accepted_at is not null and old.accepted_at is null then
  update public.organization_invitations
  set status='accepted',accepted_at=new.accepted_at,version=version+1,updated_at=now()
  where legacy_invitation_id=new.id and status='pending';
 end if;
 return new;
end $$;

drop trigger if exists tenant_invitations_sync_organization_acceptance on public.tenant_invitations;
create trigger tenant_invitations_sync_organization_acceptance
after update of accepted_at on public.tenant_invitations
for each row execute function public.sync_accepted_legacy_organization_invitation();

revoke all on function public.sync_accepted_legacy_organization_invitation() from public,anon,authenticated;

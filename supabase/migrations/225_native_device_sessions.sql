-- Native session metadata and revocation. No access or refresh tokens are stored.
create table if not exists public.native_device_sessions(
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 client text not null check(client in('web','desktop','mobile')),
 device_name text check(device_name is null or length(device_name)<=160),
 operating_system text check(operating_system is null or length(operating_system)<=160),
 created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 revoked_at timestamptz,
 updated_at timestamptz not null default now()
);
create index if not exists native_device_sessions_user_active_idx on public.native_device_sessions(user_id,last_seen_at desc)where revoked_at is null;
alter table public.native_device_sessions enable row level security;
revoke all on public.native_device_sessions from anon,authenticated;

create or replace function public.observe_native_device_session(p_session_id uuid,p_user_id uuid,p_client text,p_device_name text,p_operating_system text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_revoked timestamptz;
begin
 if p_client not in('web','desktop','mobile')then raise exception 'SESSION_NOT_FOUND';end if;
 if not exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id)then raise exception 'SESSION_NOT_FOUND';end if;
 select revoked_at into v_revoked from public.native_device_sessions where id=p_session_id;
 if found and v_revoked is not null then raise exception 'SESSION_REVOKED';end if;
 insert into public.native_device_sessions(id,user_id,client,device_name,operating_system)
 values(p_session_id,p_user_id,p_client,nullif(trim(p_device_name),''),nullif(trim(p_operating_system),''))
 on conflict(id)do update set
  client=excluded.client,
  device_name=coalesce(excluded.device_name,native_device_sessions.device_name),
  operating_system=coalesce(excluded.operating_system,native_device_sessions.operating_system),
  last_seen_at=case when native_device_sessions.last_seen_at<now()-interval '5 minutes'then now()else native_device_sessions.last_seen_at end,
  updated_at=case when native_device_sessions.last_seen_at<now()-interval '5 minutes'then now()else native_device_sessions.updated_at end;
end $$;

create or replace function public.list_native_device_sessions(p_user_id uuid)
returns setof public.native_device_sessions language sql stable security definer set search_path=public,auth as $$
 select native_session.*
 from public.native_device_sessions native_session
 where native_session.user_id=p_user_id
  and native_session.revoked_at is null
  and exists(
   select 1 from auth.sessions provider_session
   where provider_session.id=native_session.id and provider_session.user_id=native_session.user_id
  )
 order by native_session.last_seen_at desc,native_session.id
$$;

create or replace function public.revoke_native_device_session(p_user_id uuid,p_session_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
 update public.native_device_sessions set revoked_at=now(),updated_at=now()where id=p_session_id and user_id=p_user_id and revoked_at is null;
 if not found then raise exception 'SESSION_NOT_FOUND';end if;
 delete from auth.sessions where id=p_session_id and user_id=p_user_id;
end $$;

create or replace function public.revoke_other_native_device_sessions(p_user_id uuid,p_current_session_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
 if not exists(select 1 from public.native_device_sessions where id=p_current_session_id and user_id=p_user_id and revoked_at is null)then raise exception 'SESSION_NOT_FOUND';end if;
 update public.native_device_sessions set revoked_at=now(),updated_at=now()where user_id=p_user_id and id<>p_current_session_id and revoked_at is null;
 delete from auth.sessions where user_id=p_user_id and id<>p_current_session_id;
end $$;

revoke all on function public.observe_native_device_session(uuid,uuid,text,text,text),public.list_native_device_sessions(uuid),public.revoke_native_device_session(uuid,uuid),public.revoke_other_native_device_sessions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.observe_native_device_session(uuid,uuid,text,text,text),public.list_native_device_sessions(uuid),public.revoke_native_device_session(uuid,uuid),public.revoke_other_native_device_sessions(uuid,uuid) to service_role;

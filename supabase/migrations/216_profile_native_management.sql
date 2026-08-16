alter table public.profiles add column if not exists version integer not null default 1 check (version > 0);

create or replace function public.update_current_profile(
  p_expected_version integer,
  p_display_name text,
  p_avatar_url text,
  p_update_display_name boolean,
  p_update_avatar_url boolean
) returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare v_result public.profiles;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  update public.profiles set
    name = case when p_update_display_name then nullif(trim(p_display_name), '') else name end,
    avatar_url = case when p_update_avatar_url then p_avatar_url else avatar_url end,
    version = version + 1,
    updated_at = now()
  where id = auth.uid() and version = p_expected_version returning * into v_result;
  if v_result.id is null then raise exception 'PROFILE_VERSION_CONFLICT'; end if;
  return v_result;
end;
$$;
revoke all on function public.update_current_profile(integer, text, text, boolean, boolean) from public;
grant execute on function public.update_current_profile(integer, text, text, boolean, boolean) to authenticated;

drop policy if exists avatars_user_delete on storage.objects;
create policy avatars_user_delete on storage.objects for delete using (
  bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
);

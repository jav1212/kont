-- Portable user preferences shared by Web, Desktop, and Mobile.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  color_scheme text not null default 'system' check (color_scheme in ('light', 'dark', 'system')),
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  locale text not null default 'es-VE',
  time_zone text not null default 'America/Caracas',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
drop policy if exists user_preferences_self_read on public.user_preferences;
create policy user_preferences_self_read on public.user_preferences for select to authenticated using (user_id = auth.uid());
grant select on public.user_preferences to authenticated;

create or replace function public.update_user_preferences(
  p_expected_version integer,
  p_color_scheme text,
  p_density text,
  p_locale text,
  p_time_zone text
) returns public.user_preferences
language plpgsql security definer set search_path = public
as $$
declare v_result public.user_preferences;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_expected_version < 0 then raise exception 'PREFERENCES_VERSION_CONFLICT'; end if;

  if p_expected_version = 0 then
    insert into public.user_preferences (user_id, color_scheme, density, locale, time_zone, version)
    values (auth.uid(), p_color_scheme, p_density, trim(p_locale), trim(p_time_zone), 1)
    on conflict (user_id) do nothing returning * into v_result;
  else
    update public.user_preferences set
      color_scheme = p_color_scheme,
      density = p_density,
      locale = trim(p_locale),
      time_zone = trim(p_time_zone),
      version = version + 1,
      updated_at = now()
    where user_id = auth.uid() and version = p_expected_version
    returning * into v_result;
  end if;

  if v_result.user_id is null then raise exception 'PREFERENCES_VERSION_CONFLICT'; end if;
  return v_result;
end;
$$;
revoke all on function public.update_user_preferences(integer, text, text, text, text) from public;
grant execute on function public.update_user_preferences(integer, text, text, text, text) to authenticated;

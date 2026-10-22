-- Add per-user optional field and column visibility without changing the
-- existing appearance/regional preferences row or any business documents.
create table public.user_view_preferences (
    user_id uuid not null references auth.users(id) on delete cascade,
    view_id text not null check (view_id ~ '^[a-z][a-z0-9._-]{0,127}$'),
    hidden_field_ids text[] not null default '{}'::text[] check (cardinality(hidden_field_ids) <= 100),
    hidden_column_ids text[] not null default '{}'::text[] check (cardinality(hidden_column_ids) <= 100),
    version integer not null default 1 check (version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, view_id)
);

alter table public.user_view_preferences enable row level security;
create policy user_view_preferences_owner_read on public.user_view_preferences
    for select to authenticated using (user_id = auth.uid());
revoke all on table public.user_view_preferences from public, anon, authenticated;
grant select on table public.user_view_preferences to authenticated;

create function public.update_user_view_preferences(
    p_view_id text,
    p_hidden_field_ids text[],
    p_hidden_column_ids text[],
    p_expected_version integer
) returns public.user_view_preferences
language plpgsql security definer set search_path = public
as $function$
declare
    v_user_id uuid := auth.uid();
    v_fields text[] := coalesce(p_hidden_field_ids, '{}'::text[]);
    v_columns text[] := coalesce(p_hidden_column_ids, '{}'::text[]);
    v_count integer;
    v_distinct_count integer;
    v_result public.user_view_preferences;
begin
    if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
    if p_view_id is null or p_view_id !~ '^[a-z][a-z0-9._-]{0,127}$'
        or p_expected_version is null or p_expected_version < 0 or p_expected_version = 2147483647
        or cardinality(v_fields) > 100 or cardinality(v_columns) > 100
    then raise exception 'PREFERENCES_INVALID'; end if;

    if exists (select 1 from unnest(v_fields) as items(item) where item is null or item !~ '^[a-z][a-z0-9._-]{0,127}$')
        or exists (select 1 from unnest(v_columns) as items(item) where item is null or item !~ '^[a-z][a-z0-9._-]{0,127}$')
    then raise exception 'PREFERENCES_INVALID'; end if;

    select count(*), count(distinct item) into v_count, v_distinct_count from unnest(v_fields) as items(item);
    if v_count <> v_distinct_count then raise exception 'PREFERENCES_INVALID'; end if;
    select count(*), count(distinct item) into v_count, v_distinct_count from unnest(v_columns) as items(item);
    if v_count <> v_distinct_count then raise exception 'PREFERENCES_INVALID'; end if;

    -- Cap a user's registered view layouts; serialize first-row creation across concurrent clients.
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
    if p_expected_version = 0 then
        if not exists (select 1 from public.user_view_preferences where user_id = v_user_id and view_id = p_view_id)
            and (select count(*) from public.user_view_preferences where user_id = v_user_id) >= 100
        then raise exception 'PREFERENCES_INVALID'; end if;
        insert into public.user_view_preferences(user_id, view_id, hidden_field_ids, hidden_column_ids, version)
        values (v_user_id, p_view_id, v_fields, v_columns, 1)
        on conflict (user_id, view_id) do nothing
        returning * into v_result;
    else
        update public.user_view_preferences set
            hidden_field_ids = v_fields,
            hidden_column_ids = v_columns,
            version = version + 1,
            updated_at = clock_timestamp()
        where user_id = v_user_id and view_id = p_view_id and version = p_expected_version
        returning * into v_result;
    end if;

    if v_result.user_id is null then raise exception 'PREFERENCES_VERSION_CONFLICT'; end if;
    return v_result;
end;
$function$;

revoke all on function public.update_user_view_preferences(text, text[], text[], integer) from public, anon, authenticated;
grant execute on function public.update_user_view_preferences(text, text[], text[], integer) to authenticated;

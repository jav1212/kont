-- Bound authenticated preference RPC payloads to 64 KiB after JSONB normalization.
create or replace function public.update_user_process_defaults(
    p_process_id text,
    p_values jsonb,
    p_expected_version integer
) returns public.user_process_defaults
language plpgsql security definer set search_path = public
as $function$
declare
    v_user_id uuid := auth.uid();
    v_result public.user_process_defaults;
    v_value_count integer;
begin
    if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
    if p_process_id is null or p_process_id !~ '^[a-z][a-z0-9._-]{0,127}$'
        or p_expected_version is null or p_expected_version < 0 or p_expected_version = 2147483647
        or p_values is null or jsonb_typeof(p_values) <> 'object'
    then raise exception 'PREFERENCES_INVALID'; end if;
    select count(*) into v_value_count from jsonb_object_keys(p_values);
    if v_value_count > 100 or octet_length(p_values::text) > 65536
        or exists (select 1 from jsonb_each(p_values) e where e.key !~ '^[a-z][a-z0-9._-]{0,127}$' or jsonb_typeof(e.value) not in ('string','number','boolean','null'))
    then raise exception 'PREFERENCES_INVALID'; end if;

    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 1));
    if p_expected_version = 0 then
        if not exists (select 1 from public.user_process_defaults where user_id = v_user_id and process_id = p_process_id)
            and (select count(*) from public.user_process_defaults where user_id = v_user_id) >= 100
        then raise exception 'PREFERENCES_INVALID'; end if;
        insert into public.user_process_defaults(user_id, process_id, values, version)
        values (v_user_id, p_process_id, p_values, 1)
        on conflict (user_id, process_id) do nothing returning * into v_result;
    else
        update public.user_process_defaults set values = p_values, version = version + 1, updated_at = clock_timestamp()
        where user_id = v_user_id and process_id = p_process_id and version = p_expected_version returning * into v_result;
    end if;
    if v_result.user_id is null then raise exception 'PREFERENCES_VERSION_CONFLICT'; end if;
    return v_result;
end;
$function$;
revoke all on function public.update_user_process_defaults(text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.update_user_process_defaults(text,jsonb,integer) to authenticated;

-- Reversible smoke for ADM-043/044. Uses one existing auth user only as the
-- owner reference and rolls every preference row back before returning.
do $smoke$
declare
    v_user_id uuid;
    v_view_id text := 'adm043.smoke.' || gen_random_uuid()::text;
    v_first public.user_view_preferences;
    v_second public.user_view_preferences;
    v_before integer;
    v_after integer;
    v_rejected boolean;
begin
    select id into strict v_user_id from auth.users order by created_at limit 1;
    select count(*) into v_before from public.user_view_preferences where user_id = v_user_id and view_id = v_view_id;

    begin
        perform set_config('request.jwt.claim.sub', v_user_id::text, true);
        v_first := public.update_user_view_preferences(v_view_id, array[]::text[], array[]::text[], 0);
        if v_first.version <> 1 or cardinality(v_first.hidden_field_ids) <> 0 then raise exception 'ASSERT_CREATE'; end if;
        v_second := public.update_user_view_preferences(v_view_id, array['internal_note'], array['created_at'], 1);
        if v_second.version <> 2 or v_second.hidden_field_ids <> array['internal_note'] or v_second.hidden_column_ids <> array['created_at'] then raise exception 'ASSERT_UPDATE'; end if;

        v_rejected := false;
        begin
            perform public.update_user_view_preferences(v_view_id, array[]::text[], array[]::text[], 1);
        exception when others then
            v_rejected := sqlerrm = 'PREFERENCES_VERSION_CONFLICT';
            if not v_rejected then raise; end if;
        end;
        if not v_rejected then raise exception 'ASSERT_STALE_VERSION'; end if;

        v_rejected := false;
        begin
            perform public.update_user_view_preferences(v_view_id, array['Contains spaces'], array[]::text[], 2);
        exception when others then
            v_rejected := sqlerrm = 'PREFERENCES_INVALID';
            if not v_rejected then raise; end if;
        end;
        if not v_rejected then raise exception 'ASSERT_INVALID_FIELD'; end if;

        v_rejected := false;
        begin
            perform public.update_user_view_preferences(v_view_id, array['duplicate', 'duplicate'], array[]::text[], 2);
        exception when others then
            v_rejected := sqlerrm = 'PREFERENCES_INVALID';
            if not v_rejected then raise; end if;
        end;
        if not v_rejected then raise exception 'ASSERT_DUPLICATE_FIELD'; end if;

        v_rejected := false;
        begin
            perform public.update_user_view_preferences(v_view_id,
                array(select 'field_' || value::text from generate_series(1, 101) value), array[]::text[], 2);
        exception when others then
            v_rejected := sqlerrm = 'PREFERENCES_INVALID';
            if not v_rejected then raise; end if;
        end;
        if not v_rejected then raise exception 'ASSERT_FIELD_LIMIT'; end if;

        raise exception 'ROLLBACK_VIEW_PREFERENCES_SMOKE';
    exception when others then
        if sqlerrm <> 'ROLLBACK_VIEW_PREFERENCES_SMOKE' then raise; end if;
    end;

    select count(*) into v_after from public.user_view_preferences where user_id = v_user_id and view_id = v_view_id;
    if v_after <> v_before then raise exception 'ASSERT_SMOKE_FIXTURE_ROLLBACK'; end if;
end;
$smoke$;
